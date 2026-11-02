import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("骨組み（001）", () => {
  it("マイグレーションが流れ、テナントの表がある", async () => {
    const t = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tenants'").first();
    expect(t).not.toBeNull();
  });

  it("/api/health が DB を読んで答える", async () => {
    const res = await exports.default.fetch("http://local/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, tenants: 2 });
  });
});
