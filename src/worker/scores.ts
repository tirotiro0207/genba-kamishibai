// 試しの答えの 10 段階の採点（11/7 作者）。作者と監修者の 2 人が、参加者ごとの答えを見て「どれだけ伝わったか」を 1〜10 で付け、
// コメントを残す。② の絵のテストは、カードそのものにも「絵だけでどれだけ伝わるか」を付ける。
// 採点者は入った役割で決まる（作者 → author・監修者 → supervisor）。もう 1 人の点は見せない（相談せずに付けるため）。
// 母語の欄の答えは、採点する人が読めるように Claude で日本語の参考の訳を付けて、答えごとに 1 回だけ残す
import { Hono } from "hono";
import { needsJapanese, unpackAnswer } from "../shared/answer-fields";
import { guardedCall } from "../shared/claude";
import { withWords } from "../shared/picture-order";
import { D1CallLog } from "./api-log";
import { claudeClient, dayBudget } from "./claude-client";
import type { Env } from "./env";
import { type PeopleVars, personName, studentGroup, TEST_GROUP } from "./people";
import { getTrial, pictureCards, readMaterial, view } from "./trials";

export const scoring = new Hono<{ Bindings: Env; Variables: PeopleVars }>();

export type ScoreGrader = "author" | "supervisor";
/** 採点の右のタブの人が入る監修者の枠（11/7 作者「一郎と黒須さんで採点する」）。本番は環境変数で決める */
export const scoreSlot = (env: Env): 1 | 2 => (env.SCORE_SUPERVISOR_SLOT?.trim() === "2" ? 2 : 1);
/** 採点の 2 人の名前。右は SCORE_SUPERVISOR_NAME、無ければその枠の監修者の名前 */
export const scoreNames = (env: Env) => ({
  author: personName(env, { role: "author", slot: 1 }),
  supervisor: env.SCORE_SUPERVISOR_NAME?.trim() || personName(env, { role: "supervisor", slot: scoreSlot(env) }),
});
/** 採点できるのは作者と、決めた枠の監修者だけ（もう 1 人の監修者の点が混ざらないように） */
const graderOf = (env: Env, p: { role: string; slot: number } | null | undefined): ScoreGrader | null =>
  p?.role === "author" ? "author" : p?.role === "supervisor" && p.slot === scoreSlot(env) ? "supervisor" : null;
export const TRANSLATE_MODEL = "claude-sonnet-5-5";

interface Row {
  target: string;
  participant: string;
  ja: string;
  own: string;
}

/** 日本語の訳が要る答え: 母語の欄に字がある、または日本語の欄に日本語の字が無い */
export const needsJa = needsJapanese;
/** 1 回に訳す答えの数（長い答えが多くても返事が切れないように分ける） */
const JA_CHUNK = 25;

/** 試しの ID（student_test01 など・国籍「テスト」）は採点に出さない */
const isTest = (participant: string, group?: string) => group === TEST_GROUP || studentGroup(participant) === TEST_GROUP;

