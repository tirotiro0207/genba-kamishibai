import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { hashPin, signSession } from "./tenant";
import { app } from "./index";
import { NO_SECRET, personName, signRole, verifyRole } from "./people";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const req = (method: string, body?: unknown, headers: Record<string, string> = {}): RequestInit => ({ method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

async function login(tenant: string, role: string, slot = 1, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const res = await call(`/api/t/${tenant}/login`, req("POST", { role, slot, ...extra }, headers));
  return { status: res.status, body: (await res.json()) as { token?: string; name?: string } };
}

/** 練習用のテナントに、署名の手前（ok）まで進めたカードを作る */
async function okCard(headers: Record<string, string> = {}) {
  const made = (await (await call("/api/t/practice/cards", req("POST", { card: sampleCard() }, headers))).json()) as { id: string };
  const r = await call(`/api/t/practice/cards/${made.id}/status`, req("POST", { to: "pending" }, headers));
  expect(r.status, "→ pending").toBeLessThan(300);
  // OK には確かめる AI の証拠が要る（047）。ここは役割を確かめるので、手元の D1 で OK にする
  await env.DB.prepare("UPDATE cards SET status = 'ok' WHERE id = ?").bind(made.id).run();
  return made.id;
}

describe("利用者と役割（030b）", () => {
  it("しるしは役割と番号を持ち、別のテナント・書き換え・期限切れは通らない", async () => {
    const t = await signRole("k", "practice", { role: "supervisor", slot: 2 });
    expect(await verifyRole("k", t, "practice")).toEqual({ role: "supervisor", slot: 2 });
    expect(await verifyRole("k", t, "demo")).toBeNull();
    expect(await verifyRole("k", t.replace("supervisor.2", "supervisor.1"), "practice")).toBeNull();
    expect(await verifyRole("k", t.replace(".supervisor.", ".author."), "practice")).toBeNull();
    expect(await verifyRole("k", await signRole("k", "practice", { role: "trainer", slot: 1 }, 0), "practice")).toBeNull();
  });

  it("名前は環境変数から読み、無ければ空欄。監修者 2 名を見分けられる", async () => {
    expect(personName({ ...env, SUPERVISOR_1_NAME: " 甲 ", SUPERVISOR_2_NAME: "乙" } as never, { role: "supervisor", slot: 1 })).toBe("甲");
    expect(personName({ ...env, SUPERVISOR_2_NAME: "乙" } as never, { role: "supervisor", slot: 2 })).toBe("乙");
    expect(personName(env, { role: "trainer", slot: 1 })).toBe("");
    const list = (await (await call("/api/t/practice/people")).json()) as { people: { role: string; slot: number; name: string }[] };
    expect(list.people.filter((p) => p.role === "supervisor").map((p) => p.slot)).toEqual([1, 2]);
    expect(list.people.every((p) => p.name === "")).toBe(true);
    const s2 = await login("practice", "supervisor", 2);
    const me = (await (await call("/api/t/practice/me", req("GET", undefined, { "x-role": s2.body.token! }))).json()) as { role: string; slot: number };
    expect(me).toEqual({ role: "supervisor", slot: 2, name: "" });
  });

  it("署名と停止は監修者だけが通せる", async () => {
    const id = await okCard();
    const as = async (role: string) => ({ "x-role": (await login("practice", role)).body.token! });
    for (const role of ["author", "trainer"]) expect((await call(`/api/t/practice/cards/${id}/status`, req("POST", { to: "signed" }, await as(role)))).status, role).toBe(403);
    expect((await call(`/api/t/practice/cards/${id}/status`, req("POST", { to: "signed" }))).status).toBe(403);
    // 署名そのものは署名の記録（051a）からだけ。ここでは署名済みにしてから、停止を確かめる
    await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(id).run();
    const sup = await as("supervisor");
    for (const role of ["author", "trainer"]) expect((await call(`/api/t/practice/cards/${id}/status`, req("POST", { to: "stopped" }, await as(role)))).status, role).toBe(403);
    expect((await call(`/api/t/practice/cards/${id}/status`, req("POST", { to: "stopped" }))).status).toBe(403);
    expect((await call(`/api/t/practice/cards/${id}/status`, req("POST", { to: "stopped", reason: "テストで止める" }, sup))).status).toBeLessThan(300);
  });

  it("署名済み・止めたカードを直せるのは監修者だけ。下書き・確認待ち・OK は今までどおり（11/7）", async () => {
    const as = async (role: string) => ({ "x-role": (await login("practice", role)).body.token! });
    const id = await okCard();
    const fixed = { ...sampleCard(), why: "感電して大けがをするから" };
    const paths: [string, string, unknown][] = [
      ["PUT", `/api/t/practice/cards/${id}`, { card: fixed, reason: "直す" }],
      ["POST", `/api/t/practice/cards/${id}/undo`, {}],
      ["POST", `/api/t/practice/cards/${id}/redo`, { n: 1 }],
      ["POST", `/api/t/practice/cards/${id}/rework`, { text: "直して" }],
      ["POST", `/api/t/practice/cards/${id}/fix`, {}],
      ["POST", `/api/t/practice/cards/${id}/accident`, {}],
    ];
    // OK のカードは誰でも直せる（関所で止まらない）
    expect((await call(paths[0][1], req("PUT", paths[0][2], await as("trainer")))).status).toBe(200);
    for (const st of ["signed", "stopped"]) {
      await env.DB.prepare("UPDATE cards SET status = ? WHERE id = ?").bind(st, id).run();
      for (const role of ["author", "trainer"]) for (const [m, path, body] of paths) expect((await call(path, req(m, body, await as(role)))).status, `${st} ${role} ${m} ${path}`).toBe(403);
      for (const [m, path, body] of paths) expect((await call(path, req(m, body))).status, `${st} 役割なし ${m} ${path}`).toBe(403);
    }
    // 監修者は関所を通る（直せる）
    await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(id).run();
    const r = await call(paths[0][1], req("PUT", { card: { ...fixed, why: "感電して大けがを負うから" }, reason: "直す" }, await as("supervisor")));
    expect(r.status).toBe(200);
  });

  it("新入社員はカードの API に入れない", async () => {
    const nh = { "x-role": (await login("practice", "newhire")).body.token! };
    expect((await call("/api/t/practice/cards", req("GET", undefined, nh))).status).toBe(403);
    expect((await call("/api/t/practice/cards", req("POST", { card: sampleCard() }, nh))).status).toBe(403);
  });

  it("会社のテナントは役割の PIN が要り、間違ったしるしは断る", async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO tenants (id, kind, name, pin_hash) VALUES ('co-people', 'company', '会社', ?)").bind(await hashPin("1111")).run();
    await env.DB.prepare("INSERT INTO people (tenant_id, role, slot, pin_hash) VALUES ('co-people', 'supervisor', 1, ?)").bind(await hashPin("2468")).run();
    const auth = { authorization: `Bearer ${await signSession("test-secret", "co-people")}` };
    expect((await login("co-people", "supervisor", 1, { pin: "0000" }, auth)).status).toBe(401);
    expect((await login("co-people", "trainer", 1, { pin: "2468" }, auth)).status).toBe(401);
    expect((await login("co-people", "supervisor", 1, { pin: "2468" }, auth)).status).toBe(200);
    expect((await login("co-people", "supervisor", 1, { pin: "2468" })).status).toBe(401);
    expect((await call("/api/t/practice/me", req("GET", undefined, { "x-role": "practice.supervisor.1.9999999999.00" }))).status).toBe(401);
    expect((await login("practice", "trainer", 2)).status).toBe(400);
  });
});

describe("監査の記録の関所（041）", () => {
  it("監修者と教育担当は読めて、新入社員は読めない", async () => {
    const made = (await (await call("/api/t/practice/cards", req("POST", { card: sampleCard() }))).json()) as { id: string };
    for (const role of ["supervisor", "trainer"]) {
      const h = { "x-role": (await login("practice", role)).body.token! };
      expect((await call(`/api/t/practice/audit/cards/${made.id}`, req("GET", undefined, h))).status, role).toBe(200);
    }
    const nh = { "x-role": (await login("practice", "newhire")).body.token! };
    expect((await call(`/api/t/practice/audit/cards/${made.id}`, req("GET", undefined, nh))).status).toBe(403);
  });

  it("入ったしるしの鍵が無いと、役割でも PIN でも 500 ではなく 503 で、何が足りないかを言う", async () => {
    const bare = { ...env, SESSION_SECRET: "" };
    const r = await app.request("/api/t/practice/login", req("POST", { role: "author" }), bare);
    expect(r.status).toBe(503);
    expect(((await r.json()) as { error: string }).error).toBe(NO_SECRET);
    await env.DB.prepare("INSERT OR IGNORE INTO tenants (id, kind, name, pin_hash) VALUES ('co-nosecret', 'company', '会社', ?)").bind(await hashPin("1357")).run();
    const s = await app.request("/api/t/co-nosecret/session", req("POST", { pin: "1357" }), bare);
    expect(s.status).toBe(503);
    expect(NO_SECRET).toMatch(/SESSION_SECRET/);
  });
});
