// 回答の記録アプリの保存（011）。回を作ると種と割り当てが残り、答えは追記だけ受け付ける。
import { Hono } from "hono";
import { type ExportGrade, type ExportResponse, toAnswersCsv, VERDICTS, type Verdict } from "../shared/answers-csv";
import { crossSummary } from "../shared/summary";
import { assign, crossAssign, newSeed } from "../shared/assign";
import { latestForecasts, pictureOrder, PICTURES_MAX } from "../shared/picture-order";
import { appendAudit } from "./audit";
import type { Env } from "./env";
import { fileKey } from "./files";
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

/** 交差の回（11/5 作者）は participants に {design, people} を入れる。前からの回は ID の並び */
type Stored = string[] | { design: "cross"; people: { id: string; group: string }[] };
export const participantIds = (raw: string) => {
  const p = JSON.parse(raw) as Stored;
  return Array.isArray(p) ? p : p.people.map((x) => x.id);
};

const view = (t: TrialRow) => {
  const p = JSON.parse(t.participants) as Stored;
  if (Array.isArray(p)) return { id: t.id, seed: t.seed, created_at: t.created_at, design: "order" as const, participants: p, assignments: assign(t.seed, p) };
  return { id: t.id, seed: t.seed, created_at: t.created_at, design: "cross" as const, participants: p.people.map((x) => x.id), assignments: crossAssign(t.seed, p.people) };
};

