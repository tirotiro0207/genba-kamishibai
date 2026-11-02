// カードの保存と状態（019）。形と経路は src/shared/card.ts で確かめ、経路の無い部品があれば保存を断る。
// どの読み書きもテナントで絞る。署名は署名の記録（051a・sign.ts の /:id/sign）からだけ行い、ここの状態の変更では受け付けない。
// 作ると監査の記録に ①元の文のどこから ②作る側が何をしたか、直すと ④、状態を移すとその 1 行が足される。
import { Hono } from "hono";
import { type CardBody, type CardStatus, canMove, STATUSES, validateCard } from "../shared/card";
import { aiDraftReasons } from "../shared/make/ai-draft";
import { type FixRequest, validateFix } from "../shared/fix";
import type { Term } from "../shared/make/words";
import { summarize } from "../shared/stats";
import { type Evidence, hasEvidence, verifyCard } from "../shared/verify/formal";
import { D1CallLog } from "./api-log";
import { appendAudit } from "./audit";
import { claudeClient } from "./claude-client";
import type { PeopleVars } from "./people";
import { actorOf as personActor, recordOpen, signatureOf, signCard } from "./sign";
import type { Env } from "./env";
import type { TenantVars } from "./tenant";

export const cards = new Hono<{ Bindings: Env; Variables: TenantVars }>();

