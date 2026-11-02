// 新入社員の閲覧の入口（028）。署名済みのカードだけを返す。未署名・停止のカードは一覧にも 1 枚の取得にも出ない。
// 署名済みでも、署名の記録（⑤）が無いか、署名のあとに中身か版が変わったカードは出さない（052）。
// 見た印（088）: 新入社員が 1 枚を見たら /cards/:id/seen に送り、版ごと・役割のしるしごとに記録する（発行の画面で見た人の一覧になる）。
// 返すのは見るのに要るもの（守ること・なぜ・言葉・動き・コマ）だけで、経路や部品の理由は返さない。
import { Hono } from "hono";
import type { CardBody } from "../shared/card";
import type { Env } from "./env";
import type { PeopleVars } from "./people";
import { recordView } from "./recall";
import { actorOf, signIntact } from "./sign";

export const read = new Hono<{ Bindings: Env; Variables: PeopleVars }>();

interface Row {
  id: string;
  body: string;
  version: number;
  updated_at: string;
}

const view = (r: Row) => {
  const b = JSON.parse(r.body) as CardBody;
  return { id: r.id, rule: b.rule, why: b.why, words: b.words ?? null, motion: b.motion, frames: b.frames };
};

/** 署名済みで、最後の署名の行と今の中身・版が合うカードだけ残す */
async function intactOnly(db: D1Database, tenantId: string, rows: Row[]): Promise<Row[]> {
  if (!rows.length) return [];
  const { results } = await db.prepare("SELECT card_id, payload FROM audit_log WHERE tenant_id = ? AND kind = 'sign' ORDER BY created_at, n").bind(tenantId).all<{ card_id: string; payload: string }>();
  const last = new Map(results.map((x) => [x.card_id, x.payload]));
  const keep: Row[] = [];
  for (const r of rows) {
    const p = last.get(r.id);
    if (p && (await signIntact(r, p))) keep.push(r);
  }
  return keep;
}

read.get("/cards", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, body, version, updated_at FROM cards WHERE tenant_id = ? AND status = 'signed' ORDER BY created_at, id").bind(c.var.tenant.id).all<Row>();
  return c.json({ cards: (await intactOnly(c.env.DB, c.var.tenant.id, results)).map(view) });
});

read.get("/cards/:id", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, body, version, updated_at FROM cards WHERE id = ? AND tenant_id = ? AND status = 'signed'").bind(c.req.param("id"), c.var.tenant.id).first<Row>();
  const [ok] = r ? await intactOnly(c.env.DB, c.var.tenant.id, [r]) : [];
  return ok ? c.json(view(ok)) : c.json({ error: "カードが無い" }, 404);
});

read.post("/cards/:id/seen", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, body, version, updated_at FROM cards WHERE id = ? AND tenant_id = ? AND status = 'signed'").bind(c.req.param("id"), c.var.tenant.id).first<Row>();
  const [ok] = r ? await intactOnly(c.env.DB, c.var.tenant.id, [r]) : [];
  if (!ok) return c.json({ error: "カードが無い" }, 404);
  await recordView(c.env.DB, c.var.tenant.id, ok.id, ok.version, actorOf(c.var.person));
  return c.json({ seen: true, version: ok.version });
});
