// カードの保存と状態（019）。形と経路は src/shared/card.ts で確かめ、経路の無い部品があれば保存を断る。
// どの読み書きもテナントで絞る。署名は署名の記録（051a・sign.ts の /:id/sign）からだけ行い、ここの状態の変更では受け付けない。
// 作ると監査の記録に ①元の文のどこから ②作る側が何をしたか、直すと ④、状態を移すとその 1 行が足される。
import { type Context, Hono } from "hono";
import { type CardBody, type CardStatus, canMove, STATUSES, validateCard } from "../shared/card";
import { aiDraftReasons } from "../shared/make/ai-draft";
import { type FixRequest, validateFix } from "../shared/fix";
import type { Term } from "../shared/make/words";
import { REDO_MAX, RedoError, redoCard } from "../shared/redo";
import { REWORK_MAX, REWORK_TEXT_MAX, ReworkError, reworkCard } from "../shared/rework";
import { summarize } from "../shared/stats";
import { bodyAt, type EditRow, UndoError, undoTarget } from "../shared/undo";
import { type Evidence, hasEvidence, verifyCard } from "../shared/verify/formal";
import { D1CallLog } from "./api-log";
import { appendAudit } from "./audit";
import { claudeClient } from "./claude-client";
import { addCompanyWords, addEditWords, callsFromTerms } from "./company-words";
import { type PeopleVars, personName } from "./people";
import { createRecall, readReason } from "./recall";
import { cleanupCardSessions, listUsedExemplars, sessionDeleter } from "./exemplars";
import { actorOf as personActor, recordOpen, signatureOf, signCard } from "./sign";
import type { Env } from "./env";
import type { TenantVars } from "./tenant";

export const cards = new Hono<{ Bindings: Env; Variables: TenantVars }>();
type Ctx = Context<{ Bindings: Env; Variables: TenantVars }>;

export interface CardRow {
  id: string;
  tenant_id: string;
  body: string;
  status: CardStatus;
  version: number;
  created_at: string;
  updated_at: string;
  /** 監修者に確認してほしい理由（039）。無ければ null */
  ask: string | null;
}

const COLS = "id, tenant_id, body, status, version, created_at, updated_at, ask";
export const ASK_MAX = 300;

export async function getCard(db: D1Database, tenantId: string, id: string) {
  return db.prepare(`SELECT ${COLS} FROM cards WHERE id = ? AND tenant_id = ?`).bind(id, tenantId).first<CardRow>();
}

export const cardView = (r: CardRow) => ({ id: r.id, status: r.status, version: r.version, created_at: r.created_at, updated_at: r.updated_at, ask: r.ask ?? null, body: JSON.parse(r.body) as CardBody });

/** 「監修者に確認」の理由を受け取る。空なら undefined、文字でなければ null（断る） */
export function readAsk(x: unknown): string | undefined | null {
  if (x === undefined || x === null || x === "") return undefined;
  if (typeof x !== "string") return null;
  return x.trim().slice(0, ASK_MAX) || undefined;
}

type Payload = { card?: CardBody; actor?: string; reason?: string; ask?: unknown };
const readBody = async (c: { req: { json: <T>() => Promise<T> } }) => c.req.json<Payload>().catch(() => ({}) as Payload);
const actorOf = (b: Payload, fallback: string) => (typeof b.actor === "string" && b.actor.trim() ? b.actor.trim().slice(0, 40) : fallback);

/** ① 元の文のどこから: 文ごとの元の位置と、部品ごとの経路 */
export const sourcePayload = (card: CardBody) => ({
  statements: card.statements.map((s) => ({ id: s.id, field: s.field, text: s.text, sources: s.sources })),
  routes: card.parts.map((p) => ({ part: p.id, target: p.target, statement: p.statement })),
});

/** ② 作る側が何をしたか: 項目と、動き・コマ・部品 */
export const makePayload = (card: CardBody) => ({ rule: card.rule, why: card.why, motion: card.motion, frames: card.frames, parts: card.parts });

