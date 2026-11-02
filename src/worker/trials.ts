// 回答の記録アプリの保存（011）。回を作ると種と割り当てが残り、答えは追記だけ受け付ける。
import { Hono } from "hono";
import { assign, newSeed } from "../shared/assign";
import type { Env } from "./env";
import type { TenantVars } from "./tenant";

export const trials = new Hono<{ Bindings: Env; Variables: TenantVars }>();

interface TrialRow {
  id: string;
  seed: string;
  participants: string;
  created_at: string;
}

async function getTrial(db: D1Database, tenantId: string, id: string) {
  return db.prepare("SELECT id, seed, participants, created_at FROM trials WHERE id = ? AND tenant_id = ?").bind(id, tenantId).first<TrialRow>();
}

const view = (t: TrialRow) => {
  const participants = JSON.parse(t.participants) as string[];
  return { id: t.id, seed: t.seed, created_at: t.created_at, participants, assignments: assign(t.seed, participants) };
};

trials.post("/", async (c) => {
  const b = await c.req.json<{ participants?: unknown; seed?: unknown }>().catch(() => ({}) as { participants?: unknown; seed?: unknown });
  const ps = b.participants;
  if (!Array.isArray(ps) || ps.length < 1 || ps.length > 200 || !ps.every((p) => typeof p === "string" && p.length > 0 && p.length <= 40) || new Set(ps).size !== ps.length) {
    return c.json({ error: "participants は重ならない ID の並び（1〜200）" }, 400);
  }
  const seed = typeof b.seed === "string" && b.seed ? b.seed.slice(0, 64) : newSeed();
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO trials (id, tenant_id, seed, participants) VALUES (?, ?, ?, ?)").bind(id, c.var.tenant.id, seed, JSON.stringify(ps)).run();
  return c.json(view((await getTrial(c.env.DB, c.var.tenant.id, id))!), 201);
});

trials.get("/:id", async (c) => {
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  return t ? c.json(view(t)) : c.json({ error: "回が無い" }, 404);
});

trials.post("/:id/responses", async (c) => {
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const b = await c.req.json<{ participant?: unknown; item?: unknown; ms?: unknown; answer?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  const a = view(t).assignments.find((x) => x.participant === b.participant);
  if (!a) return c.json({ error: "この回の参加者ではない" }, 400);
  if (b.item !== "A" && b.item !== "B") return c.json({ error: "item は A か B" }, 400);
  const ms = b.ms === undefined || b.ms === null ? null : Number(b.ms);
  if (ms !== null && (!Number.isInteger(ms) || ms < 0 || ms > 3_600_000)) return c.json({ error: "ms が範囲の外" }, 400);
  const answer = typeof b.answer === "string" ? b.answer.slice(0, 2000) : null;
  // 見せたものは割り当てから決める（答える側に選ばせない）。同じ参加者・項目の何回目かで順番の何番目かが決まる
  const done = await c.env.DB.prepare("SELECT count(*) AS n FROM responses WHERE trial_id = ? AND participant = ? AND item = ?").bind(t.id, a.participant, b.item).first<{ n: number }>();
  const k = done?.n ?? 0;
  if (k >= 2) return c.json({ error: "この項目の答えは済んでいる" }, 409);
  const shown = a[b.item][k];
  const row = await c.env.DB.prepare("INSERT INTO responses (trial_id, tenant_id, participant, item, shown, ms, answer) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING seq")
    .bind(t.id, c.var.tenant.id, a.participant, b.item, shown, ms, answer)
    .first<{ seq: number }>();
  return c.json({ seq: row?.seq, shown }, 201);
});

trials.get("/:id/responses", async (c) => {
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const { results } = await c.env.DB.prepare("SELECT seq, participant, item, shown, ms, answer, created_at FROM responses WHERE trial_id = ? ORDER BY seq").bind(t.id).all();
  return c.json({ responses: results });
});

// 書き換えと消すことは断る
trials.on(["PUT", "PATCH", "DELETE"], ["/:id", "/:id/responses", "/:id/responses/*"], (c) => c.json({ error: "記録は追記だけ" }, 405));
