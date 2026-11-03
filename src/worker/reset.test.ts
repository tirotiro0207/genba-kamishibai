import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { currentChain, readChain, verifyTenant } from "./audit";
import { signRole } from "./people";
import { hashPin } from "./tenant";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
// 会社のテナントは PIN の入室に加えて役割のしるしが要る（052 の続き）
const roles = new Map<string, string>();
const json = (method: string, body?: unknown, token?: string): RequestInit => ({
  method,
  headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(token && roles.has(token) ? { "x-role": roles.get(token)! } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

async function fill(t: string, token?: string) {
  await call(`/api/t/${t}/cards`, json("POST", { card: sampleCard() }, token));
  const tr = (await (await call(`/api/t/${t}/trials`, json("POST", { participants: ["p1"] }, token))).json()) as { id: string };
  const r = (await (await call(`/api/t/${t}/trials/${tr.id}/responses`, json("POST", { participant: "p1", item: "B", answer: "a" }, token))).json()) as { seq: number };
  await call(`/api/t/${t}/trials/${tr.id}/grades`, json("POST", { response_seq: r.seq, grader: "g1", verdict: "correct" }, token));
}
const count = async (t: string) =>
  Object.fromEntries(await Promise.all(["cards", "trials", "responses", "grades"].map(async (x) => [x, (await env.DB.prepare(`SELECT count(*) AS n FROM ${x} WHERE tenant_id = ?`).bind(t).first<{ n: number }>())!.n])));

describe("データを最初の状態に戻す（030）", () => {
  let tok = "";
  beforeAll(async () => {
    await env.DB.prepare("INSERT INTO tenants (id, kind, name, pin_hash) VALUES ('co-r', 'company', '会社 R', ?)").bind(await hashPin("1234")).run();
    tok = ((await (await call("/api/t/co-r/session", json("POST", { pin: "1234" }))).json()) as { token: string }).token;
    roles.set(tok, await signRole("test-secret", "co-r", { role: "author", slot: 1 }));
  });

  it("練習用テナントは一度で戻り、ほかのテナントは残る", async () => {
    await fill("practice");
    await fill("demo");
    const oldChain = await currentChain(env.DB, "practice");
    const res = (await (await call("/api/t/practice/reset", json("POST"))).json()) as { removed: Record<string, number>; chain: string };
    expect(res.removed).toMatchObject({ grades: 1, responses: 1, trials: 1, cards: 1 });
    expect(await count("practice")).toEqual({ cards: 0, trials: 0, responses: 0, grades: 0 });
    expect(await count("demo")).toEqual({ cards: 1, trials: 1, responses: 1, grades: 1 });
    // 監査の記録は新しい連鎖になり、古い連鎖はとっておく
    expect(res.chain).not.toBe(oldChain);
    expect((await readChain(env.DB, "practice", oldChain)).length).toBeGreaterThan(0);
    expect((await verifyTenant(env.DB, "practice")).ok).toBe(true);
  });

  it("会社と架空の会社のテナントは、番号を打って確かめてから戻す", async () => {
    await fill("co-r", tok);
    expect((await call("/api/t/co-r/reset", json("POST", {}, tok))).status).toBe(428);
    expect((await call("/api/t/co-r/reset", json("POST", { confirm: "practice" }, tok))).status).toBe(428);
    expect((await call("/api/t/co-r/reset", json("POST", { confirm: "co-r" }))).status).toBe(401);
    expect((await count("co-r")).cards).toBe(1);
    expect((await call("/api/t/co-r/reset", json("POST", { confirm: "co-r" }, tok))).status).toBe(200);
    expect(await count("co-r")).toEqual({ cards: 0, trials: 0, responses: 0, grades: 0 });
    expect((await call("/api/t/demo/reset", json("POST"))).status).toBe(428);
  });

  it("リセットの外では、答えと採点は消せないまま", async () => {
    await fill("demo");
    await expect(env.DB.prepare("DELETE FROM responses WHERE tenant_id = 'demo'").run()).rejects.toThrow(/append only/);
    await expect(env.DB.prepare("DELETE FROM grades WHERE tenant_id = 'demo'").run()).rejects.toThrow(/append only/);
    await expect(env.DB.prepare("UPDATE resets SET open = 1").run()).rejects.toThrow(/append only/);
  });
});