/** 署名の行の actor（"supervisor.1"）を、役割・番号・名前（環境変数。無ければ空欄）にする */
function signerOf(env: Env, actor: string) {
  const [role, n] = actor.split(".");
  const slot = n === "2" ? 2 : 1;
  return { role, slot, name: role === "supervisor" ? personName(env, { role: "supervisor", slot }) : "" };
}

/** 資料の名前（11/6 作者）。環境変数 DOC_LABELS（{"資料の鍵": "見せる名前"} の JSON）から。読めなければ空 */
export function docLabels(env: Env): Record<string, string> {
  try {
    const o = JSON.parse(env.DOC_LABELS ?? "{}") as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => [k, (v as string).trim()]));
  } catch {
    return {};
  }
}

cards.get("/", async (c) => {
  const db = c.env.DB;
  const tid = c.var.tenant.id;
  const { results } = await db.prepare(`SELECT ${COLS} FROM cards WHERE tenant_id = ? ORDER BY created_at, id`).bind(tid).all<CardRow>();
  // ホームのまとめ（11/5）: 署名したことのあるカードは、最後の署名の人と日時を添える（止めたあとも残す）
  const signs = await db
    .prepare("SELECT card_id, actor, json_extract(payload, '$.signed_at') AS at FROM audit_log WHERE tenant_id = ? AND kind = 'sign' ORDER BY created_at, n")
    .bind(tid)
    .all<{ card_id: string; actor: string; at: string }>();
  const last = new Map(signs.results.map((r) => [r.card_id, r]));
  // 監修者に見てもらう組（11/6 作者「見てもらう 20 枚のタブ」）。環境変数 REVIEW_CARDS の順で、このテナントにあるカードだけ
  const have = new Set(results.map((r) => r.id));
  const review = (c.env.REVIEW_CARDS ?? "").split(/[\s,]+/).filter((id) => id && have.has(id));
  return c.json({
    cards: results.map((r) => {
      const s = last.get(r.id);
      return { ...cardView(r), signed: s ? { ...signerOf(c.env, s.actor), at: s.at } : null };
    }),
    review,
    docs: docLabels(c.env),
  });
});

// いつも出しておく数字（048）: 危ない読み違いの枚数・1 枚の分・伝わる率
cards.get("/stats", async (c) => {
  const db = c.env.DB;
  const tid = c.var.tenant.id;
  const { results } = await db.prepare(`SELECT ${COLS} FROM cards WHERE tenant_id = ? AND status != 'stopped'`).bind(tid).all<CardRow>();
  const ev = (await Promise.all(results.map((r) => currentEvidence(db, tid, r)))).filter((e): e is Evidence => !!e);
  const signs = await db.prepare("SELECT payload FROM audit_log WHERE tenant_id = ? AND kind = 'sign'").bind(tid).all<{ payload: string }>();
  return c.json(summarize(ev, signs.results.map((r) => (JSON.parse(r.payload) as { minutes?: number | null }).minutes ?? null)));
});

/**
 * 未承認の下書きとして保存し、監査の記録に ① と ② を足す（034a の作成からも使う）。
 * 元の文に無い理由か数字があれば「AI 下書き」で保存し、その理由を監査の記録に残す（035）。origins は元の文の抜き出し。
 * ask は「監修者に確認」の理由（039）。② の行にも残す
 */
export async function createCard(db: D1Database, tenantId: string, card: CardBody, actor: string, origins?: string[], ask?: string): Promise<CardRow> {
  const id = crypto.randomUUID();
  const reasons = aiDraftReasons(card, origins);
  await db.prepare("INSERT INTO cards (id, tenant_id, body, status, version, updated_at, ask) VALUES (?, ?, ?, ?, 1, datetime('now'), ?)").bind(id, tenantId, JSON.stringify(card), reasons.length ? "ai_draft" : "draft", ask ?? null).run();
  await appendAudit(db, tenantId, { card_id: id, kind: "source", actor, payload: { version: 1, ...sourcePayload(card) } });
  await appendAudit(db, tenantId, { card_id: id, kind: "make", actor, payload: { version: 1, ...makePayload(card), ...(ask ? { ask } : {}) } });
  if (reasons.length) await appendAudit(db, tenantId, { card_id: id, kind: "ai_draft", actor: "system", payload: { version: 1, reasons } });
  return (await getCard(db, tenantId, id))!;
}

