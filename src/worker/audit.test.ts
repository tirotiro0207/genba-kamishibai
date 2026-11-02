import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { appendAudit, verifyTenant } from "./audit";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("監査の記録（020）", () => {
  it("1 枚のカードの ①〜⑤ を 1 本の記録で順に追える", async () => {
    const c = (await (await call("/api/t/practice/cards", json("POST", { card: sampleCard() }))).json()) as { id: string };
    await call(`/api/t/practice/cards/${c.id}/status`, json("POST", { to: "pending" }));
    // ③ と ⑤ は確かめる AI（047）と署名（051a）が書く。ここでは仕組みの中から足す
    await appendAudit(env.DB, "practice", { card_id: c.id, kind: "verify", actor: "verifier", payload: { score: 82, frames: [0, 1, 2], why: "検電器を当てている" } });
    await call(`/api/t/practice/cards/${c.id}`, json("PUT", { card: { ...sampleCard(), why: "電気が来ていると感電して大けがをするから" }, actor: "安全の監修者", reason: "けがの重さを足す" }));
    await appendAudit(env.DB, "practice", { card_id: c.id, kind: "sign", actor: "安全の監修者", payload: { version: 2 } });

    const r = (await (await call(`/api/t/practice/audit/cards/${c.id}`)).json()) as { chain_ok: boolean; entries: { kind: string; step: number | null; actor: string; payload: Record<string, unknown> }[] };
    expect(r.chain_ok).toBe(true);
    expect(r.entries.map((e) => e.kind)).toEqual(["source", "make", "status", "verify", "edit", "sign"]);
    expect(r.entries.filter((e) => e.step).map((e) => e.step)).toEqual([1, 2, 3, 4, 5]);
    expect(r.entries[0].payload).toMatchObject({ statements: [{ id: "s1", sources: [{ page: 3, line: 12 }] }, { id: "s2" }] });
    expect(r.entries[4].payload).toMatchObject({ fields: ["why"], reason: "けがの重さを足す", from_version: 1, to_version: 2 });
    expect(r.entries[4].actor).toBe("安全の監修者");
  });

  it("書き換えと消すことは DB と API が断る", async () => {
    await appendAudit(env.DB, "demo", { card_id: null, kind: "status", actor: "x", payload: {} });
    await expect(env.DB.prepare("UPDATE audit_log SET actor = 'y' WHERE tenant_id = 'demo'").run()).rejects.toThrow(/append only/);
    await expect(env.DB.prepare("DELETE FROM audit_log WHERE tenant_id = 'demo'").run()).rejects.toThrow(/append only/);
    expect((await call("/api/t/demo/audit/verify", json("DELETE"))).status).toBe(405);
    expect((await call("/api/t/demo/audit/cards/x", json("POST", {}))).status).toBe(405);
  });

  it("DB の守りを外して途中を書き換えるか消すと、検証が落ちる", async () => {
    for (let i = 0; i < 4; i++) await appendAudit(env.DB, "demo", { card_id: "k", kind: "edit", actor: "x", payload: { i } });
    expect((await verifyTenant(env.DB, "demo")).ok).toBe(true);
    await env.DB.exec("DROP TRIGGER audit_no_update");
    await env.DB.prepare("UPDATE audit_log SET payload = '{\"i\":9}' WHERE tenant_id = 'demo' AND n = 3").run();
    expect(await verifyTenant(env.DB, "demo")).toMatchObject({ ok: false, chains: [{ ok: false, at: 3 }] });
    await env.DB.exec("DROP TRIGGER audit_no_delete");
    await env.DB.prepare("DELETE FROM audit_log WHERE tenant_id = 'demo' AND n = 3").run();
    expect(await verifyTenant(env.DB, "demo")).toMatchObject({ ok: false, chains: [{ ok: false, at: 3, reason: "行が抜けている" }] });
  });

  it("テナントごとに別の連鎖で、別のテナントのカードの記録は読めない", async () => {
    const c = (await (await call("/api/t/practice/cards", json("POST", { card: sampleCard() }))).json()) as { id: string };
    const r = (await (await call(`/api/t/demo/audit/cards/${c.id}`)).json()) as { entries: unknown[] };
    expect(r.entries).toEqual([]);
  });
});
