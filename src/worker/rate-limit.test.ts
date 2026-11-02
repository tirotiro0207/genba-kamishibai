import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { hitRateLimit } from "./rate-limit";

describe("公開デモの IP ごとの回数の制限（002b）", () => {
  const rl = { limit: 2, windowSec: 60 };
  const t = Date.parse("2026-11-02T06:00:10Z");

  it("枠の中で上限を超えると false、別の IP と次の枠は数えなおす", async () => {
    expect(await hitRateLimit(env.DB, "1.2.3.4", rl, t)).toBe(true);
    expect(await hitRateLimit(env.DB, "1.2.3.4", rl, t)).toBe(true);
    expect(await hitRateLimit(env.DB, "1.2.3.4", rl, t)).toBe(false);
    expect(await hitRateLimit(env.DB, "5.6.7.8", rl, t)).toBe(true);
    expect(await hitRateLimit(env.DB, "1.2.3.4", rl, t + 60_000)).toBe(true);
  });

  it("IP をそのまま残さない", async () => {
    await hitRateLimit(env.DB, "9.9.9.9", rl, t);
    const rows = await env.DB.prepare("SELECT key_hash FROM rate_hits").all<{ key_hash: string }>();
    expect(rows.results.some((r) => r.key_hash.includes("9.9.9.9"))).toBe(false);
  });
});
