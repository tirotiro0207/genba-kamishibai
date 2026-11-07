// 発行の管理（088）。署名済みのカードを配ったあとの口: 署名済みの一覧・見た人の一覧・回収の知らせ・週の抜き取り。
// 読めるのは監修者と教育担当だけ（新入社員・作者・役割なしは入れない）。回収の知らせを読んだ印は教育担当だけが付ける。
// 止める操作は cards.ts の状態の変更（理由つき）で、署名済みを止めたときに recall.ts が回収の知らせを作る。
// 11/7 既定（作者の確認待ち）: 貼った場所の表（posts）・週の抜き取りの「見直した」の印・朝礼の組（morning）を足した。
// 貼るのも朝礼に出すのも、署名済みで中身が署名と合うカード（新入社員に出ているのと同じ関所）だけ。
import { Hono } from "hono";
import { type CardBundle, type CardShape, type CardWeight, weightOf, type CardBody } from "../shared/card";
import { isoWeek, MORNING_MAX, morningScore, newSeed, pickSample, reviewerFor, SAMPLE_SIZE } from "../shared/issue";
import { appendAudit } from "./audit";
import type { CardRow } from "./cards";
import type { Env } from "./env";
import { type Person, type PeopleVars, shownName } from "./people";
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
  /** 署名の行の中身の指紋（貼った紙がどの中身か） */
  content_sha256: string;
  /** 11/7〜: 重さ（無ければ normal）・束・形 */
  weight: CardWeight;
  bundle: CardBundle | null;
  shape: CardShape;
  /** 朝礼の組を選ぶための文（なぜ・言葉） */
  why: string;
  words: string;
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
    if (!s || !(await signIntact(r, s.payload))) continue;
    const b = JSON.parse(r.body) as CardBody;
    const p = JSON.parse(s.payload) as SignPayload;
    out.push({
      id: r.id,
      rule: b.rule,
      version: r.version,
      signed_at: p.signed_at,
      signed_by: s.actor,
      content_sha256: p.content_sha256,
      weight: weightOf(b),
      bundle: b.bundle ?? null,
      shape: b.shape ?? "story",
      why: b.why ?? "",
      words: b.words?.ja ?? "",
    });
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
  const tid = c.var.tenant.id;
  const { results } = await c.env.DB.prepare("SELECT id, card_id, version, signed_at, rule, reason, stopped_by, stopped_at, read_at, read_by FROM recall_notices WHERE tenant_id = ? ORDER BY id DESC").bind(tid).all<RecallRow>();
  // はがす紙（11/7）: 止めた・直した版を貼った場所で、まだはがしていないもの
  const posts = await c.env.DB.prepare("SELECT id, card_id, version, place, posted_at FROM card_posts WHERE tenant_id = ? AND removed_at IS NULL ORDER BY id").bind(tid).all<{ id: number; card_id: string; version: number; place: string; posted_at: string }>();
  return c.json({
    recalls: results.map((x) => ({ ...x, posts: posts.results.filter((p) => p.card_id === x.card_id && p.version === x.version) })),
    unread: results.filter((x) => !x.read_at).length,
  });
});

// 貼った場所の表（11/7 既定）。署名済みで中身が署名と合うカードだけ貼れる。場所は 100 字まで
export const PLACE_MAX = 100;
interface PostRow {
  id: number;
  card_id: string;
  version: number;
  content_sha256: string;
  place: string;
  posted_by: string;
  posted_at: string;
  removed_at: string | null;
  removed_by: string | null;
}
const POST_COLS = "id, card_id, version, content_sha256, place, posted_by, posted_at, removed_at, removed_by";

