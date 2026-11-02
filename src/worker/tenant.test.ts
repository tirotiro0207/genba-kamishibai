import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPin, signSession, verifyPin, verifySession } from "./tenant";

const PIN = "482916";
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const post = (path: string, body: unknown, token?: string) =>
  call(path, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

async function login(tenant: string, pin = PIN): Promise<string> {
  const res = await post(`/api/t/${tenant}/session`, { pin });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

describe("テナントの土台（009）", () => {
  beforeAll(async () => {
    const h = await hashPin(PIN);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenants (id, kind, name, pin_hash) VALUES ('co-a', 'company', '会社 A', ?)").bind(h),
      env.DB.prepare("INSERT INTO tenants (id, kind, name, pin_hash) VALUES ('co-b', 'company', '会社 B', ?)").bind(h),
    ]);
  });

  it("PIN は塩付きハッシュで、違う PIN は通らない", async () => {
    const h = await hashPin(PIN);
    expect(h).not.toContain(PIN);
    expect(await verifyPin(PIN, h)).toBe(true);
    expect(await verifyPin("000000", h)).toBe(false);
    expect(await hashPin(PIN)).not.toBe(h);
  });

  it("入ったしるしは、そのテナントで期限の中だけ通る", async () => {
    const tok = await signSession("s", "co-a", 1000);
    expect(await verifySession("s", tok, "co-a", 1001)).toBe(true);
    expect(await verifySession("s", tok, "co-b", 1001)).toBe(false);
    expect(await verifySession("other", tok, "co-a", 1001)).toBe(false);
    expect(await verifySession("s", tok, "co-a", 1000 + 13 * 3600)).toBe(false);
    expect(await verifySession("s", tok.replace("co-a", "co-b"), "co-b", 1001)).toBe(false);
  });

  it("会社のテナントは PIN が無いと入れない", async () => {
    expect((await call("/api/t/co-a/cards")).status).toBe(401);
    expect((await post("/api/t/co-a/session", { pin: "000000" })).status).toBe(401);
    const tok = await login("co-a");
    expect((await call("/api/t/co-a/cards", { headers: { authorization: `Bearer ${tok}` } })).status).toBe(200);
  });

  it("3 つのデータが分かれていて、テナントをまたいで読めない", async () => {
    const a = await login("co-a");
    const b = await login("co-b");
    expect((await post("/api/t/practice/cards", { body: "練習のカード" })).status).toBe(201);
    expect((await post("/api/t/demo/cards", { body: "架空の会社のカード" })).status).toBe(201);
    expect((await post("/api/t/co-a/cards", { body: "会社 A のカード" }, a)).status).toBe(201);

    const list = async (t: string, tok?: string) =>
      ((await (await call(`/api/t/${t}/cards`, { headers: tok ? { authorization: `Bearer ${tok}` } : {} })).json()) as { cards: { body: string }[] }).cards.map((c) => c.body);
    expect(await list("practice")).toEqual(["練習のカード"]);
    expect(await list("demo")).toEqual(["架空の会社のカード"]);
    expect(await list("co-a", a)).toEqual(["会社 A のカード"]);
    expect(await list("co-b", b)).toEqual([]);
    // A のしるしで B は読めない・書けない
    expect((await call("/api/t/co-b/cards", { headers: { authorization: `Bearer ${a}` } })).status).toBe(401);
    expect((await post("/api/t/co-b/cards", { body: "x" }, a)).status).toBe(401);
  });

  it("無いテナントは 404", async () => {
    expect((await call("/api/t/nope/cards")).status).toBe(404);
  });
});
