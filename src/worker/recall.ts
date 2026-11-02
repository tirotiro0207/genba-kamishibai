// 発行の管理（088）の記録の書き込み。新入社員がカードを見た記録と、署名済みを止めたときの回収の知らせ。
// どちらも追記・更新だけで、消さない。読む口は issue.ts。
import type { SignPayload } from "./sign";

/** 見た記録を足す。同じ版・同じしるしなら最後に見た時刻と回数を更新する */
export async function recordView(db: D1Database, tenantId: string, cardId: string, version: number, actor: string, now = new Date()): Promise<void> {
  const t = now.toISOString();
  await db
    .prepare(
      "INSERT INTO card_views (tenant_id, card_id, version, actor, first_viewed_at, last_viewed_at, views) VALUES (?, ?, ?, ?, ?, ?, 1) " +
        "ON CONFLICT (tenant_id, card_id, version, actor) DO UPDATE SET last_viewed_at = excluded.last_viewed_at, views = views + 1",
    )
    .bind(tenantId, cardId, version, actor, t, t)
    .run();
}

export const REASON_MAX = 200;
/** 停止の理由を受け取る。文字でなければ null（断る）、無ければ "" */
export function readReason(x: unknown): string | null {
  if (x === undefined || x === null) return "";
  return typeof x === "string" ? x.trim().slice(0, REASON_MAX) : null;
}

/** 署名済みを止めたとき、回収の知らせを 1 つ作る。署名の日付は最後の署名の記録から取る */
export async function createRecall(db: D1Database, tenantId: string, card: { id: string; version: number; body: string }, stoppedBy: string, reason: string, now = new Date()): Promise<number> {
  const sign = await db
    .prepare("SELECT payload FROM audit_log WHERE tenant_id = ? AND card_id = ? AND kind = 'sign' ORDER BY created_at DESC, n DESC LIMIT 1")
    .bind(tenantId, card.id)
    .first<{ payload: string }>();
  const signedAt = sign ? (JSON.parse(sign.payload) as SignPayload).signed_at : null;
  const rule = (JSON.parse(card.body) as { rule: string }).rule;
  const res = await db
    .prepare("INSERT INTO recall_notices (tenant_id, card_id, version, signed_at, rule, reason, stopped_by, stopped_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(tenantId, card.id, card.version, signedAt, rule, reason, stoppedBy, now.toISOString())
    .run();
  return res.meta.last_row_id;
}
