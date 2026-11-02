// 回答の記録アプリの保存（011）。回を作ると種と割り当てが残り、答えは追記だけ受け付ける。
import { Hono } from "hono";
import { type ExportGrade, type ExportResponse, toAnswersCsv, VERDICTS, type Verdict } from "../shared/answers-csv";
import { assign, newSeed } from "../shared/assign";
import { appendAudit } from "./audit";
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
  const gone = await c.env.DB.prepare("SELECT 1 FROM responses WHERE trial_id = ? AND participant = ? AND erased = 1 LIMIT 1").bind(t.id, a.participant).first();
  if (gone) return c.json({ error: "この参加者の答えは消してある" }, 409);
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
  const b = await c.req.json<{ response_seq?: unknown; grader?: unknown; verdict?: unknown; answer_ja?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  if (!isGrader(b.grader)) return c.json({ error: "grader は g1 か g2" }, 400);
  if (!VERDICTS.includes(b.verdict as Verdict)) return c.json({ error: "verdict は correct・wrong・danger" }, 400);
  const r = await c.env.DB.prepare("SELECT seq FROM responses WHERE seq = ? AND trial_id = ? AND answer IS NOT NULL").bind(Number(b.response_seq), t.id).first();
  if (!r) return c.json({ error: "この回の答えが無い" }, 400);
  const answerJa = typeof b.answer_ja === "string" && b.answer_ja.trim() ? b.answer_ja.trim().slice(0, 2000) : null;
  const row = await c.env.DB.prepare("INSERT INTO grades (trial_id, tenant_id, response_seq, grader, verdict, answer_ja) VALUES (?, ?, ?, ?, ?, ?) RETURNING seq")
    .bind(t.id, c.var.tenant.id, Number(b.response_seq), b.grader, b.verdict, answerJa)
    .first<{ seq: number }>();
  return c.json({ seq: row?.seq }, 201);
});

// 匿名の書き出し（docs/answers.csv の形）
trials.get("/:id/answers.csv", async (c) => {
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const [rs, gs] = await Promise.all([
    c.env.DB.prepare("SELECT seq, participant, item, shown, ms, answer FROM responses WHERE trial_id = ? AND erased = 0 ORDER BY seq").bind(t.id).all<ExportResponse>(),
    c.env.DB.prepare("SELECT seq, response_seq, grader, verdict, answer_ja FROM grades WHERE trial_id = ? AND erased = 0 ORDER BY seq").bind(t.id).all<ExportGrade>(),
  ]);
  const csv = toAnswersCsv(t.seed, JSON.parse(t.participants) as string[], rs.results, gs.results);
  return c.body("﻿" + csv, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="answers.csv"' });
});

// やめた参加者の答えを消す（025b）。答え・秒・日本語の訳を空にして印を付け、監査の記録に「消した」の 1 行だけを足す。
// 消したあとはその人の答えを受け付けない。書き出しには出さない
trials.post("/:id/erase", async (c) => {
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const b = await c.req.json<{ participant?: unknown }>().catch(() => ({}) as { participant?: unknown });
  const p = b.participant;
  if (typeof p !== "string" || !(JSON.parse(t.participants) as string[]).includes(p)) return c.json({ error: "この回の参加者ではない" }, 400);
  const [g, r] = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE grades SET answer_ja = NULL, erased = 1 WHERE trial_id = ? AND erased = 0 AND response_seq IN (SELECT seq FROM responses WHERE trial_id = ? AND participant = ?)").bind(t.id, t.id, p),
    c.env.DB.prepare("UPDATE responses SET answer = NULL, ms = NULL, erased = 1 WHERE trial_id = ? AND participant = ? AND erased = 0").bind(t.id, p),
  ]);
  await appendAudit(c.env.DB, c.var.tenant.id, { card_id: null, kind: "erase", actor: "system", payload: { trial: t.id, participant: p, responses: r.meta.changes, grades: g.meta.changes } });
  return c.json({ erased: { responses: r.meta.changes, grades: g.meta.changes } });
});

// 書き換えと消すことは断る
trials.on(["PUT", "PATCH", "DELETE"], ["/:id", "/:id/responses", "/:id/responses/*", "/:id/grades", "/:id/grades/*"], (c) => c.json({ error: "記録は追記だけ" }, 405));