issue.post("/posts", async (c) => {
  const tid = c.var.tenant.id;
  const b = await c.req.json<{ card_id?: unknown; place?: unknown }>().catch(() => ({}) as { card_id?: unknown; place?: unknown });
  const place = typeof b.place === "string" ? b.place.trim() : "";
  if (!place || place.length > PLACE_MAX) return c.json({ error: `place（貼った場所）は 1〜${PLACE_MAX} 字` }, 400);
  const card = (await signedCards(c.env.DB, tid)).find((x) => x.id === b.card_id);
  if (!card) return c.json({ error: "署名済みで、中身が署名と合うカードだけ貼れる" }, 409);
  const res = await c.env.DB.prepare("INSERT INTO card_posts (tenant_id, card_id, version, content_sha256, place, posted_by, posted_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(tid, card.id, card.version, card.content_sha256, place, actorOf(c.var.person), new Date().toISOString())
    .run();
  return c.json(await c.env.DB.prepare(`SELECT ${POST_COLS} FROM card_posts WHERE id = ?`).bind(res.meta.last_row_id).first<PostRow>(), 201);
});

/** 貼った場所の一覧。current は、今も署名済みで中身が貼った紙と同じか（false ではがしていなければ、はがす紙） */
issue.get("/posts", async (c) => {
  const tid = c.var.tenant.id;
  const { results } = await c.env.DB.prepare(`SELECT ${POST_COLS} FROM card_posts WHERE tenant_id = ? ORDER BY id DESC`).bind(tid).all<PostRow>();
  const now = new Map((await signedCards(c.env.DB, tid)).map((x) => [x.id, x]));
  const posts = results.map((p) => {
    const s = now.get(p.card_id);
    const current = !!s && s.version === p.version && s.content_sha256 === p.content_sha256;
    return { ...p, current, to_remove: !p.removed_at && !current };
  });
  return c.json({ posts, to_remove: posts.filter((p) => p.to_remove).length });
});

/** はがした印。最初に付けた時刻のまま変えない */
issue.post("/posts/:id/removed", async (c) => {
  const tid = c.var.tenant.id;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "貼った紙が無い" }, 404);
  await c.env.DB.prepare("UPDATE card_posts SET removed_at = ?, removed_by = ? WHERE id = ? AND tenant_id = ? AND removed_at IS NULL").bind(new Date().toISOString(), actorOf(c.var.person), id, tid).run();
  const row = await c.env.DB.prepare(`SELECT ${POST_COLS} FROM card_posts WHERE id = ? AND tenant_id = ?`).bind(id, tid).first<PostRow>();
  return row ? c.json(row) : c.json({ error: "貼った紙が無い" }, 404);
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

interface ReviewRow {
  week: string;
  card_id: string;
  version: number;
  reviewed_by: string;
  reviewed_at: string;
  note: string;
}

/** 週の抜き取りの見直した印（11/7）。テナントの全部の週の分 */
async function reviewsOf(db: D1Database, tenantId: string): Promise<ReviewRow[]> {
  return (await db.prepare("SELECT week, card_id, version, reviewed_by, reviewed_at, note FROM sample_reviews WHERE tenant_id = ?").bind(tenantId).all<ReviewRow>()).results;
}

const sampleView = (env: Env, kind: string, r: SampleRow, reviews: ReviewRow[] = []) => {
  const who = (actor: string | null) => {
    const m = /^(supervisor)\.([12])$/.exec(actor ?? "");
    return m ? shownName(env, kind, { role: "supervisor", slot: Number(m[2]) as Person["slot"] }) : "";
  };
  const picks = (JSON.parse(r.picked) as SamplePick[]).map((x) => {
    const rv = reviews.find((y) => y.week === r.week && y.card_id === x.card_id) ?? null;
    return { ...x, signed_by_name: who(x.signed_by), reviewer_name: who(x.reviewer), reviewed: rv ? { by: rv.reviewed_by, by_name: who(rv.reviewed_by), at: rv.reviewed_at, note: rv.note } : null };
  });
  return { week: r.week, seed: r.seed, pool: r.pool, size: SAMPLE_SIZE, created_at: r.created_at, picks, reviewed: picks.filter((p) => p.reviewed).length };
};

/**
 * その週の抜き取りを返す。まだ無ければ、そのときに署名済み（中身が署名と合う）のカードから、新しい種で 2 枚を選んで記録する。
 * 同じ週の 2 回目からは、記録したものをそのまま返す。署名済みが 1 枚も無い間は何も記録せず picks が空のまま返す
 */
export async function ensureSample(db: D1Database, env: Env, tenantId: string, now = new Date(), kind = "") {
  const week = isoWeek(now);
  const get = () => db.prepare("SELECT week, seed, picked, pool, created_at FROM weekly_samples WHERE tenant_id = ? AND week = ?").bind(tenantId, week).first<SampleRow>();
  const have = await get();
  if (have) return sampleView(env, kind, have, await reviewsOf(db, tenantId));
  const pool = await signedCards(db, tenantId);
  if (!pool.length) return { week, seed: null, pool: 0, size: SAMPLE_SIZE, created_at: null, picks: [], reviewed: 0 };
  const seed = newSeed();
  const ids = await pickSample(pool.map((x) => x.id), seed);
  const picked: SamplePick[] = ids.map((id) => {
    const x = pool.find((y) => y.id === id)!;
    return { card_id: x.id, version: x.version, rule: x.rule, signed_by: x.signed_by, signed_at: x.signed_at, reviewer: reviewerFor(x.signed_by) };
  });
  await db.prepare("INSERT OR IGNORE INTO weekly_samples (tenant_id, week, seed, picked, pool, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(tenantId, week, seed, JSON.stringify(picked), pool.length, now.toISOString()).run();
  return sampleView(env, kind, (await get())!, await reviewsOf(db, tenantId));
}

issue.post("/sample", async (c) => c.json(await ensureSample(c.env.DB, c.env, c.var.tenant.id, new Date(), c.var.tenant.kind)));

/** これまでの週の抜き取り（新しい週から） */
issue.get("/samples", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT week, seed, picked, pool, created_at FROM weekly_samples WHERE tenant_id = ? ORDER BY week DESC").bind(c.var.tenant.id).all<SampleRow>();
  const reviews = await reviewsOf(c.env.DB, c.var.tenant.id);
  return c.json({ samples: results.map((r) => sampleView(c.env, c.var.tenant.kind, r, reviews)) });
});

/**
 * 見直した印（11/7 既定）。監修者だけが付け、割り当てた見直す人がいればその人だけ（署名した人とは別の人が見る）。
 * 1 枚に 1 回だけ。印は監査の記録にも 1 行足す（状態は変えないので from と to は今の状態のまま）
 */
issue.post("/samples/:week/:card/reviewed", async (c) => {
  const p = c.var.person!;
  if (p.role !== "supervisor") return c.json({ error: "見直した印は監修者が付ける" }, 403);
  const tid = c.var.tenant.id;
  const week = c.req.param("week");
  const cardId = c.req.param("card");
  const row = await c.env.DB.prepare("SELECT week, seed, picked, pool, created_at FROM weekly_samples WHERE tenant_id = ? AND week = ?").bind(tid, week).first<SampleRow>();
  const pick = row ? (JSON.parse(row.picked) as SamplePick[]).find((x) => x.card_id === cardId) : undefined;
  if (!pick) return c.json({ error: "その週の抜き取りに、そのカードは無い" }, 404);
  const me = actorOf(p);
  if (pick.reviewer && pick.reviewer !== me) return c.json({ error: "見直すのは、割り当てた監修者（署名した人とは別の人）" }, 403);
  const b = await c.req.json<{ note?: unknown }>().catch(() => ({}) as { note?: unknown });
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 300) : "";
  const at = new Date().toISOString();
  const res = await c.env.DB.prepare("INSERT OR IGNORE INTO sample_reviews (tenant_id, week, card_id, version, reviewed_by, reviewed_at, note) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(tid, week, cardId, pick.version, me, at, note).run();
  if (!res.meta.changes) return c.json({ error: "もう見直した印が付いている" }, 409);
  const card = await c.env.DB.prepare("SELECT status FROM cards WHERE id = ? AND tenant_id = ?").bind(cardId, tid).first<{ status: string }>();
  if (card)
    await appendAudit(c.env.DB, tid, { card_id: cardId, kind: "status", actor: me, payload: { version: pick.version, from: card.status, to: card.status, reason: `週の抜き取り（${week}）で見直した${note ? `: ${note}` : ""}`, review: { week } } });
  return c.json(sampleView(c.env, c.var.tenant.kind, row!, await reviewsOf(c.env.DB, tid)));
});

// 朝礼の組（11/7 既定）。その日の作業を言葉で書くと、署名済み（中身が署名と合う）のカードから合うものを選んで並べる。
// 命に関わるカードを先に並べる。選んだ組は日付つきで残し（追記だけ）、カードごとに朝礼で使った回数を数える
issue.get("/morning/suggest", async (c) => {
  const work = (c.req.query("work") ?? "").trim().slice(0, 200);
  const n = Math.min(MORNING_MAX, Math.max(1, Number(c.req.query("n") ?? 4) || 4));
  const pool = await signedCards(c.env.DB, c.var.tenant.id);
  const ranked = pool
    .map((x) => ({ x, score: morningScore(work, `${x.rule} ${x.why} ${x.words} ${x.bundle?.parent ?? ""}`) }))
    .filter((y) => !work || y.score > 0)
    .sort((a, b) => Number(b.x.weight === "life") - Number(a.x.weight === "life") || b.score - a.score);
  return c.json({ work, cards: ranked.slice(0, n).map(({ x, score }) => ({ id: x.id, rule: x.rule, version: x.version, weight: x.weight, shape: x.shape, bundle: x.bundle, score })) });
});

interface MorningRow {
  id: number;
  day: string;
  work: string;
  cards: string;
  created_by: string;
  created_at: string;
}
const morningView = (r: MorningRow) => ({ ...r, cards: JSON.parse(r.cards) as { id: string; version: number; rule: string }[] });

issue.post("/morning", async (c) => {
  const tid = c.var.tenant.id;
  const b = await c.req.json<{ work?: unknown; cards?: unknown; day?: unknown }>().catch(() => ({}) as { work?: unknown; cards?: unknown; day?: unknown });
  const work = typeof b.work === "string" ? b.work.trim().slice(0, 200) : "";
  const ids = Array.isArray(b.cards) ? b.cards : [];
  if (!ids.length || ids.length > MORNING_MAX || !ids.every((x) => typeof x === "string") || new Set(ids).size !== ids.length) return c.json({ error: `cards は署名済みのカードの id の並び（1〜${MORNING_MAX} 枚）` }, 400);
  const day = typeof b.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const pool = new Map((await signedCards(c.env.DB, tid)).map((x) => [x.id, x]));
  const missing = (ids as string[]).filter((id) => !pool.has(id));
  if (missing.length) return c.json({ error: "署名済みで、中身が署名と合うカードだけ朝礼に出せる", missing }, 409);
  const cards = (ids as string[]).map((id) => ({ id, version: pool.get(id)!.version, rule: pool.get(id)!.rule }));
  const res = await c.env.DB.prepare("INSERT INTO morning_sets (tenant_id, day, work, cards, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(tid, day, work, JSON.stringify(cards), actorOf(c.var.person), new Date().toISOString()).run();
  return c.json(morningView((await c.env.DB.prepare("SELECT id, day, work, cards, created_by, created_at FROM morning_sets WHERE id = ?").bind(res.meta.last_row_id).first<MorningRow>())!), 201);
});

/** これまでの朝礼の組（新しい順に 30 組）と、カードごとの朝礼で使った回数 */
issue.get("/morning", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, day, work, cards, created_by, created_at FROM morning_sets WHERE tenant_id = ? ORDER BY day DESC, id DESC").bind(c.var.tenant.id).all<MorningRow>();
  const sets = results.map(morningView);
  const used: Record<string, number> = {};
  for (const s of sets) for (const x of s.cards) used[x.id] = (used[x.id] ?? 0) + 1;
  return c.json({ sets: sets.slice(0, 30), used });
});