/** latest: 答えのあるいちばん新しい回（採点の入口は回を選ばずに開く） */
async function resolveTrial(db: D1Database, tenantId: string, id: string) {
  if (id !== "latest") return id;
  const row = await db
    .prepare("SELECT id FROM trials WHERE tenant_id = ? AND id IN (SELECT trial_id FROM responses WHERE erased = 0 UNION SELECT trial_id FROM picture_answers WHERE erased = 0) ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .bind(tenantId)
    .first<{ id: string }>();
  return row?.id ?? "";
}

async function sheetRows(env: Env, tenantId: string, trialId: string) {
  const t = await getTrial(env.DB, tenantId, await resolveTrial(env.DB, tenantId, trialId));
  if (!t) return null;
  const v = view(t);
  const groups = new Map((v.assignments as { participant: string; group?: string; set?: 1 | 2 }[]).map((a) => [a.participant, a]));
  const keep = (p: string) => !isTest(p, groups.get(p)?.group);
  const responses = (
    await env.DB.prepare("SELECT seq, participant, item, shown, ms, answer FROM responses WHERE trial_id = ? AND erased = 0 AND answer IS NOT NULL ORDER BY participant, item").bind(t.id).all<{ seq: number; participant: string; item: "A" | "B"; shown: "card" | "text"; ms: number | null; answer: string }>()
  ).results.filter((r) => keep(r.participant));
  const cards = await pictureCards(env.DB, t.id);
  const pos = new Map(cards.map((x) => [x.id, x.pos]));
  const pictures = (
    await env.DB.prepare("SELECT seq, participant, card_id, answer FROM picture_answers WHERE trial_id = ? AND erased = 0 AND answer IS NOT NULL ORDER BY seq").bind(t.id).all<{ seq: number; participant: string; card_id: string; answer: string }>()
  ).results.filter((r) => keep(r.participant));
  return { t, v, groups, responses, cards, pos, pictures };
}

/** 採点の表: 2 人の名前・① の答え・② のカードと答え・自分の点だけ・参考の訳 */
scoring.get("/:id/scoring", async (c) => {
  const me = graderOf(c.env, c.var.person);
  if (!me) return c.json({ error: "採点は作者か監修者の役割で入ってください" }, 403);
  const s = await sheetRows(c.env, c.var.tenant.id, c.req.param("id"));
  if (!s) return c.json({ error: "回が無い" }, 404);
  const { t, groups, responses, cards, pos, pictures } = s;
  // ① の 2 項目のカード（正しい意味を見ながら採点する）
  const cfg = await readMaterial(c.env, c.var.tenant.id, t.id);
  const items = cfg
    ? await Promise.all(
        (["A", "B"] as const).map(async (item) => {
          const row = await c.env.DB.prepare("SELECT body FROM cards WHERE id = ? AND tenant_id = ?").bind(cfg[item].card, c.var.tenant.id).first<{ body: string }>();
          const body = row ? (JSON.parse(row.body) as { rule: string; motion: unknown; words?: { ja?: string } }) : null;
          return { item, rule: body?.rule ?? "", motion: body?.motion ?? null, words: body?.words?.ja ?? "" };
        }),
      )
    : [];
  const mine = (await c.env.DB.prepare("SELECT target, score, comment FROM scores WHERE trial_id = ? AND grader = ? ORDER BY seq").bind(t.id, me).all<{ target: string; score: number | null; comment: string | null }>()).results;
  const latest: Record<string, { score: number | null; comment: string }> = {};
  for (const r of mine) latest[r.target] = { score: r.score, comment: r.comment ?? "" };
  const ja: Record<string, string> = {};
  for (const r of (await c.env.DB.prepare("SELECT target, ja FROM score_ja WHERE trial_id = ?").bind(t.id).all<{ target: string; ja: string }>()).results) ja[r.target] = r.ja;
  const person = (p: string) => ({ participant: p, group: groups.get(p)?.group ?? studentGroup(p) });
  return c.json({
    trial: { id: t.id, created_at: t.created_at },
    me,
    names: scoreNames(c.env),
    items,
    responses: responses.map((r) => ({ target: `r:${r.seq}`, ...person(r.participant), item: r.item, shown: r.shown, ms: r.ms, answer: unpackAnswer(r.answer) ?? { ja: "", own: "" } })),
    cards: cards.map((x) => ({ target: `c:${x.id}`, id: x.id, pos: x.pos, rule: x.rule, motion: x.motion, words: x.words })),
    pictures: pictures.map((r) => ({
      target: `p:${r.seq}`,
      ...person(r.participant),
      card_id: r.card_id,
      words: withWords(groups.get(r.participant)?.set, pos.get(r.card_id) ?? -1),
      answer: unpackAnswer(r.answer) ?? { ja: "", own: "" },
    })),
    scores: latest,
    ja,
  });
});

/** 点とコメントを足す（追記だけ）。点は 1〜10 か空、コメントは 2000 字まで */
scoring.post("/:id/scores", async (c) => {
  const me = graderOf(c.env, c.var.person);
  if (!me) return c.json({ error: "採点は作者か監修者の役割で入ってください" }, 403);
  const t = await getTrial(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!t) return c.json({ error: "回が無い" }, 404);
  const b = await c.req.json<{ target?: unknown; score?: unknown; comment?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  const target = typeof b.target === "string" ? b.target : "";
  const score = b.score === null || b.score === undefined || b.score === "" ? null : Number(b.score);
  if (score !== null && !(Number.isInteger(score) && score >= 1 && score <= 10)) return c.json({ error: "点は 1〜10" }, 400);
  const comment = typeof b.comment === "string" ? b.comment.trim().slice(0, 2000) : "";
  // 対象がこの回のものかを確かめる
  const m = target.match(/^(r|p|c):(.+)$/);
  if (!m) return c.json({ error: "対象の形が違う" }, 400);
  const sql =
    m[1] === "r"
      ? "SELECT 1 FROM responses WHERE trial_id = ? AND seq = ? AND erased = 0"
      : m[1] === "p"
        ? "SELECT 1 FROM picture_answers WHERE trial_id = ? AND seq = ? AND erased = 0"
        : "SELECT 1 FROM trial_cards WHERE trial_id = ? AND card_id = ?";
  if (!(await c.env.DB.prepare(sql).bind(t.id, m[1] === "c" ? m[2] : Number(m[2])).first())) return c.json({ error: "この回の答えではない" }, 400);
  await c.env.DB.prepare("INSERT INTO scores (trial_id, tenant_id, target, grader, score, comment) VALUES (?, ?, ?, ?, ?, ?)").bind(t.id, c.var.tenant.id, target, me, score, comment || null).run();
  return c.json({ target, score, comment }, 201);
});

const JA_SCHEMA = {
  type: "object",
  properties: { items: { type: "array", items: { type: "object", properties: { target: { type: "string" }, ja: { type: "string" } }, required: ["target", "ja"], additionalProperties: false } } },
  required: ["items"],
  additionalProperties: false,
};

/** まだ訳の無い母語の答えを、まとめて 1 回で日本語にする（参考の訳）。訳は答えごとに 1 回だけ残す */
scoring.post("/:id/scoring/translate", async (c) => {
  if (!graderOf(c.env, c.var.person)) return c.json({ error: "採点は作者か監修者の役割で入ってください" }, 403);
  const s = await sheetRows(c.env, c.var.tenant.id, c.req.param("id"));
  if (!s) return c.json({ error: "回が無い" }, 404);
  const have = new Set((await c.env.DB.prepare("SELECT target FROM score_ja WHERE trial_id = ?").bind(s.t.id).all<{ target: string }>()).results.map((r) => r.target));
  const rows: Row[] = [
    ...s.responses.map((r) => ({ target: `r:${r.seq}`, participant: r.participant, ...(unpackAnswer(r.answer) ?? { ja: "", own: "" }) })),
    ...s.pictures.map((r) => ({ target: `p:${r.seq}`, participant: r.participant, ...(unpackAnswer(r.answer) ?? { ja: "", own: "" }) })),
  ].filter((r) => !have.has(r.target) && needsJa(r));
  if (!rows.length) return c.json({ translated: 0 });
  const client = claudeClient(c.env);
  if (!client) return c.json({ error: "Claude の鍵が無い" }, 503);
  let done = 0;
  for (let i = 0; i < rows.length; i += JA_CHUNK) {
    const part = rows.slice(i, i + JA_CHUNK);
    const input = part.map((r) => ({ target: r.target, japanese_field: r.ja, own_language_field: r.own }));
    const msg = await guardedCall(
      { client, log: new D1CallLog(c.env.DB), dayBudgetUsd: dayBudget(c.env) },
      {
        purpose: "app",
        label: "採点の参考の訳",
        params: {
          model: TRANSLATE_MODEL,
          max_tokens: 16000,
          system:
            "外国籍の新入社員が、安全の絵のカードを見て書いた答えを、採点する日本人が読めるように日本語に訳す。答えは日本語の欄と母語の欄（ベトナム語・クメール語・ミャンマー語など）がある。母語の欄と、日本語の欄の日本語でない部分を、両方とも訳す（日本語で書いてある部分はそのまま入れて、1 つの日本語の文にする）。書いてあることだけを、そのまま素直に訳す。足さない・直さない・正しい答えに寄せない。読めない字は「（読めない）」と書く。",
          output_config: { format: { type: "json_schema", schema: JA_SCHEMA } },
          messages: [{ role: "user", content: JSON.stringify(input) }],
        } as unknown as Parameters<typeof guardedCall>[1]["params"],
      },
    );
    const out = msg.content.find((b) => b.type === "text");
    let items: { target: string; ja: string }[] = [];
    try {
      items = (JSON.parse(out && out.type === "text" ? out.text : "{}") as { items?: { target: string; ja: string }[] }).items ?? [];
    } catch {
      continue;
    }
    const want = new Set(part.map((r) => r.target));
    const ok = items.filter((x) => want.has(x.target) && typeof x.ja === "string" && x.ja.trim());
    if (ok.length)
      await c.env.DB.batch(ok.map((x) => c.env.DB.prepare("INSERT OR IGNORE INTO score_ja (trial_id, tenant_id, target, ja) VALUES (?, ?, ?, ?)").bind(s.t.id, c.var.tenant.id, x.target, x.ja.trim().slice(0, 4000))));
    done += ok.length;
  }
  return c.json({ translated: done });
});
