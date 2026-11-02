// ○× の組（093a）。○ のカード（正しいやり方）と × のカード（まちがったやり方）を 1 組に結ぶ。
// どちらも同じテナントのカードで、1 枚のカードは 1 つの組にだけ入る。新入社員は結べない（読むのは署名済みの入口から）。
import { Hono } from "hono";
import { getCard } from "./cards";
import type { Env } from "./env";
import type { PeopleVars } from "./people";

export const pairs = new Hono<{ Bindings: Env; Variables: PeopleVars }>();

export interface Pair {
  good: string;
  bad: string;
  created_at: string;
}

async function listPairs(db: D1Database, tenantId: string): Promise<Pair[]> {
  const { results } = await db.prepare("SELECT good_card AS good, bad_card AS bad, created_at FROM card_pairs WHERE tenant_id = ? ORDER BY created_at, good_card").bind(tenantId).all<Pair>();
  return results;
}

pairs.get("/", async (c) => c.json({ pairs: await listPairs(c.env.DB, c.var.tenant.id) }));

pairs.post("/", async (c) => {
  if (c.var.person?.role === "newhire") return c.json({ error: "新入社員は組を結べない" }, 403);
  const b = await c.req.json<{ good?: unknown; bad?: unknown }>().catch(() => ({}) as { good?: unknown; bad?: unknown });
  if (typeof b.good !== "string" || typeof b.bad !== "string" || b.good === b.bad) return c.json({ error: "good と bad は別のカードの番号" }, 400);
  for (const id of [b.good, b.bad]) if (!(await getCard(c.env.DB, c.var.tenant.id, id))) return c.json({ error: `カードが無い: ${id}` }, 404);
  const used = await c.env.DB.prepare("SELECT 1 FROM card_pairs WHERE tenant_id = ? AND (good_card IN (?, ?) OR bad_card IN (?, ?)) LIMIT 1").bind(c.var.tenant.id, b.good, b.bad, b.good, b.bad).first();
  if (used) return c.json({ error: "どちらかのカードは、もう別の組に入っている" }, 409);
  await c.env.DB.prepare("INSERT INTO card_pairs (tenant_id, good_card, bad_card) VALUES (?, ?, ?)").bind(c.var.tenant.id, b.good, b.bad).run();
  return c.json({ good: b.good, bad: b.bad }, 201);
});
