// ゲストで動作確認する入口（11/7 作者）。入口の画面の「ゲストで動作確認する」を押すと、その人だけの使い捨ての置き場（練習用のテナント）を作り、
// 作者の役で入って、作る側の画面（カードを作る・キャラクターを作る）をそのまま試せるようにする。会社の資料やカードは見えない。
// 歯止めは 3 つ: 置き場を作るのは同じ所（IP）から 1 日 5 回まで、Claude を呼ぶ口は同じ所から 1 日 20 回まで、全体の 1 日の費用の上限（dayBudget）
import { type Context, Hono, type Next } from "hono";
import type { Env } from "./env";
import { clientIp, hitRateLimit, type RateLimit } from "./rate-limit";
import type { TenantVars } from "./tenant";

export const GUEST_PREFIX = "guest-";
export const GUEST_OPEN_LIMIT: RateLimit = { limit: 5, windowSec: 24 * 3600 };
export const GUEST_AI_LIMIT: RateLimit = { limit: 20, windowSec: 24 * 3600 };
const JST_MS = 9 * 3600 * 1000;

/** Claude を呼ぶ口（取り出し・チャットの返事・PDF と写真の文字・カードの作成と確かめ・直し・アセットの直し・採点の参考の訳） */
export const GUEST_AI_PATH = /^\/api\/t\/[^/]+\/(extract(\/[^/]+\/make)?|chats\/(pdf|image|[^/]+\/messages)|cards\/[^/]+\/(verify|redo|rework|fix)|assets(\/.*)?\/(fix|redraw|ask)|trials\/[^/]+\/scoring\/translate)$/;

export const isGuestTenant = (t: { id: string; kind: string }) => t.kind === "practice" && t.id.startsWith(GUEST_PREFIX);

export const guest = new Hono<{ Bindings: Env }>();

guest.post("/", async (c) => {
  if (!(await hitRateLimit(c.env.DB, `guest:${clientIp(c)}`, GUEST_OPEN_LIMIT, Date.now() + JST_MS)))
    return c.json({ error: `ゲストの置き場を作るのは、同じ所から 1 日 ${GUEST_OPEN_LIMIT.limit} 回までです` }, 429);
  const id = `${GUEST_PREFIX}${[...crypto.getRandomValues(new Uint8Array(6))].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  await c.env.DB.prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'practice', 'ゲスト')").bind(id).run();
  return c.json({ tenant: id }, 201);
});

/**
 * 本番の公開の置き場（PUBLIC_DEMO）でも、ゲストの置き場は作る側の操作を通す。Claude を呼ぶ口だけ、同じ所から 1 日の回数を数える。
 * publicGate の前に置く（ゲストでなければ何もしない）
 */
export async function guestGate(c: Context<{ Bindings: Env; Variables: TenantVars }>, next: Next) {
  if (!isGuestTenant(c.var.tenant)) return next();
  if (c.req.method === "POST" && GUEST_AI_PATH.test(c.req.path)) {
    if (!(await hitRateLimit(c.env.DB, `guest-ai:${clientIp(c)}`, GUEST_AI_LIMIT, Date.now() + JST_MS)))
      return c.json({ error: `ゲストで AI を使えるのは、同じ所から 1 日 ${GUEST_AI_LIMIT.limit} 回までです` }, 429);
  }
  await next();
}
