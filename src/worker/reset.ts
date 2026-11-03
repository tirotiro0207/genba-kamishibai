// データを最初の状態に戻す（030）。練習用テナントは一度で戻る。会社と架空の会社のテナントは、
// テナントの番号を confirm に打って確かめてから戻す。戻すのはそのテナントのカード・回答の記録・採点だけで、
// ほかのテナントと、利用者・監査の記録は残る（監査の記録は連鎖を新しく始め、古い連鎖はとっておく）。
import { Hono } from "hono";
import { startNewChain } from "./audit";
import type { Env } from "./env";
import type { TenantVars } from "./tenant";

/** 消す表（子から順に） */
export const RESET_TABLES = ["grades", "responses", "forecasts", "picture_answers", "trial_items", "trial_cards", "trials", "extraction_oks", "extractions", "glossary", "company_words", "card_pairs", "card_views", "card_exemplars", "recall_notices", "weekly_samples", "cards"] as const;

export async function resetTenant(db: D1Database, tenantId: string) {
  const counts = await db.batch(RESET_TABLES.map((t) => db.prepare(`SELECT count(*) AS n FROM ${t} WHERE tenant_id = ?`).bind(tenantId)));
  await db.batch([
    db.prepare("INSERT INTO resets (tenant_id) VALUES (?)").bind(tenantId),
    ...RESET_TABLES.map((t) => db.prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).bind(tenantId)),
    db.prepare("UPDATE resets SET open = 0 WHERE tenant_id = ? AND open = 1").bind(tenantId),
  ]);
  const chain = await startNewChain(db, tenantId);
  return { removed: Object.fromEntries(RESET_TABLES.map((t, i) => [t, (counts[i].results[0] as { n: number }).n])), chain };
}

export const reset = new Hono<{ Bindings: Env; Variables: TenantVars }>();

reset.post("/", async (c) => {
  const t = c.var.tenant;
  if (t.kind !== "practice") {
    const { confirm } = await c.req.json<{ confirm?: string }>().catch(() => ({}) as { confirm?: string });
    if (confirm !== t.id) return c.json({ error: `確かめのため confirm にテナントの番号（${t.id}）を入れてください` }, 428);
  }
  return c.json(await resetTenant(c.env.DB, t.id));
});