export interface CardRow {
  id: string;
  tenant_id: string;
  body: string;
  status: CardStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

const COLS = "id, tenant_id, body, status, version, created_at, updated_at";

export async function getCard(db: D1Database, tenantId: string, id: string) {
  return db.prepare(`SELECT ${COLS} FROM cards WHERE id = ? AND tenant_id = ?`).bind(id, tenantId).first<CardRow>();
}

export const cardView = (r: CardRow) => ({ id: r.id, status: r.status, version: r.version, created_at: r.created_at, updated_at: r.updated_at, body: JSON.parse(r.body) as CardBody });

type Payload = { card?: CardBody; actor?: string; reason?: string };
const readBody = async (c: { req: { json: <T>() => Promise<T> } }) => c.req.json<Payload>().catch(() => ({}) as Payload);
const actorOf = (b: Payload, fallback: string) => (typeof b.actor === "string" && b.actor.trim() ? b.actor.trim().slice(0, 40) : fallback);

/** ① 元の文のどこから: 文ごとの元の位置と、部品ごとの経路 */
export const sourcePayload = (card: CardBody) => ({
  statements: card.statements.map((s) => ({ id: s.id, field: s.field, text: s.text, sources: s.sources })),
  routes: card.parts.map((p) => ({ part: p.id, target: p.target, statement: p.statement })),
});

/** ② 作る側が何をしたか: 項目と、動き・コマ・部品 */
export const makePayload = (card: CardBody) => ({ rule: card.rule, why: card.why, motion: card.motion, frames: card.frames, parts: card.parts });

cards.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT ${COLS} FROM cards WHERE tenant_id = ? ORDER BY created_at, id`).bind(c.var.tenant.id).all<CardRow>();
  return c.json({ cards: results.map(cardView) });
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
 * 元の文に無い理由か数字があれば「AI 下書き」で保存し、その理由を監査の記録に残す（035）。origins は元の文の抜き出し
 */
export async function createCard(db: D1Database, tenantId: string, card: CardBody, actor: string, origins?: string[]): Promise<CardRow> {
  const id = crypto.randomUUID();
  const reasons = aiDraftReasons(card, origins);
  await db.prepare("INSERT INTO cards (id, tenant_id, body, status, version, updated_at) VALUES (?, ?, ?, ?, 1, datetime('now'))").bind(id, tenantId, JSON.stringify(card), reasons.length ? "ai_draft" : "draft").run();
  await appendAudit(db, tenantId, { card_id: id, kind: "source", actor, payload: { version: 1, ...sourcePayload(card) } });
  await appendAudit(db, tenantId, { card_id: id, kind: "make", actor, payload: { version: 1, ...makePayload(card) } });
  if (reasons.length) await appendAudit(db, tenantId, { card_id: id, kind: "ai_draft", actor: "system", payload: { version: 1, reasons } });
  return (await getCard(db, tenantId, id))!;
}

cards.post("/", async (c) => {
  const b = await readBody(c);
  const card = b.card as CardBody;
  const errs = validateCard(card);
  if (errs.length) return c.json({ error: "カードの形か経路が足りない", errors: errs }, 400);
  return c.json(cardView(await createCard(c.env.DB, c.var.tenant.id, card, actorOf(b, "maker"))), 201);
});

/** 用語表に積む（036）。同じカードの同じ言葉は 1 行 */
export async function addTerms(db: D1Database, tenantId: string, cardId: string, terms: Term[]) {
  if (!terms.length) return;
  await db.batch(terms.map((t) => db.prepare("INSERT OR IGNORE INTO glossary (tenant_id, ja, vi, card_id) VALUES (?, ?, ?, ?)").bind(tenantId, t.ja.slice(0, 80), t.vi.slice(0, 120), cardId)));
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
  const b = await c.req.json<{ version?: unknown }>().catch(() => ({}) as { version?: unknown });
  const res = await signCard(c.env.DB, c.var.tenant.id, c.req.param("id"), (c.var as PeopleVars).person, b.version);
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ signed: true, ...res.payload });
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

// 中身を直すと版が 1 つ上がり、未承認の下書きに戻る（AI が書いた文が残っていれば AI 下書き）。署名済みは先に停止する
cards.put("/:id", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!r) return c.json({ error: "カードが無い" }, 404);
  if (r.status === "signed") return c.json({ error: "署名済みのカードは直せない（先に停止）" }, 409);
  const b = await readBody(c);
  const card = b.card as CardBody;
  const errs = validateCard(card);
  if (errs.length) return c.json({ error: "カードの形か経路が足りない", errors: errs }, 400);
  const before = JSON.parse(r.body) as CardBody;
  const changed = (Object.keys({ ...before, ...card }) as (keyof CardBody)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(card[k]));
  await appendAudit(c.env.DB, c.var.tenant.id, {
    card_id: r.id,
    kind: "edit",
    actor: actorOf(b, "editor"),
    payload: { from_version: r.version, to_version: r.version + 1, fields: changed, before: Object.fromEntries(changed.map((k) => [k, before[k] ?? null])), after: Object.fromEntries(changed.map((k) => [k, card[k] ?? null])), reason: typeof b.reason === "string" ? b.reason.slice(0, 1000) : null },
  });
  const reasons = aiDraftReasons(card);
  await c.env.DB.prepare("UPDATE cards SET body = ?, status = ?, version = version + 1, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
    .bind(JSON.stringify(card), reasons.length ? "ai_draft" : "draft", r.id, c.var.tenant.id)
    .run();
  if (reasons.length) await appendAudit(c.env.DB, c.var.tenant.id, { card_id: r.id, kind: "ai_draft", actor: "system", payload: { version: r.version + 1, reasons } });
  return c.json(cardView((await getCard(c.env.DB, c.var.tenant.id, r.id))!));
});

// 枠と指示（044a）: 直したい部分の枠と「ここをこうしたい」を ④ 人の直しの 1 行として残す。作り直すのは 044b
cards.post("/:id/fix", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!r) return c.json({ error: "カードが無い" }, 404);
  if (r.status === "signed" || r.status === "stopped") return c.json({ error: "署名済みか停止したカードには直しを送れない" }, 409);
  const b = await c.req.json<Partial<FixRequest> & { actor?: string }>().catch(() => null);
  const body = JSON.parse(r.body) as CardBody;
  const errs = validateFix(b, body.frames.length);
  if (errs.length) return c.json({ error: "枠か文が足りない", errors: errs }, 400);
  const req = { frame: b!.frame!, t: body.frames[b!.frame!].t, box: b!.box!, text: b!.text!.trim() };
  const e = await appendAudit(c.env.DB, c.var.tenant.id, { card_id: r.id, kind: "edit", actor: actorOf(b as Payload, "supervisor"), payload: { request: "redo", version: r.version, ...req } });
  return c.json({ n: e.n, version: r.version, ...req }, 202);
});

cards.post("/:id/status", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!r) return c.json({ error: "カードが無い" }, 404);
  const b = await c.req.json<{ to?: CardStatus; actor?: string }>().catch(() => ({}) as { to?: CardStatus; actor?: string });
  const to = b.to;
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
  await appendAudit(c.env.DB, c.var.tenant.id, { card_id: r.id, kind: "status", actor: actorOf(b, "system"), payload: { version: r.version, from: r.status, to } });
  return c.json(cardView((await getCard(c.env.DB, c.var.tenant.id, r.id))!));
});
