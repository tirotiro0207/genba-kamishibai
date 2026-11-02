// 発行の管理（088）。署名済みのカードを配ったあとの口: 署名済みの一覧・見た人の一覧・回収の知らせ・週の抜き取り。
// 読めるのは監修者と教育担当だけ（新入社員・作者・役割なしは入れない）。回収の知らせを読んだ印は教育担当だけが付ける。
// 止める操作は cards.ts の状態の変更（理由つき）で、署名済みを止めたときに recall.ts が回収の知らせを作る。
import { Hono } from "hono";
import { isoWeek, newSeed, pickSample, reviewerFor, SAMPLE_SIZE } from "../shared/issue";
import type { CardRow } from "./cards";
import type { Env } from "./env";
import { type Person, type PeopleVars, personName } from "./people";
import { actorOf, type SignPayload, signIntact } from "./sign";

export const issue = new Hono<{ Bindings: Env; Variables: PeopleVars }>();

issue.use("*", async (c, next) => {
  const role = c.var.person?.role;
  if (role !== "supervisor" && role !== "trainer") return c.json({ error: "発行の画面は監修者か教育担当の役で開く" }, 403);
  await next();
});

export interface SignedCard {
  id: string;
  rule: string;
  version: number;
  signed_at: string;
  signed_by: string;
}

/** 署名済みで、最後の署名の行と今の中身・版が合うカード（新入社員に出ているカードと同じ条件） */
export async function signedCards(db: D1Database, tenantId: string): Promise<SignedCard[]> {
  const { results: rows } = await db.prepare("SELECT id, body, version FROM cards WHERE tenant_id = ? AND status = 'signed' ORDER BY created_at, id").bind(tenantId).all<Pick<CardRow, "id" | "body" | "version">>();
  if (!rows.length) return [];
  const { results } = await db.prepare("SELECT card_id, actor, payload FROM audit_log WHERE tenant_id = ? AND kind = 'sign' ORDER BY created_at, n").bind(tenantId).all<{ card_id: string; actor: string; payload: string }>();
  const last = new Map(results.map((x) => [x.card_id, x]));
  const out: SignedCard[] = [];
  for (const r of rows) {
    const s = last.get(r.id);
    if (s && (await signIntact(r, s.payload))) out.push({ id: r.id, rule: (JSON.parse(r.body) as { rule: string }).rule, version: r.version, signed_at: (JSON.parse(s.payload) as SignPayload).signed_at, signed_by: s.actor });
  }
  return out;
}

issue.get("/cards", async (c) => {
  const tid = c.var.tenant.id;
  const list = await signedCards(c.env.DB, tid);
  const { results } = await c.env.DB.prepare("SELECT card_id, count(*) AS viewers, sum(views) AS views FROM card_views WHERE tenant_id = ? GROUP BY card_id").bind(tid).all<{ card_id: string; viewers: number; views: number }>();
  const seen = new Map(results.map((x) => [x.card_id, x]));
  return c.json({ cards: list.map((x) => ({ ...x, viewers: seen.get(x.id)?.viewers ?? 0, views: seen.get(x.id)?.views ?? 0 })) });
});

/** 1 枚の見た人の一覧（止めたカードでも読める） */
issue.get("/cards/:id/views", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT version, actor, first_viewed_at, last_viewed_at, views FROM card_views WHERE tenant_id = ? AND card_id = ? ORDER BY first_viewed_at, version, actor")
    .bind(c.var.tenant.id, c.req.param("id"))
    .all();
  return c.json({ views: results });
});

interface RecallRow {
  id: number;
  card_id: string;
  version: number;
  signed_at: string | null;
  rule: string;
  reason: string;
  stopped_by: string;
  stopped_at: string;
  read_at: string | null;
  read_by: string | null;
}

issue.get("/recalls", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, card_id, version, signed_at, rule, reason, stopped_by, stopped_at, read_at, read_by FROM recall_notices WHERE tenant_id = ? ORDER BY id DESC").bind(c.var.tenant.id).all<RecallRow>();
  return c.json({ recalls: results, unread: results.filter((x) => !x.read_at).length });
});