cards.post("/", async (c) => {
  const b = await readBody(c);
  const card = b.card as CardBody;
  const errs = validateCard(card);
  if (errs.length) return c.json({ error: "カードの形か経路が足りない", errors: errs }, 400);
  const ask = readAsk(b.ask);
  if (ask === null) return c.json({ error: "ask は文字" }, 400);
  return c.json(cardView(await createCard(c.env.DB, c.var.tenant.id, card, actorOf(b, "maker"), undefined, ask)), 201);
});

/** 用語表に積む（036）。同じカードの同じ言葉は 1 行 */
export async function addTerms(db: D1Database, tenantId: string, cardId: string, terms: Term[]) {
  if (!terms.length) return;
  await db.batch(terms.map((t) => db.prepare("INSERT OR IGNORE INTO glossary (tenant_id, ja, vi, card_id) VALUES (?, ?, ?, ?)").bind(tenantId, t.ja.slice(0, 80), t.vi.slice(0, 120), cardId)));
  // 会社の言葉（085）: 用語表の言葉を、会社の呼び方として積む
  await addCompanyWords(db, tenantId, callsFromTerms(terms), "glossary", cardId);
}

// 用語表: 日本語ごとに、ベトナム語（カードによって違えば全部）と、どのカードで使うか
cards.get("/glossary", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT ja, vi, card_id, checked FROM glossary WHERE tenant_id = ? ORDER BY ja, created_at").bind(c.var.tenant.id).all<{ ja: string; vi: string; card_id: string; checked: number }>();
  const byJa = new Map<string, { ja: string; vi: string[]; cards: string[]; checked: boolean }>();
  for (const r of results) {
    const t = byJa.get(r.ja) ?? { ja: r.ja, vi: [], cards: [], checked: true };
    if (!t.vi.includes(r.vi)) t.vi.push(r.vi);
    t.cards.push(r.card_id);
    t.checked &&= r.checked === 1;
    byJa.set(r.ja, t);
  }
  return c.json({ terms: [...byJa.values()] });
});

/** 今の版の確かめる AI の証拠（監査の記録 ③ の最後の 1 行）。無ければ null（確認待ち） */
export async function currentEvidence(db: D1Database, tenantId: string, r: CardRow): Promise<Evidence | null> {
  const { results } = await db
    .prepare("SELECT payload FROM audit_log WHERE tenant_id = ? AND card_id = ? AND kind = 'verify' ORDER BY created_at DESC, n DESC LIMIT 20")
    .bind(tenantId, r.id)
    .all<{ payload: string }>();
  const frames = (JSON.parse(r.body) as CardBody).frames.length;
  for (const row of results) {
    const p = JSON.parse(row.payload) as { version?: number; evidence?: unknown };
    if (p.version === r.version) return hasEvidence(p.evidence, frames) ? p.evidence : null;
  }
  return null;
}

cards.get("/:id", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  return r ? c.json({ ...cardView(r), verify: await currentEvidence(c.env.DB, c.var.tenant.id, r) }) : c.json({ error: "カードが無い" }, 404);
});

const PNG_MAX = 3_000_000;
const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");

// 署名の記録（051a）: 開いた時刻を残す・署名する・署名と今の中身が合うかを見る
cards.post("/:id/open", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!r) return c.json({ error: "カードが無い" }, 404);
  const person = (c.var as PeopleVars).person;
  return c.json({ version: r.version, opened_at: await recordOpen(c.env.DB, c.var.tenant.id, r, personActor(person)) });
});

