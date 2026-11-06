// 公開デモの入口（093b）。架空の会社（demo）で「その場で作る」。入れた文から決まりを取り出し、最初の 1 つだけを 1 枚のカードにする。
// 歯止めは 2 つ: 同じ IP から 1 日（日本時間）3 回まで、1 回の生成の上限（1 回の呼び出しの費用の上限＝max_tokens の見込みと、作るのは 1 枚まで）。
// 1 日・全体の USD の上限は付けない（公開デモが途中で止まらないように。作者の判断・docs/decisions.md）。
import { Hono, type Context, type Next } from "hono";
import { DEFAULT_LIMITS, guardedCall, type GuardedDeps } from "../shared/claude";
import { parseRules, rulesParams } from "../shared/extract/rules";
import { makeCard, type OkRule } from "../shared/make/maker";
import { makeWords } from "../shared/make/words";
import { D1CallLog } from "./api-log";
import { addTerms, cardView, createCard } from "./cards";
import { claudeClient } from "./claude-client";
import type { Env } from "./env";
import { locator } from "./extract";
import { hitRateLimit, type RateLimit } from "./rate-limit";
import type { TenantVars } from "./tenant";

export const DEMO_TENANT = "demo";
/** 同じ IP から 1 日 3 回 */
export const DEMO_MAKE_LIMIT: RateLimit = { limit: 3, windowSec: 24 * 3600 };
/** 入れられる文の長さ（取り出しの入力の上限。長い資料は会社のテナントで） */
export const DEMO_TEXT_MAX = 1000;
const JST_MS = 9 * 3600 * 1000;
/**
 * 公開デモの用途だけ、1 日と全体の上限を外す。1 回の上限は残し、作る呼び出しの max_tokens の見込み（約 0.32 USD）が通る 0.5 にする（MCP と同じ）
 */
export const DEMO_LIMITS = { ...DEFAULT_LIMITS, demo: { perCallUsd: 0.5, perDayUsd: Infinity, totalUsd: Infinity } };

export const demo = new Hono<{ Bindings: Env }>();

demo.post("/make", async (c) => {
  const b = await c.req.json<{ text?: unknown }>().catch(() => ({}) as { text?: unknown });
  const text = typeof b.text === "string" ? b.text.replaceAll("\r\n", "\n").trim() : "";
  if (!text || text.length > DEMO_TEXT_MAX) return c.json({ error: `文は 1〜${DEMO_TEXT_MAX} 字` }, 400);
  // 数えるのは呼ぶ前。日本時間の 0 時で切り替わるよう、時刻を 9 時間ずらして枠を決める
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  if (!(await hitRateLimit(c.env.DB, `make:${ip}`, DEMO_MAKE_LIMIT, Date.now() + JST_MS))) return c.json({ error: `その場で作るのは、同じ所から 1 日 ${DEMO_MAKE_LIMIT.limit} 回までです` }, 429);
  const client = claudeClient(c.env);
  if (!client) return c.json({ error: "Claude の鍵が無い" }, 503);
  const deps: GuardedDeps = { client, log: new D1CallLog(c.env.DB), limits: DEMO_LIMITS, dayBudgetUsd: Infinity };
  const msg = await guardedCall(deps, { purpose: "demo", label: "取り出し（公開デモ）", params: rulesParams(text) });
  const rules = parseRules(msg, text);
  if (!rules.length) return c.json({ error: "作業員が守る決まりが見つからなかった" }, 422);
  // 作るのは最初の 1 つだけ。取り出しと OK は、画面の流れと同じ表に残す
  const id = crypto.randomUUID();
  const source = { kind: "speech" as const };
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO extractions (id, tenant_id, input, rules) VALUES (?, ?, ?, ?)").bind(id, DEMO_TENANT, JSON.stringify({ text, focus: null, source }), JSON.stringify(rules)),
    c.env.DB.prepare("INSERT INTO extraction_oks (extraction_id, tenant_id, items, actor) VALUES (?, ?, ?, ?)").bind(id, DEMO_TENANT, "[0]", "demo"),
  ]);
  const rule = rules[0] as OkRule;
  const made = await makeCard(deps, "demo", rule, locator(id, text, source));
  const words = await makeWords(deps, "demo", made.card);
  const row = await createCard(c.env.DB, DEMO_TENANT, { ...made.card, words: words.words }, "demo", [rule.from.quote, ...rule.reasons.map((r) => r.from.quote)]);
  await addTerms(c.env.DB, DEMO_TENANT, row.id, words.terms);
  return c.json({ ...cardView(row), rules: rules.length }, 201);
});

/**
 * 本番（PUBLIC_DEMO）では、会社でないテナント（練習用・架空の会社）は見るだけにする。
 * API を呼ぶ口と書き込みは /api/demo/make だけ。カードを開いた印（/cards/:id/open）・役割で入る（/login。しるしを作るだけ）・
 * 新入社員が見た印（/read/cards/:id/seen）は通す。試しの回（/trials）の書き込みは本番の公開の置き場では受けない
 */
const PUBLIC_POSTS = /^\/api\/t\/[^/]+\/(cards\/[^/]+\/open|login|read\/cards\/[^/]+\/seen)$/;
export async function publicGate(c: Context<{ Bindings: Env; Variables: TenantVars }>, next: Next) {
  if (!c.env.PUBLIC_DEMO || c.var.tenant.kind === "company") return next();
  const m = c.req.method;
  if (m === "GET" || m === "HEAD" || (m === "POST" && PUBLIC_POSTS.test(c.req.path))) return next();
  return c.json({ error: "公開の置き場では見るだけです。作るのは「その場で作る」から" }, 403);
}