/** 回収の知らせを読んだ印。教育担当だけ。最初に読んだ時刻のまま変えない */
issue.post("/recalls/:id/read", async (c) => {
  const p = c.var.person!;
  if (p.role !== "trainer") return c.json({ error: "読んだ印は教育担当が付ける" }, 403);
  const id = Number(c.req.param("id"));
  const tid = c.var.tenant.id;
  await c.env.DB.prepare("UPDATE recall_notices SET read_at = ?, read_by = ? WHERE id = ? AND tenant_id = ? AND read_at IS NULL").bind(new Date().toISOString(), actorOf(p), id, tid).run();
  const row = await c.env.DB.prepare("SELECT id, card_id, version, signed_at, rule, reason, stopped_by, stopped_at, read_at, read_by FROM recall_notices WHERE id = ? AND tenant_id = ?").bind(id, tid).first<RecallRow>();
  return row ? c.json(row) : c.json({ error: "回収の知らせが無い" }, 404);
});

export interface SamplePick {
  card_id: string;
  version: number;
  rule: string;
  signed_by: string;
  signed_at: string;
  /** 見直す人。署名した監修者とは別の監修者 */
  reviewer: string | null;
}
interface SampleRow {
  week: string;
  seed: string;
  picked: string;
  pool: number;
  created_at: string;
}

const sampleView = (env: Env, r: SampleRow) => {
  const who = (actor: string | null) => {
    const m = /^(supervisor)\.([12])$/.exec(actor ?? "");
    return m ? personName(env, { role: "supervisor", slot: Number(m[2]) as Person["slot"] }) : "";
  };
  const picks = (JSON.parse(r.picked) as SamplePick[]).map((x) => ({ ...x, signed_by_name: who(x.signed_by), reviewer_name: who(x.reviewer) }));
  return { week: r.week, seed: r.seed, pool: r.pool, size: SAMPLE_SIZE, created_at: r.created_at, picks };
};

/**
 * その週の抜き取りを返す。まだ無ければ、そのときに署名済み（中身が署名と合う）のカードから、新しい種で 2 枚を選んで記録する。
 * 同じ週の 2 回目からは、記録したものをそのまま返す。署名済みが 1 枚も無い間は何も記録せず picks が空のまま返す
 */
export async function ensureSample(db: D1Database, env: Env, tenantId: string, now = new Date()) {
  const week = isoWeek(now);
  const get = () => db.prepare("SELECT week, seed, picked, pool, created_at FROM weekly_samples WHERE tenant_id = ? AND week = ?").bind(tenantId, week).first<SampleRow>();
  const have = await get();
  if (have) return sampleView(env, have);
  const pool = await signedCards(db, tenantId);
  if (!pool.length) return { week, seed: null, pool: 0, size: SAMPLE_SIZE, created_at: null, picks: [] };
  const seed = newSeed();
  const ids = await pickSample(pool.map((x) => x.id), seed);
  const picked: SamplePick[] = ids.map((id) => {
    const x = pool.find((y) => y.id === id)!;
    return { card_id: x.id, version: x.version, rule: x.rule, signed_by: x.signed_by, signed_at: x.signed_at, reviewer: reviewerFor(x.signed_by) };
  });
  await db.prepare("INSERT OR IGNORE INTO weekly_samples (tenant_id, week, seed, picked, pool, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(tenantId, week, seed, JSON.stringify(picked), pool.length, now.toISOString()).run();
  return sampleView(env, (await get())!);
}

issue.post("/sample", async (c) => c.json(await ensureSample(c.env.DB, c.env, c.var.tenant.id)));

/** これまでの週の抜き取り（新しい週から） */
issue.get("/samples", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT week, seed, picked, pool, created_at FROM weekly_samples WHERE tenant_id = ? ORDER BY week DESC").bind(c.var.tenant.id).all<SampleRow>();
  return c.json({ samples: results.map((r) => sampleView(c.env, r)) });
});