trials.post("/", async (c) => {
  const b = await c.req.json<{ participants?: unknown; seed?: unknown; design?: unknown }>().catch(() => ({}) as { participants?: unknown; seed?: unknown; design?: unknown });
  // 交差の回（11/5 作者）: 参加者を {id, group（国籍）} で受け取り、国籍ごとに組を半分ずつ分ける
  const cross = b.design === "cross";
  const raw = Array.isArray(b.participants) ? b.participants : null;
  const people = cross && raw ? raw.map((x) => (x && typeof x === "object" ? (x as { id?: unknown; group?: unknown }) : {})) : [];
  const ps = cross ? people.map((x) => x.id) : raw;
  const okId = (p: unknown) => typeof p === "string" && p.length > 0 && p.length <= 40;
  if (!ps || ps.length < 1 || ps.length > 200 || !ps.every(okId) || new Set(ps).size !== ps.length) {
    return c.json({ error: "participants は重ならない ID の並び（1〜200）" }, 400);
  }
  if (cross && !people.every((x) => typeof x.group === "string" && x.group.trim().length > 0 && x.group.length <= 40)) return c.json({ error: "交差の回は、参加者ごとに国籍（group）が要る" }, 400);
  const stored = cross ? { design: "cross", people: people.map((x) => ({ id: x.id as string, group: (x.group as string).trim() })) } : ps;
  const seed = typeof b.seed === "string" && b.seed ? b.seed.slice(0, 64) : newSeed();
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO trials (id, tenant_id, seed, participants) VALUES (?, ?, ?, ?)").bind(id, c.var.tenant.id, seed, JSON.stringify(stored)).run();
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
  const gone = await c.env.DB.prepare("SELECT 1 FROM responses WHERE trial_id = ? AND participant = ? AND erased = 1 LIMIT 1").bind(t.id, a.participant).first();
  if (gone) return c.json({ error: "この参加者の答えは消してある" }, 409);
  if (b.item !== "A" && b.item !== "B") return c.json({ error: "item は A か B" }, 400);
  const ms = b.ms === undefined || b.ms === null ? null : Number(b.ms);
  if (ms !== null && (!Number.isInteger(ms) || ms < 0 || ms > 3_600_000)) return c.json({ error: "ms が範囲の外" }, 400);
  const answer = typeof b.answer === "string" ? b.answer.slice(0, 2000) : null;
  // 見せたものは割り当てから決める（答える側に選ばせない）。同じ参加者・項目の何回目かで順番の何番目かが決まる
  const done = await c.env.DB.prepare("SELECT count(*) AS n FROM responses WHERE trial_id = ? AND participant = ? AND item = ?").bind(t.id, a.participant, b.item).first<{ n: number }>();
  const k = done?.n ?? 0;
  // 前からの回は項目ごとに 2 回（カードと文）、交差の回は 1 回
  if (k >= a[b.item].length) return c.json({ error: "この項目の答えは済んでいる" }, 409);
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

// 採点（025）。採点者は自分の判定だけを見る（もう 1 人の判定を見せない）
const isGrader = (g: unknown): g is "g1" | "g2" => g === "g1" || g === "g2";

trials.get("/:id/grades", async (c) => {
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const grader = c.req.query("grader");
  if (!isGrader(grader)) return c.json({ error: "grader は g1 か g2" }, 400);
  const { results } = await c.env.DB.prepare("SELECT seq, response_seq, grader, verdict, answer_ja FROM grades WHERE trial_id = ? AND grader = ? ORDER BY seq").bind(t.id, grader).all();
  return c.json({ grades: results });
});

trials.post("/:id/grades", async (c) => {
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const b = await c.req.json<{ response_seq?: unknown; grader?: unknown; verdict?: unknown; answer_ja?: unknown; field?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  if (!isGrader(b.grader)) return c.json({ error: "grader は g1 か g2" }, 400);
  if (!VERDICTS.includes(b.verdict as Verdict)) return c.json({ error: "verdict は correct・wrong・danger" }, 400);
  // どちらの欄で判定したか（11/5）。自分の言葉の欄なら日本語の訳が要り、日本語の欄なら訳を入れない。印は訳のあるなしで読み戻す
  const hasJa = typeof b.answer_ja === "string" && !!b.answer_ja.trim();
  if (b.field !== undefined && b.field !== "ja" && b.field !== "own") return c.json({ error: "field は ja か own" }, 400);
  if (b.field === "own" && !hasJa) return c.json({ error: "自分の言葉の欄で判定したときは、日本語の訳が要る" }, 400);
  if (b.field === "ja" && hasJa) return c.json({ error: "日本語の欄で判定したときは、訳を入れない" }, 400);
  const r = await c.env.DB.prepare("SELECT seq FROM responses WHERE seq = ? AND trial_id = ? AND answer IS NOT NULL").bind(Number(b.response_seq), t.id).first();
  if (!r) return c.json({ error: "この回の答えが無い" }, 400);
  const answerJa = typeof b.answer_ja === "string" && b.answer_ja.trim() ? b.answer_ja.trim().slice(0, 2000) : null;
  const row = await c.env.DB.prepare("INSERT INTO grades (trial_id, tenant_id, response_seq, grader, verdict, answer_ja) VALUES (?, ?, ?, ?, ?, ?) RETURNING seq")
    .bind(t.id, c.var.tenant.id, Number(b.response_seq), b.grader, b.verdict, answerJa)
    .first<{ seq: number }>();
  return c.json({ seq: row?.seq }, 201);
});

// 交差の回の結果（11/5）。項目ごと・カードか文かごとの数。国籍ごとの数はまとめた数だけで、1 人の国籍は「その他」。会社のテナントの中だけで返す
trials.get("/:id/summary", async (c) => {
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const p = JSON.parse(t.participants) as Stored;
  if (Array.isArray(p)) return c.json({ error: "交差の回ではない" }, 400);
  const [rs, gs] = await Promise.all([
    c.env.DB.prepare("SELECT seq, participant, item, shown, ms, answer FROM responses WHERE trial_id = ? AND erased = 0 ORDER BY seq").bind(t.id).all<ExportResponse>(),
    c.env.DB.prepare("SELECT seq, response_seq, grader, verdict, answer_ja FROM grades WHERE trial_id = ? AND erased = 0 ORDER BY seq").bind(t.id).all<ExportGrade>(),
  ]);
  return c.json(crossSummary(p.people, rs.results, gs.results));
});

// 匿名の書き出し（docs/answers.csv の形）
trials.get("/:id/answers.csv", async (c) => {
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const [rs, gs] = await Promise.all([
    c.env.DB.prepare("SELECT seq, participant, item, shown, ms, answer FROM responses WHERE trial_id = ? AND erased = 0 ORDER BY seq").bind(t.id).all<ExportResponse>(),
    c.env.DB.prepare("SELECT seq, response_seq, grader, verdict, answer_ja FROM grades WHERE trial_id = ? AND erased = 0 ORDER BY seq").bind(t.id).all<ExportGrade>(),
  ]);
  const csv = toAnswersCsv(t.seed, participantIds(t.participants), rs.results, gs.results);
  return c.body("﻿" + csv, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="answers.csv"' });
});

// やめた参加者の答えを消す（025b）。答え・秒・日本語の訳を空にして印を付け、監査の記録に「消した」の 1 行だけを足す。
// 消したあとはその人の答えを受け付けない。書き出しには出さない
trials.post("/:id/erase", async (c) => {
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const b = await c.req.json<{ participant?: unknown }>().catch(() => ({}) as { participant?: unknown });
  const p = b.participant;
  if (typeof p !== "string" || !(participantIds(t.participants)).includes(p)) return c.json({ error: "この回の参加者ではない" }, 400);
  const [g, r, pa] = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE grades SET answer_ja = NULL, erased = 1 WHERE trial_id = ? AND erased = 0 AND response_seq IN (SELECT seq FROM responses WHERE trial_id = ? AND participant = ?)").bind(t.id, t.id, p),
    c.env.DB.prepare("UPDATE responses SET answer = NULL, ms = NULL, erased = 1 WHERE trial_id = ? AND participant = ? AND erased = 0").bind(t.id, p),
    c.env.DB.prepare("UPDATE picture_answers SET answer = NULL, erased = 1 WHERE trial_id = ? AND participant = ? AND erased = 0").bind(t.id, p),
  ]);
  await appendAudit(c.env.DB, c.var.tenant.id, { card_id: null, kind: "erase", actor: "system", payload: { trial: t.id, participant: p, responses: r.meta.changes, grades: g.meta.changes, pictures: pa.meta.changes } });
  return c.json({ erased: { responses: r.meta.changes, grades: g.meta.changes, pictures: pa.meta.changes } });
});

// 絵だけの 8 枚と 2 項目と教育担当の勘（059）
const pictureCards = async (db: D1Database, trialId: string) =>
  (await db.prepare("SELECT tc.card_id AS id, c.body FROM trial_cards tc JOIN cards c ON c.id = tc.card_id WHERE tc.trial_id = ? ORDER BY tc.pos").bind(trialId).all<{ id: string; body: string }>()).results.map((r) => {
    const body = JSON.parse(r.body) as { rule: string; motion: unknown };
    return { id: r.id, rule: body.rule, motion: body.motion };
  });
const answeredCount = async (db: D1Database, trialId: string) =>
  (await db.prepare("SELECT count(*) AS n FROM picture_answers WHERE trial_id = ?").bind(trialId).first<{ n: number }>())?.n ?? 0;

// 絵だけで見せるカードを決める。勘の記入か答えが始まったら変えない
trials.post("/:id/cards", async (c) => {
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const b = await c.req.json<{ cards?: unknown }>().catch(() => ({}) as { cards?: unknown });
  const ids = b.cards;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > PICTURES_MAX || !ids.every((x) => typeof x === "string") || new Set(ids).size !== ids.length) {
    return c.json({ error: `cards は重ならないカードの ID の並び（1〜${PICTURES_MAX}）` }, 400);
  }
  const found = await c.env.DB.prepare(`SELECT count(*) AS n FROM cards WHERE tenant_id = ? AND id IN (${ids.map(() => "?").join(",")})`).bind(c.var.tenant.id, ...ids).first<{ n: number }>();
  if (found?.n !== ids.length) return c.json({ error: "このテナントに無いカードがある" }, 400);
  const started = await c.env.DB.prepare("SELECT (SELECT count(*) FROM forecasts WHERE trial_id = ?1) + (SELECT count(*) FROM picture_answers WHERE trial_id = ?1) AS n").bind(t.id).first<{ n: number }>();
  if (started?.n) return c.json({ error: "勘の記入か答えが始まっているので変えない" }, 409);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM trial_cards WHERE trial_id = ?").bind(t.id),
    ...ids.map((id, pos) => c.env.DB.prepare("INSERT INTO trial_cards (trial_id, tenant_id, pos, card_id) VALUES (?, ?, ?, ?)").bind(t.id, c.var.tenant.id, pos, id)),
  ]);
  return c.json({ cards: ids }, 201);
});

