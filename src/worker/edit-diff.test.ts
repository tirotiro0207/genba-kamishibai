import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { signRole } from "./people";

// 修正の差分の保存（050）: 直した欄・前・後・直した人・日時・理由が ④ に残り、1 回直すと 1 件増える
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const base = "/api/t/practice/cards";
const send = (method: string, path: string, body: unknown, headers: Record<string, string> = {}) => call(path, { method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const edits = async (id: string) =>
  (await env.DB.prepare("SELECT actor, payload, created_at FROM audit_log WHERE card_id = ? AND kind = 'edit' ORDER BY n").bind(id).all<{ actor: string; payload: string; created_at: string }>()).results.map((r) => ({ ...r, payload: JSON.parse(r.payload) as Record<string, unknown> }));

describe("修正の差分の保存（050）", () => {
  it("直すたびに 1 件ずつ増え、欄・前・後・直した人・日時・理由が残る", async () => {
    const { id } = (await (await send("POST", base, { card: sampleCard() })).json()) as { id: string };
    const sup = { "x-role": await signRole("test-secret", "practice", { role: "supervisor", slot: 2 }) };
    const c1 = { ...sampleCard(), why: "電気が来ていると感電して大けがをするから" };
    const r1 = await send("PUT", `${base}/${id}`, { card: c1, reason: "けがの重さを足す", actor: "なりすまし" }, sup);
    expect(r1.status).toBe(200);
    expect(await edits(id)).toHaveLength(1);
    const c2 = { ...c1, rule: "盤に触る前に、検電器を当てて電気が来ていないか確かめる" };
    expect((await send("PUT", `${base}/${id}`, { card: c2, reason: "当てることをはっきり" }, sup)).status).toBe(200);
    const list = await edits(id);
    expect(list).toHaveLength(2);
    const [a, b] = list;
    // 直した人は役割のしるしから（送られた名前は使わない）
    expect(a.actor).toBe("supervisor.2");
    expect(a.payload).toMatchObject({ fields: ["why"], before: { why: "電気が来ていると感電するから" }, after: { why: c1.why }, by: "supervisor.2", reason: "けがの重さを足す", from_version: 1, to_version: 2 });
    expect(b.payload).toMatchObject({ fields: ["rule"], before: { rule: sampleCard().rule }, after: { rule: c2.rule }, reason: "当てることをはっきり", from_version: 2, to_version: 3 });
    for (const e of list) expect(Math.abs(Date.parse(e.payload.edited_at as string) - Date.now())).toBeLessThan(60000);
  });

  it("何も変えない直しは増えず、理由の無い直しは断る", async () => {
    const { id } = (await (await send("POST", base, { card: sampleCard() })).json()) as { id: string };
    const same = await send("PUT", `${base}/${id}`, { card: sampleCard(), reason: "そのまま" });
    expect(same.status).toBe(200);
    expect(((await same.json()) as { version: number }).version).toBe(1);
    const none = await send("PUT", `${base}/${id}`, { card: { ...sampleCard(), why: "感電するから" }, reason: "  " });
    expect(none.status).toBe(400);
    expect(await edits(id)).toHaveLength(0);
  });
});