cards.post("/:id/sign", async (c) => {
  const b = await c.req.json<{ version?: unknown; mark?: unknown }>().catch(() => ({}) as { version?: unknown; mark?: unknown });
  const res = await signCard(c.env.DB, c.var.tenant.id, c.req.param("id"), (c.var as PeopleVars).person, b.version, b.mark);
  if (!res.ok) return c.json({ error: res.error }, res.status);
  // 後片付け（086・§5 L4）: 署名済みになったカードの Managed Agents のセッションを消し、消した時刻を残す
  const sessions = await cleanupCardSessions(c.env.DB, c.var.tenant.id, c.req.param("id"), sessionDeleter(c.env));
  const { mark, ...rest } = res.payload;
  return c.json({ signed: true, ...rest, mark: { kind: mark.kind, sha256: mark.sha256 }, sessions });
});

// 手本にしたもの（087）: このカードを作るときに渡した、同じ会社の前の直しと署名済みのカード（日付・誰〈役割〉）
cards.get("/:id/exemplars", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  return r ? c.json({ used: await listUsedExemplars(c.env.DB, c.var.tenant.id, r.id) }) : c.json({ error: "カードが無い" }, 404);
});

cards.get("/:id/signature", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  return r ? c.json(await signatureOf(c.env.DB, c.var.tenant.id, r)) : c.json({ error: "カードが無い" }, 404);
});

// 確かめる AI の正式版（047）: コマの PNG（描く側が JSON から作ったもの）を順に受け取り、サーバーから確かめる AI を呼び、
// 証拠を監査の記録 ③ に残す。証拠は画面やスクリプトから書き込めない（ここでしか作らない）。PNG はハッシュを残す
cards.post("/:id/verify", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!r) return c.json({ error: "カードが無い" }, 404);
  if (r.status === "signed" || r.status === "stopped") return c.json({ error: "署名済みか停止したカードは確かめ直さない" }, 409);
  const body = JSON.parse(r.body) as CardBody;
  const b = await c.req.json<{ frames?: unknown }>().catch(() => ({}) as { frames?: unknown });
  const frames = Array.isArray(b.frames) ? b.frames : [];
  if (frames.length !== body.frames.length || !frames.every((f) => typeof f === "string")) return c.json({ error: `コマの PNG を ${body.frames.length} 枚、順に送る` }, 400);
  const b64 = (frames as string[]).map((f) => f.replace(/^data:image\/png;base64,/, ""));
  let bytes: Uint8Array<ArrayBuffer>[];
  try {
    bytes = b64.map((f) => Uint8Array.from(atob(f), (ch) => ch.charCodeAt(0)));
  } catch {
    return c.json({ error: "base64 で読めない" }, 400);
  }
  if (!bytes.every((x) => isPng(x) && x.length <= PNG_MAX)) return c.json({ error: "PNG ではないか、大きすぎる" }, 400);
  const client = claudeClient(c.env);
  if (!client) return c.json({ error: "Claude の鍵が無い" }, 503);
  const images = bytes.map((_, i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: b64[i] } }));
  let evidence: Evidence;
  try {
    evidence = await verifyCard({ client, log: new D1CallLog(c.env.DB) }, "app", body, images);
  } catch (e) {
    return c.json({ error: `確かめる AI が答えなかった: ${(e as Error).message}` }, 502);
  }
  const png_sha256 = await Promise.all(bytes.map(async (x) => hex(await crypto.subtle.digest("SHA-256", x as Uint8Array<ArrayBuffer>))));
  await appendAudit(c.env.DB, c.var.tenant.id, { card_id: r.id, kind: "verify", actor: evidence.agent, payload: { version: r.version, evidence, png_sha256 } });
  return c.json({ version: r.version, evidence });
});