// 教育担当の画面: カード（決まりの文つき）・カードごとの最後の予想・答えの数・2 項目の訳
// ?participant= を付けると、その人の順番に並べた絵だけ（決まりの文は返さない）と、答えたカード
trials.get("/:id/pictures", async (c) => {
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const cards = await pictureCards(c.env.DB, t.id);
  const p = c.req.query("participant");
  if (p !== undefined) {
    if (!(participantIds(t.participants)).includes(p)) return c.json({ error: "この回の参加者ではない" }, 400);
    const done = await c.env.DB.prepare("SELECT card_id FROM picture_answers WHERE trial_id = ? AND participant = ?").bind(t.id, p).all<{ card_id: string }>();
    return c.json({ cards: pictureOrder(t.seed, p, cards).map(({ id, motion }) => ({ id, motion })), answered: done.results.map((r) => r.card_id) });
  }
  const fs = await c.env.DB.prepare("SELECT seq, card_id, rate, created_at FROM forecasts WHERE trial_id = ?").bind(t.id).all<{ seq: number; card_id: string; rate: number; created_at: string }>();
  const items = await c.env.DB.prepare("SELECT item, ja, vi FROM trial_items WHERE trial_id = ? ORDER BY item").bind(t.id).all();
  return c.json({ cards, forecasts: [...latestForecasts(fs.results).values()], answers: await answeredCount(c.env.DB, t.id), items: items.results });
});

