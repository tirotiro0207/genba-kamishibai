// カードの保存と状態（019）。形と経路は src/shared/card.ts で確かめ、経路の無い部品があれば保存を断る。
// どの読み書きもテナントで絞る。署名は署名の記録（051a）からだけ行い、ここの状態の変更では受け付けない。
// 作ると監査の記録に ①元の文のどこから ②作る側が何をしたか、直すと ④、状態を移すとその 1 行が足される。
import { Hono } from "hono";
import { type CardBody, type CardStatus, canMove, STATUSES, validateCard } from "../shared/card";
import { aiDraftReasons } from "../shared/make/ai-draft";
import type { Term } from "../shared/make/words";
import { appendAudit } from "./audit";
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

cards.get("/:id", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  return r ? c.json(cardView(r)) : c.json({ error: "カードが無い" }, 404);
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

cards.post("/:id/status", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!r) return c.json({ error: "カードが無い" }, 404);
  const b = await c.req.json<{ to?: CardStatus; actor?: string }>().catch(() => ({}) as { to?: CardStatus; actor?: string });
  const to = b.to;
  if (!STATUSES.includes(to as CardStatus)) return c.json({ error: "to が状態の名前ではない" }, 400);
  if (to === "signed") return c.json({ error: "署名は署名の記録からだけ" }, 403);
  if (!canMove(r.status, to!)) return c.json({ error: `${r.status} から ${to} へは移れない` }, 409);
  const res = await c.env.DB.prepare("UPDATE cards SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ? AND status = ?").bind(to, r.id, c.var.tenant.id, r.status).run();
  if (!res.meta.changes) return c.json({ error: "ほかの操作と重なった。読み直して" }, 409);
  await appendAudit(c.env.DB, c.var.tenant.id, { card_id: r.id, kind: "status", actor: actorOf(b, "system"), payload: { version: r.version, from: r.status, to } });
  return c.json(cardView((await getCard(c.env.DB, c.var.tenant.id, r.id))!));
});
