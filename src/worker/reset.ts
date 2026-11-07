// データを最初の状態に戻す（030）。練習用テナントは一度で戻る。会社と架空の会社のテナントは（会社は監修者の役割で）、
// テナントの番号を confirm に打って確かめてから戻す。戻すのはそのテナントのカード・回答の記録・採点・
// 作るチャット（添付した資料の文字を含む）・夜間の仕分けと下書きの記録・開いた時刻だけで、
// ほかのテナントと、利用者・監査の記録は残る（監査の記録は連鎖を新しく始め、古い連鎖はとっておく）。
// 置き場（R2）の資料は消さない（資料はカードの元で、戻したあとに作り直すときにも使うため）。
import { Hono } from "hono";
import { newChainStatement, nextChainName } from "./audit";
import type { Env } from "./env";
import { cleanupCardSessions, type DeleteSession, sessionDeleter } from "./exemplars";
import type { PeopleVars } from "./people";

/** 消す表（子から順に） */
export const RESET_TABLES = [
  "scores",
  "score_ja",
  "grades",
  "responses",
  "forecasts",
  "picture_answers",
  "trial_items",
  "trial_cards",
  "trial_joins",
  "trials",
  "night_drafts",
  "night_pages",
  "night_runs",
  "card_chats",
  "extraction_oks",
  "extractions",
  "glossary",
  "company_words",
  "card_pairs",
  "card_views",
  "card_opens",
  "card_exemplars",
  "recall_notices",
  "sample_reviews",
  "weekly_samples",
  "card_posts",
  "morning_sets",
  "cards",
] as const;

/**
 * テナントを戻す。カードに結び付いた Managed Agents のセッションは、先に消してから行を消す。
 * 消せなかったセッション（鍵が無い・失敗）の行は残し、あとで手で消せるようにする（宙に浮かせない）
 */
export async function resetTenant(db: D1Database, tenantId: string, del: DeleteSession | null = null) {
  const pending = await db.prepare("SELECT DISTINCT card_id FROM card_sessions WHERE tenant_id = ? AND deleted_at IS NULL").bind(tenantId).all<{ card_id: string }>();
  const sessions = { deleted: 0, failed: 0, left: 0 };
  for (const { card_id } of pending.results) {
    const r = await cleanupCardSessions(db, tenantId, card_id, del);
    sessions.deleted += r.deleted;
    sessions.failed += r.failed;
    sessions.left += r.left;
  }
  const counts = await db.batch(RESET_TABLES.map((t) => db.prepare(`SELECT count(*) AS n FROM ${t} WHERE tenant_id = ?`).bind(tenantId)));
  const chain = await nextChainName(db, tenantId);
  // 開いて・消して・新しい連鎖を始めて・閉じる（閉じるときに、戻したあとの連鎖の名前を残す）を 1 つのバッチで
  await db.batch([
    db.prepare("INSERT INTO resets (tenant_id) VALUES (?)").bind(tenantId),
    ...RESET_TABLES.map((t) => db.prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).bind(tenantId)),
    db.prepare("DELETE FROM card_sessions WHERE tenant_id = ? AND deleted_at IS NOT NULL").bind(tenantId),
    newChainStatement(db, tenantId, chain),
    db.prepare("UPDATE resets SET open = 0, chain_after = ? WHERE tenant_id = ? AND open = 1").bind(chain, tenantId),
  ]);
  return { removed: Object.fromEntries(RESET_TABLES.map((t, i) => [t, (counts[i].results[0] as { n: number }).n])), chain, sessions };
}

export const reset = new Hono<{ Bindings: Env; Variables: PeopleVars }>();

reset.post("/", async (c) => {
  const t = c.var.tenant;
  if (t.kind !== "practice") {
    // 署名済みのカードと回答まで消えるので、会社のテナントは監修者だけが戻せる（架空の会社は誰でも役割を選べるので関所にならない）
    if (t.kind === "company" && c.var.person?.role !== "supervisor") return c.json({ error: "データを戻すのは監修者だけ" }, 403);
    const { confirm } = await c.req.json<{ confirm?: string }>().catch(() => ({}) as { confirm?: string });
    if (confirm !== t.id) return c.json({ error: `確かめのため confirm にテナントの番号（${t.id}）を入れてください` }, 428);
  }
  return c.json(await resetTenant(c.env.DB, t.id, sessionDeleter(c.env)));
});