/**
 * 署名済み・停止のカードを直したとき（11/5 作者「承認済みも全部編集できるように」）。新しい版は下書きに戻り、署名は外れる。
 * 状態が移った 1 行を監査に足し、署名済みだったなら、前の版を印刷した人が回収できるよう回収の知らせを出す（止めたときと同じ）
 */
async function reopenOnEdit(db: D1Database, tenantId: string, r: CardRow, to: CardStatus, by: string, why: string) {
  if (r.status !== "signed" && r.status !== "stopped") return;
  const reason = `直したため（版 ${r.version} → ${r.version + 1}）: ${why}`.slice(0, 200);
  await appendAudit(db, tenantId, { card_id: r.id, kind: "status", actor: by, payload: { version: r.version, from: r.status, to, reason } });
  if (r.status === "signed") await createRecall(db, tenantId, r, by, reason);
}

// 中身を直すと版が 1 つ上がり、未承認の下書きに戻る（AI が書いた文が残っていれば AI 下書き）。
// 署名済みも直せる。直すと署名が外れ、前の版に回収の知らせが出る（reopenOnEdit）。配るには確かめ直して署名し直す
cards.put("/:id", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!r) return c.json({ error: "カードが無い" }, 404);
  const b = await readBody(c);
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 1000) : "";
  return saveEdit(c, r, b.card as CardBody, reason, actorOf(b, "editor"));
});

/**
 * 直した中身を保存する（PUT と戻すで共通）。版を 1 つ上げ、④ に前と後・直した人・日時・理由を足す。
 * extra は記録の行に足す欄（戻すときの request・restored）
 */
async function saveEdit(c: Ctx, r: CardRow, card: CardBody, reason: string, fallbackBy: string, extra: Record<string, unknown> = {}) {
  const errs = validateCard(card);
  if (errs.length) return c.json({ error: "カードの形か経路が足りない", errors: errs }, 400);
  const before = JSON.parse(r.body) as CardBody;
  const changed = (Object.keys({ ...before, ...card }) as (keyof CardBody)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(card[k]));
  // 修正の差分（050）: 何も変わらない直しは記録も版も増やさない。理由の無い直しは受けない
  if (!changed.length) return c.json({ ...cardView(r), changed });
  if (!reason) return c.json({ error: "直した理由が要る" }, 400);
  // 直した人は役割のしるしから取る（しるしの無い手元の呼び出しだけ、送られた名前を使う）
  const person = (c.var as PeopleVars).person;
  const by = person ? personActor(person) : fallbackBy;
  await appendAudit(c.env.DB, c.var.tenant.id, {
    card_id: r.id,
    kind: "edit",
    actor: by,
    payload: { ...extra, from_version: r.version, to_version: r.version + 1, fields: changed, before: Object.fromEntries(changed.map((k) => [k, before[k] ?? null])), after: Object.fromEntries(changed.map((k) => [k, card[k] ?? null])), by, edited_at: new Date().toISOString(), reason },
  });
  // 会社の言葉（085）: 直しの前と後から、言い換えと使わない言い方を積む
  await addEditWords(c.env.DB, c.var.tenant.id, r.id, before as unknown as Record<string, unknown>, card as unknown as Record<string, unknown>);
  const reasons = aiDraftReasons(card);
  await c.env.DB.prepare("UPDATE cards SET body = ?, status = ?, version = version + 1, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
    .bind(JSON.stringify(card), reasons.length ? "ai_draft" : "draft", r.id, c.var.tenant.id)
    .run();
  await reopenOnEdit(c.env.DB, c.var.tenant.id, r, reasons.length ? "ai_draft" : "draft", by, reason);
  if (reasons.length) await appendAudit(c.env.DB, c.var.tenant.id, { card_id: r.id, kind: "ai_draft", actor: "system", payload: { version: r.version + 1, reasons } });
  return c.json(cardView((await getCard(c.env.DB, c.var.tenant.id, r.id))!));
}

// 元に戻す（11/6）: 1 つ前の版の中身に戻す。戻すのも直しの 1 つで、版を 1 つ上げて ④ に理由・直した人・日時を残す（記録は消さない）。
// 続けて押すと、さらに 1 つ前へ戻る。前の版が無い・記録から組み立てられないときは断る。
// to（版の番号）を付けると、その版の中身に戻す（11/6 作者「元の状態に戻す（デフォルトリセット）」は to: 1）
cards.post("/:id/undo", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!r) return c.json({ error: "カードが無い" }, 404);
  const b = await readBody(c);
  const rows = (
    await c.env.DB.prepare("SELECT payload FROM audit_log WHERE tenant_id = ? AND card_id = ? AND kind = 'edit' AND json_extract(payload, '$.to_version') IS NOT NULL ORDER BY created_at DESC")
      .bind(c.var.tenant.id, r.id)
      .all<{ payload: string }>()
  ).results.map((x) => JSON.parse(x.payload) as EditRow);
  let target: number;
  let body: CardBody;
  try {
    if ((b as { to?: unknown }).to !== undefined) {
      const to = Number((b as { to?: unknown }).to);
      if (!Number.isInteger(to) || to < 1) return c.json({ error: "to は 1 以上の版の番号" }, 400);
      if (to >= r.version) return c.json({ error: "今の版か、それより後の版には戻せない" }, 409);
      target = to;
    } else target = undoTarget(r.version, rows);
    body = bodyAt(JSON.parse(r.body) as CardBody, r.version, rows, target);
  } catch (e) {
    if (e instanceof UndoError) return c.json({ error: e.message }, 409);
    throw e;
  }
  const why = typeof b.reason === "string" && b.reason.trim() ? b.reason.trim().slice(0, 1000) : "";
  const reason = `元に戻す（版 ${r.version} → 版 ${target} の中身）${why ? `: ${why}` : ""}`;
  return saveEdit(c, r, body, reason, actorOf(b, "supervisor"), { request: "undo", restored: target });
});