// 教育担当の勘: カードごとの正答率の予想。絵だけの答えが 1 件でも入ったら受け付けない（記入の日時が結果より前になる）
trials.post("/:id/forecasts", async (c) => {
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const b = await c.req.json<{ card_id?: unknown; rate?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  const rate = Number(b.rate);
  if (!Number.isInteger(rate) || rate < 0 || rate > 100) return c.json({ error: "rate は 0〜100 の整数" }, 400);
  const on = await c.env.DB.prepare("SELECT 1 FROM trial_cards WHERE trial_id = ? AND card_id = ?").bind(t.id, String(b.card_id)).first();
  if (!on) return c.json({ error: "この回で見せるカードではない" }, 400);
  if (await answeredCount(c.env.DB, t.id)) return c.json({ error: "答えが入り始めたので、勘はもう書けない" }, 409);
  const row = await c.env.DB.prepare("INSERT INTO forecasts (trial_id, tenant_id, card_id, rate) VALUES (?, ?, ?, ?) RETURNING seq, created_at")
    .bind(t.id, c.var.tenant.id, b.card_id, rate)
    .first<{ seq: number; created_at: string }>();
  return c.json(row, 201);
});

// 絵だけの答え。見せたカードはその人の順番から決める（答える側に選ばせない）
trials.post("/:id/picture-answers", async (c) => {
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const b = await c.req.json<{ participant?: unknown; answer?: unknown; card_id?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  const p = b.participant;
  if (typeof p !== "string" || !(participantIds(t.participants)).includes(p)) return c.json({ error: "この回の参加者ではない" }, 400);
  const gone = await c.env.DB.prepare("SELECT (SELECT count(*) FROM responses WHERE trial_id = ?1 AND participant = ?2 AND erased = 1) + (SELECT count(*) FROM picture_answers WHERE trial_id = ?1 AND participant = ?2 AND erased = 1) AS n").bind(t.id, p).first<{ n: number }>();
  if (gone?.n) return c.json({ error: "この参加者の答えは消してある" }, 409);
  if (typeof b.answer !== "string" || !b.answer.trim()) return c.json({ error: "answer が要る" }, 400);
  const order = pictureOrder(t.seed, p, await pictureCards(c.env.DB, t.id));
  const done = new Set((await c.env.DB.prepare("SELECT card_id FROM picture_answers WHERE trial_id = ? AND participant = ?").bind(t.id, p).all<{ card_id: string }>()).results.map((r) => r.card_id));
  // 送り直し（11/5）: どのカードへの答えかを付けて送ると、済んだカードには 2 つ目を入れず、別のカードの答えにもしない
  if (typeof b.card_id === "string" && done.has(b.card_id)) return c.json({ error: "このカードの答えは済んでいる" }, 409);
  const next = order.find((x) => !done.has(x.id));
  if (!next) return c.json({ error: "絵の答えは済んでいる" }, 409);
  if (typeof b.card_id === "string" && b.card_id !== next.id) return c.json({ error: "このカードは今の順番ではない" }, 400);
  const row = await c.env.DB.prepare("INSERT INTO picture_answers (trial_id, tenant_id, participant, card_id, answer) VALUES (?, ?, ?, ?, ?) RETURNING seq, created_at")
    .bind(t.id, c.var.tenant.id, p, next.id, b.answer.trim().slice(0, 2000))
    .first<{ seq: number; created_at: string }>();
  return c.json({ ...row, card_id: next.id }, 201);
});

trials.get("/:id/picture-answers", async (c) => {
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const { results } = await c.env.DB.prepare("SELECT seq, participant, card_id, answer, created_at FROM picture_answers WHERE trial_id = ? AND erased = 0 ORDER BY seq").bind(t.id).all();
  return c.json({ answers: results });
});

// 2 項目の元のページの訳。会社のテナント（と練習用）の中だけに置く。公開デモには置かない
trials.post("/:id/items", async (c) => {
  if (c.var.tenant.kind === "demo") return c.json({ error: "2 項目の訳は会社のテナントの中だけ" }, 403);
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const b = await c.req.json<{ item?: unknown; ja?: unknown; vi?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  if (b.item !== "A" && b.item !== "B") return c.json({ error: "item は A か B" }, 400);
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 4000) : null);
  await c.env.DB.prepare(
    "INSERT INTO trial_items (trial_id, tenant_id, item, ja, vi) VALUES (?, ?, ?, ?, ?) ON CONFLICT (trial_id, item) DO UPDATE SET ja = excluded.ja, vi = excluded.vi, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
  )
    .bind(t.id, c.var.tenant.id, b.item, s(b.ja), s(b.vi))
    .run();
  return c.json({ item: b.item, ja: s(b.ja), vi: s(b.vi) }, 201);
});

// 書き換えと消すことは断る
trials.on(["PUT", "PATCH", "DELETE"], ["/:id", "/:id/responses", "/:id/responses/*", "/:id/grades", "/:id/grades/*", "/:id/forecasts", "/:id/forecasts/*", "/:id/picture-answers", "/:id/picture-answers/*"], (c) => c.json({ error: "記録は追記だけ" }, 405));

// ① で見せるもの（11/5 作者）。項目 A・B ごとに、カードとページの画像（元のページの日本語の原文）を結ぶ。
// 表は変えず、結び付けを会社のテナントの置き場（R2・PIN の内側）に回ごとの JSON で置く。ページの画像も同じ置き場に置く
type MaterialItem = { card: string; page: string };
type MaterialConfig = { A: MaterialItem; B: MaterialItem };
const materialKey = (tenantId: string, trialId: string) => `t/${tenantId}/trials/${trialId}/material.json`;

async function readMaterial(env: Env, tenantId: string, trialId: string): Promise<MaterialConfig | null> {
  const obj = await env.FILES.get(materialKey(tenantId, trialId));
  return obj ? ((await obj.json()) as MaterialConfig) : null;
}

trials.put("/:id/material", async (c) => {
  if (c.var.tenant.kind === "demo") return c.json({ error: "① で見せるものは会社のテナントの中だけ" }, 403);
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const b = await c.req.json<Partial<Record<"A" | "B", Partial<MaterialItem>>>>().catch(() => ({}) as Partial<Record<"A" | "B", Partial<MaterialItem>>>);
  const cfg = {} as MaterialConfig;
  for (const item of ["A", "B"] as const) {
    const x = b[item];
    if (!x || typeof x.card !== "string" || typeof x.page !== "string") return c.json({ error: `${item} に card（カードの ID）と page（置き場の名前）が要る` }, 400);
    const card = await c.env.DB.prepare("SELECT 1 FROM cards WHERE id = ? AND tenant_id = ?").bind(x.card, c.var.tenant.id).first();
    if (!card) return c.json({ error: `${item} のカードがこのテナントに無い` }, 400);
    const key = fileKey(c.var.tenant.id, x.page);
    if (!key || !(await c.env.FILES.head(key))) return c.json({ error: `${item} のページの画像が置き場に無い` }, 400);
    cfg[item] = { card: x.card, page: x.page };
  }
  if (cfg.A.card === cfg.B.card) return c.json({ error: "A と B は別のカードにする" }, 400);
  const started = await c.env.DB.prepare("SELECT count(*) AS n FROM responses WHERE trial_id = ?").bind(t.id).first<{ n: number }>();
  if (started?.n) return c.json({ error: "① の答えが始まっているので変えない" }, 409);
  await c.env.FILES.put(materialKey(c.var.tenant.id, t.id), JSON.stringify(cfg), { httpMetadata: { contentType: "application/json" } });
  return c.json(cfg, 201);
});

// その参加者に見せるもの。カードの側は絵とやさしい日本語だけ（文は返さない）、文の側はページの画像の置き場の名前だけ
trials.get("/:id/material", async (c) => {
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const cfg = await readMaterial(c.env, c.var.tenant.id, t.id);
  const p = c.req.query("participant");
  if (p === undefined) return c.json({ material: cfg });
  const a = view(t).assignments.find((x) => x.participant === p);
  if (!a) return c.json({ error: "この回の参加者ではない" }, 400);
  if (!cfg) return c.json({ error: "① で見せるもの（カードとページの画像）がまだ結ばれていない" }, 409);
  const items = await Promise.all(
    (["A", "B"] as const).map(async (item) => {
      const shown = a[item][0];
      if (shown === "text") return { item, shown, page: cfg[item].page };
      const row = await c.env.DB.prepare("SELECT body FROM cards WHERE id = ? AND tenant_id = ?").bind(cfg[item].card, c.var.tenant.id).first<{ body: string }>();
      const body = JSON.parse(row!.body) as { motion: unknown; words?: { ja: string } };
      // 言葉はやさしい日本語だけ（11/5 作者）
      return { item, shown, card: { motion: body.motion, words: body.words ? { ja: body.words.ja } : null } };
    }),
  );
  return c.json({ items });
});
