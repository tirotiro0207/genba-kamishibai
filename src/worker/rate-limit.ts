// 同じ所（IP）から呼べる回数を時間の枠ごとに制限する（002b）。公開デモの「その場で作る」と、PIN の打ち間違い（総当たりの歯止め）に使う
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface RateLimit {
  limit: number;
  windowSec: number;
}

/** PIN の打ち間違いは、同じ所・同じテナントで 15 分に 10 回まで（会社の PIN と役割の PIN を合わせて数える） */
export const PIN_RATE_LIMIT: RateLimit = { limit: 10, windowSec: 15 * 60 };
/** 古い枠の行を残す長さ。いちばん長い枠（1 日）より長くとる */
export const RATE_KEEP_SEC = 2 * 24 * 3600;

const keyOf = (key: string) => sha256(`demo:${key}`);
const windowOf = (rl: RateLimit, nowMs: number) => Math.floor(nowMs / 1000 / rl.windowSec) * rl.windowSec;

/** 1 回数えて、枠の中の回数が上限以下なら true。新しい枠の最初の 1 回のときに、古い枠の行を消す（増えるだけにしない） */
export async function hitRateLimit(db: D1Database, key: string, rl: RateLimit, nowMs = Date.now()): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO rate_hits (key_hash, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT (key_hash, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(await keyOf(key), windowOf(rl, nowMs))
    .first<{ count: number }>();
  const count = row?.count ?? 1;
  if (count === 1) await db.prepare("DELETE FROM rate_hits WHERE window_start < ?").bind(Math.floor(nowMs / 1000) - RATE_KEEP_SEC).run();
  return count <= rl.limit;
}

/** 数えずに、枠の中の回数がもう上限に届いているかを見る（届いていれば true） */
export async function overRateLimit(db: D1Database, key: string, rl: RateLimit, nowMs = Date.now()): Promise<boolean> {
  const row = await db.prepare("SELECT count FROM rate_hits WHERE key_hash = ? AND window_start = ?").bind(await keyOf(key), windowOf(rl, nowMs)).first<{ count: number }>();
  return (row?.count ?? 0) >= rl.limit;
}

/** PIN の打ち間違いを数える鍵（IP とテナント） */
export const pinKey = (ip: string, tenantId: string) => `pin:${ip}:${tenantId}`;
export const clientIp = (c: { req: { header: (n: string) => string | undefined } }) => c.req.header("cf-connecting-ip") ?? "unknown";