// 枠と指示（044a）: 直したい部分の枠と「ここをこうしたい」を ④ 人の直しの 1 行として残す。作り直すのは 044b。
// 署名済み・停止のカードにも送れる（11/5）。送っただけでは状態は変わらず、作り直して版が上がったときに署名が外れる
cards.post("/:id/fix", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!r) return c.json({ error: "カードが無い" }, 404);
  const b = await c.req.json<Partial<FixRequest> & { actor?: string }>().catch(() => null);
  const body = JSON.parse(r.body) as CardBody;
  const errs = validateFix(b, body.frames.length);
  if (errs.length) return c.json({ error: "枠か文が足りない", errors: errs }, 400);
  const req = { frame: b!.frame!, t: body.frames[b!.frame!].t, box: b!.box!, text: b!.text!.trim() };
  const e = await appendAudit(c.env.DB, c.var.tenant.id, { card_id: r.id, kind: "edit", actor: actorOf(b as Payload, "supervisor"), payload: { request: "redo", version: r.version, ...req } });
  return c.json({ n: e.n, version: r.version, ...req }, 202);
});

// その 1 枚だけ作り直す（044b）: ④ の依頼（044a）を読み、枠に入った部品だけを作り直して版を 1 つ上げる。
// 経路（部品 → 文 → 元の文）は変えない。1 枚につき 5 回まで（6 回目は断る）。新しい版は確かめ直すまで確認待ち
cards.post("/:id/redo", async (c) => {
  const db = c.env.DB;
  const tid = c.var.tenant.id;
  const r = await getCard(db, tid, c.req.param("id"));
  if (!r) return c.json({ error: "カードが無い" }, 404);
  const b = await c.req.json<{ n?: number }>().catch(() => ({}) as { n?: number });
  const row = Number.isInteger(b.n) ? await db.prepare("SELECT payload FROM audit_log WHERE tenant_id = ? AND card_id = ? AND n = ? AND kind = 'edit'").bind(tid, r.id, b.n).first<{ payload: string }>() : null;
  const ask = row ? (JSON.parse(row.payload) as { request?: string; version?: number } & FixRequest) : null;
  if (!ask || ask.request !== "redo") return c.json({ error: "直しの依頼（④ の行の番号）が無い" }, 400);
  if (ask.version !== r.version) return c.json({ error: `依頼は版 ${ask.version} への。今は版 ${r.version} なので、枠を描き直して送る` }, 409);
  const done = await db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE tenant_id = ? AND card_id = ? AND kind = 'edit' AND json_extract(payload, '$.request') = 'redone'").bind(tid, r.id).first<{ n: number }>();
  if ((done?.n ?? 0) >= REDO_MAX) return c.json({ error: `作り直しは 1 枚 ${REDO_MAX} 回まで。文から作り直すか、監修者が手で直す`, count: done!.n }, 429);
  const client = claudeClient(c.env);
  if (!client) return c.json({ error: "Claude の鍵が無い" }, 503);
  const before = JSON.parse(r.body) as CardBody;
  let out;
  try {
    out = await redoCard({ client, log: new D1CallLog(db) }, "app", before, ask.frame, ask.box, ask.text);
  } catch (e) {
    return c.json({ error: (e as Error).message }, e instanceof RedoError ? e.status : 502);
  }
  const errs = validateCard(out.body);
  if (errs.length) return c.json({ error: "作り直したカードの形か経路が足りない", errors: errs }, 502);
  const res = await db.prepare("UPDATE cards SET body = ?, status = ?, version = version + 1, updated_at = datetime('now') WHERE id = ? AND tenant_id = ? AND version = ?")
    .bind(JSON.stringify(out.body), aiDraftReasons(out.body).length ? "ai_draft" : "draft", r.id, tid, r.version)
    .run();
  if (!res.meta.changes) return c.json({ error: "ほかの操作と重なった。読み直して" }, 409);
  // 署名済み・停止のカードを作り直したときは、署名が外れて前の版に回収の知らせが出る（11/5）
  await reopenOnEdit(db, tid, r, aiDraftReasons(out.body).length ? "ai_draft" : "draft", "maker", ask.text);
  const count = (done?.n ?? 0) + 1;
  const key = (body: CardBody) => (body.motion.kind === "keyframes" ? body.motion.json.keyframes[out.keyIndex] : null);
  await appendAudit(db, tid, {
    card_id: r.id,
    kind: "edit",
    actor: "maker",
    payload: { request: "redone", from_n: b.n, from_version: r.version, to_version: r.version + 1, frame: ask.frame, parts: out.targets.parts, figures: out.targets.figures, props: out.targets.props, before: key(before), after: key(out.body), count },
  });
  return c.json({ ...cardView((await getCard(db, tid, r.id))!), redo: { ...out.targets, count, left: REDO_MAX - count } });
});

