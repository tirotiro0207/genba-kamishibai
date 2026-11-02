// 新入社員の閲覧の入口（028）。署名済みのカードだけを返す。未署名・停止のカードは一覧にも 1 枚の取得にも出ない。
// 返すのは見るのに要るもの（守ること・なぜ・言葉・動き・コマ）だけで、経路や部品の理由は返さない。
import { Hono } from "hono";
import type { CardBody } from "../shared/card";
import type { Env } from "./env";
import type { PeopleVars } from "./people";

export const read = new Hono<{ Bindings: Env; Variables: PeopleVars }>();

interface Row {
  id: string;
  body: string;
  updated_at: string;
}

const view = (r: Row) => {
  const b = JSON.parse(r.body) as CardBody;
  return { id: r.id, rule: b.rule, why: b.why, words: b.words ?? null, motion: b.motion, frames: b.frames };
};

read.get("/cards", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, body, updated_at FROM cards WHERE tenant_id = ? AND status = 'signed' ORDER BY created_at, id").bind(c.var.tenant.id).all<Row>();
  return c.json({ cards: results.map(view) });
});

read.get("/cards/:id", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, body, updated_at FROM cards WHERE id = ? AND tenant_id = ? AND status = 'signed'").bind(c.req.param("id"), c.var.tenant.id).first<Row>();
  return r ? c.json(view(r)) : c.json({ error: "カードが無い" }, 404);
});
