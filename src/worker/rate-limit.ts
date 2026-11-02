// 公開デモで、同じ IP から呼べる回数を時間の枠ごとに制限する（002b）
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface RateLimit {
  limit: number;
  windowSec: number;
}

export const DEMO_RATE_LIMIT: RateLimit = { limit: 5, windowSec: 3600 };

/** 1 回数えて、枠の中の回数が上限以下なら true */
export async function hitRateLimit(db: D1Database, ip: string, rl: RateLimit = DEMO_RATE_LIMIT, nowMs = Date.now()): Promise<boolean> {
  const key = await sha256(`demo:${ip}`);
  const windowStart = Math.floor(nowMs / 1000 / rl.windowSec) * rl.windowSec;
  const row = await db
    .prepare(
      `INSERT INTO rate_hits (key_hash, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT (key_hash, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return (row?.count ?? 1) <= rl.limit;
}