// 言葉で直す（11/6）: 監修者・作者の口語の頼みで、カード全体（frame が null）か 1 コマ（frame が番号）を作り直し、新しい版として保存する。
// AI の呼び方・費用の上限・用途はその 1 枚の作り直し（/:id/redo）と同じ。1 枚につき 5 回まで。保存は直しと同じ saveEdit で、状態は下書きに戻る
cards.post("/:id/rework", async (c) => {
  const db = c.env.DB;
  const tid = c.var.tenant.id;
  const r = await getCard(db, tid, c.req.param("id"));
  if (!r) return c.json({ error: "カードが無い" }, 404);
  const b = await c.req.json<{ text?: unknown; frame?: unknown; actor?: string }>().catch(() => ({}) as { text?: unknown; frame?: unknown; actor?: string });
  const text = typeof b.text === "string" ? b.text.trim().slice(0, REWORK_TEXT_MAX) : "";
  if (!text) return c.json({ error: "頼み（text）が空" }, 400);
  const before = JSON.parse(r.body) as CardBody;
  const frame = b.frame === undefined || b.frame === null ? null : b.frame;
  if (frame !== null && !(Number.isInteger(frame) && (frame as number) >= 0 && (frame as number) < before.frames.length)) return c.json({ error: "frame は null かコマの番号" }, 400);
  const done = await db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE tenant_id = ? AND card_id = ? AND kind = 'edit' AND json_extract(payload, '$.request') = 'rework'").bind(tid, r.id).first<{ n: number }>();
  if ((done?.n ?? 0) >= REWORK_MAX) return c.json({ error: `言葉で直すのは 1 枚 ${REWORK_MAX} 回まで。部品を枠で囲んで直すか、指で動かして直す`, count: done!.n }, 429);
  const client = claudeClient(c.env);
  if (!client) return c.json({ error: "Claude の鍵が無い" }, 503);
  let out;
  try {
    out = await reworkCard({ client, log: new D1CallLog(db) }, "app", before, text, frame as number | null);
  } catch (e) {
    return c.json({ error: (e as Error).message }, e instanceof ReworkError ? e.status : 502);
  }
  const res = await saveEdit(c, r, out.body, `言葉で直した: ${text}`.slice(0, 1000), actorOf({ actor: b.actor }, "supervisor"), { request: "rework", frame, text });
  if (res.status !== 200) return res;
  const view = (await res.json()) as { changed?: unknown };
  // 何も変わらなかったときは版も記録も増えないので、回数にも数えない
  const count = (done?.n ?? 0) + (Array.isArray(view.changed) ? 0 : 1);
  return c.json({ ...view, rework: { count, left: REWORK_MAX - count } });
});

