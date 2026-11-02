// カードの保存と状態（019）。形と経路は src/shared/card.ts で確かめ、経路の無い部品があれば保存を断る。
// どの読み書きもテナントで絞る。署名は署名の記録（051a）からだけ行い、ここの状態の変更では受け付けない。
import { Hono } from "hono";
import { type CardBody, type CardStatus, canMove, STATUSES, validateCard } from "../shared/card";
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

const readBody = async (c: { req: { json: <T>() => Promise<T> } }) => c.req.json<{ card?: CardBody }>().catch(() => ({}) as { card?: CardBody });

cards.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT ${COLS} FROM cards WHERE tenant_id = ? ORDER BY created_at, id`).bind(c.var.tenant.id).all<CardRow>();
  return c.json({ cards: results.map(cardView) });
});

cards.post("/", async (c) => {
  const { card } = await readBody(c);
  const errs = validateCard(card as CardBody);
  if (errs.length) return c.json({ error: "カードの形か経路が足りない", errors: errs }, 400);
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO cards (id, tenant_id, body, status, version, updated_at) VALUES (?, ?, ?, 'draft', 1, datetime('now'))")
    .bind(id, c.var.tenant.id, JSON.stringify(card))
    .run();
  return c.json(cardView((await getCard(c.env.DB, c.var.tenant.id, id))!), 201);
});

cards.get("/:id", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  return r ? c.json(cardView(r)) : c.json({ error: "カードが無い" }, 404);
});

// 中身を直すと版が 1 つ上がり、未承認の下書きに戻る。署名済みは先に停止する
cards.put("/:id", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!r) return c.json({ error: "カードが無い" }, 404);
  if (r.status === "signed") return c.json({ error: "署名済みのカードは直せない（先に停止）" }, 409);
  const { card } = await readBody(c);
  const errs = validateCard(card as CardBody);
  if (errs.length) return c.json({ error: "カードの形か経路が足りない", errors: errs }, 400);
  await c.env.DB.prepare("UPDATE cards SET body = ?, status = 'draft', version = version + 1, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
    .bind(JSON.stringify(card), r.id, c.var.tenant.id)
    .run();
  return c.json(cardView((await getCard(c.env.DB, c.var.tenant.id, r.id))!));
});

cards.post("/:id/status", async (c) => {
  const r = await getCard(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!r) return c.json({ error: "カードが無い" }, 404);
  const { to } = await c.req.json<{ to?: CardStatus }>().catch(() => ({}) as { to?: CardStatus });
  if (!STATUSES.includes(to as CardStatus)) return c.json({ error: "to が状態の名前ではない" }, 400);
  if (to === "signed") return c.json({ error: "署名は署名の記録からだけ" }, 403);
  if (!canMove(r.status, to!)) return c.json({ error: `${r.status} から ${to} へは移れない` }, 409);
  await c.env.DB.prepare("UPDATE cards SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ? AND status = ?").bind(to, r.id, c.var.tenant.id, r.status).run();
  return c.json(cardView((await getCard(c.env.DB, c.var.tenant.id, r.id))!));
});
