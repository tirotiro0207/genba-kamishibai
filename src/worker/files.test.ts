import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { fileKey } from "./files";
import { signRole } from "./people";
import { hashPin } from "./tenant";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const put = (path: string, body: string, headers: Record<string, string> = {}) => call(path, { method: "PUT", headers: { "content-type": "text/plain", ...headers }, body });
// 会社のテナントは PIN の入室に加えて役割のしるしが要る（052 の続き）。しるしごとに、そのテナントの作者の役割を添える
const roles = new Map<string, string>();
const auth = (t: string) => ({ authorization: `Bearer ${t}`, ...(roles.has(t) ? { "x-role": roles.get(t)! } : {}) });

describe("会社のテナントの非公開の置き場（031a）", () => {
  let a = "";
  let b = "";
  beforeAll(async () => {
    const h = await hashPin("1111");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenants (id, kind, name, pin_hash) VALUES ('co-fa', 'company', 'A', ?)").bind(h),
      env.DB.prepare("INSERT INTO tenants (id, kind, name, pin_hash) VALUES ('co-fb', 'company', 'B', ?)").bind(h),
    ]);
    const login = async (t: string) => ((await (await call(`/api/t/${t}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: "1111" }) })).json()) as { token: string }).token;
    [a, b] = [await login("co-fa"), await login("co-fb")];
    roles.set(a, await signRole("test-secret", "co-fa", { role: "author", slot: 1 }));
    roles.set(b, await signRole("test-secret", "co-fb", { role: "author", slot: 1 }));
  });

  it("鍵はテナントの頭の中だけで、外へ出る名前は作れない", () => {
    expect(fileKey("co-fa", "docs/manual.pdf")).toBe("t/co-fa/docs/manual.pdf");
    for (const bad of ["../co-fb/x", "docs/../../x", "/abs", "a//b", "", ".hidden", "a/b c", "a:b", "a?b"]) expect(fileKey("co-fa", bad)).toBeNull();
  });

  it("置いたテナントだけが読め、ほかのテナントと公開デモからは読めない", async () => {
    expect((await put("/api/t/co-fa/files/docs/a.txt", "会社 A の資料", auth(a))).status).toBe(201);
    const got = await call("/api/t/co-fa/files/docs/a.txt", { headers: auth(a) });
    expect(await got.text()).toBe("会社 A の資料");
    expect(got.headers.get("cache-control")).toContain("no-store");
    // PIN 無し・別の会社のしるし・別の会社の置き場・公開デモ
    expect((await call("/api/t/co-fa/files/docs/a.txt")).status).toBe(401);
    expect((await call("/api/t/co-fa/files/docs/a.txt", { headers: auth(b) })).status).toBe(401);
    expect((await call("/api/t/co-fb/files/docs/a.txt", { headers: auth(b) })).status).toBe(404);
    expect((await call("/api/t/demo/files/docs/a.txt")).status).toBe(404);
    expect((await call("/api/t/demo/files/..%2Fco-fa%2Fdocs%2Fa.txt")).status).toBeGreaterThanOrEqual(400);
    const list = (await (await call("/api/t/demo/files")).json()) as { files: unknown[] };
    expect(list.files).toEqual([]);
    const mine = (await (await call("/api/t/co-fa/files", { headers: auth(a) })).json()) as { files: { path: string }[] };
    expect(mine.files.map((f) => f.path)).toEqual(["docs/a.txt"]);
  });

  it("新入社員の役割では読めない", async () => {
    const nh = await signRole("test-secret", "co-fa", { role: "newhire", slot: 1 });
    expect((await call("/api/t/co-fa/files/docs/a.txt", { headers: { ...auth(a), "x-role": nh } })).status).toBe(403);
  });
});