cards.post("/:id/status", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!r) return c.json({ error: "カードが無い" }, 404);
  const b = await c.req.json<{ to?: CardStatus; actor?: string; reason?: string }>().catch(() => ({}) as { to?: CardStatus; actor?: string; reason?: string });
  const to = b.to;
  // 停止の理由（088）。署名済みを止めると回収の知らせに載る。書くなら 200 字まで
  const reason = readReason(b.reason);
  if (reason === null) return c.json({ error: "reason は文字" }, 400);
  if (!STATUSES.includes(to as CardStatus)) return c.json({ error: "to が状態の名前ではない" }, 400);
  if (to === "signed") return c.json({ error: "署名は署名の記録からだけ" }, 403);
  if (!canMove(r.status, to!)) return c.json({ error: `${r.status} から ${to} へは移れない` }, 409);
  // 確認待ちの関門（047）: 今の版に確かめる AI の証拠が無ければ OK にしない
  if (to === "ok") {
    const ev = await currentEvidence(c.env.DB, c.var.tenant.id, r);
    if (!ev) return c.json({ error: "確認待ち: 確かめる AI の証拠（どの絵を見て・何点で・なぜか）が無いので OK できない" }, 409);
    // 危険の印（048）: 危ない行為をしてよいと読める絵は、直して確かめ直すまで OK にしない
    if (ev.dangerous) return c.json({ error: "危険の印: 危ない行為をしてよいと読める絵なので、直して確かめ直すまで OK できない" }, 409);
  }
  const res = await c.env.DB.prepare("UPDATE cards SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ? AND status = ?").bind(to, r.id, c.var.tenant.id, r.status).run();
  if (!res.meta.changes) return c.json({ error: "ほかの操作と重なった。読み直して" }, 409);
  await appendAudit(c.env.DB, c.var.tenant.id, { card_id: r.id, kind: "status", actor: actorOf(b, "system"), payload: { version: r.version, from: r.status, to, ...(to === "stopped" ? { reason } : {}) } });
  // 署名済みを止めたら、印刷したカードを回収できるよう、版と署名の日付つきの知らせを教育担当に出す（088）
  if (r.status === "signed" && to === "stopped") await createRecall(c.env.DB, c.var.tenant.id, r, personActor((c.var as PeopleVars).person), reason);
  return c.json(cardView((await getCard(c.env.DB, c.var.tenant.id, r.id))!));
});
