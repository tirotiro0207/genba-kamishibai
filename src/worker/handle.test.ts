import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

// 入口の画面（11/5）の「@ のあと」の名前からテナントを引く口
const get = (h: string) => exports.default.fetch(`http://local/api/handle/${encodeURIComponent(h)}`);

describe("入口の名前からテナントを引く", () => {
  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenants (id, kind, name, pin_hash, handle) VALUES ('h-co', 'company', '会社', 'x', 'acme-co')"),
      env.DB.prepare("UPDATE tenants SET handle = 'demo-co' WHERE id = 'demo'"),
    ]);
  });

  it("会社のテナントの名前なら ID を返す", async () => {
    const res = await get("acme-co");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tenant: "h-co" });
  });

  it("無い名前は 404", async () => {
    expect((await get("nope")).status).toBe(404);
  });

  it("会社でないテナント（架空の会社）は名前があっても返さない", async () => {
    expect((await get("demo-co")).status).toBe(404);
  });

  it("英小文字・数字・- 以外は 400", async () => {
    expect((await get("Acme")).status).toBe(400);
    expect((await get("a b")).status).toBe(400);
  });
});
