import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { appendAudit, currentChain, readChain, startNewChain, verifyTenant } from "./audit";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const base = "/api/t/practice/trials";

describe("「追記だけ」と「消す」の決まり（025b）", () => {
  it("参加者を指定すると答えの中身が消え、記録には「消した」の 1 行だけが足され、連鎖は保たれる", async () => {
    const t = (await (await call(base, json("POST", { participants: ["p1", "p2"] }))).json()) as { id: string };
    const r1 = (await (await call(`${base}/${t.id}/responses`, json("POST", { participant: "p1", item: "B", answer: "止めて知らせる" }))).json()) as { seq: number };
    await call(`${base}/${t.id}/responses`, json("POST", { participant: "p2", item: "B", answer: "上の人に聞く" }));
    await call(`${base}/${t.id}/grades`, json("POST", { response_seq: r1.seq, grader: "g1", verdict: "correct", answer_ja: "止めて知らせる" }));
    await appendAudit(env.DB, "practice", { card_id: null, kind: "status", actor: "x", payload: { before: true } });
    const before = (await readChain(env.DB, "practice", await currentChain(env.DB, "practice"))).length;

    const res = await call(`${base}/${t.id}/erase`, json("POST", { participant: "p1" }));
    expect(await res.json()).toEqual({ erased: { responses: 1, grades: 1 } });

    const rows = await env.DB.prepare("SELECT participant, answer, ms, erased FROM responses WHERE trial_id = ? ORDER BY seq").bind(t.id).all();
    expect(rows.results).toEqual([
      { participant: "p1", answer: null, ms: null, erased: 1 },
      { participant: "p2", answer: "上の人に聞く", ms: null, erased: 0 },
    ]);
    const g = await env.DB.prepare("SELECT answer_ja, erased FROM grades WHERE trial_id = ?").bind(t.id).first();
    expect(g).toEqual({ answer_ja: null, erased: 1 });

    const chain = await readChain(env.DB, "practice", await currentChain(env.DB, "practice"));
    expect(chain.length).toBe(before + 1);
    expect(chain.at(-1)).toMatchObject({ kind: "erase", payload: { participant: "p1", responses: 1, grades: 1 } });
    expect(JSON.stringify(chain)).not.toContain("止めて知らせる");
    expect((await verifyTenant(env.DB, "practice")).ok).toBe(true);

    // 書き出しに出ず、もう答えられない
    const csv = await (await call(`${base}/${t.id}/answers.csv`)).text();
    expect(csv).not.toContain("止めて知らせる");
    expect(csv).toContain("上の人に聞く");
    expect((await call(`${base}/${t.id}/responses`, json("POST", { participant: "p1", item: "A", ms: 10 }))).status).toBe(409);
    expect((await call(`${base}/${t.id}/erase`, json("POST", { participant: "zz" }))).status).toBe(400);
  });

  it("DB の守りは、中身を空にして印を付ける 1 通りだけを通す", async () => {
    const t = (await (await call(base, json("POST", { participants: ["p1"] }))).json()) as { id: string };
    await call(`${base}/${t.id}/responses`, json("POST", { participant: "p1", item: "B", answer: "a" }));
    await expect(env.DB.prepare("UPDATE responses SET answer = 'b' WHERE trial_id = ?").bind(t.id).run()).rejects.toThrow(/append only/);
    await expect(env.DB.prepare("UPDATE responses SET answer = NULL, ms = NULL, erased = 1, item = 'A' WHERE trial_id = ?").bind(t.id).run()).rejects.toThrow(/append only/);
    await env.DB.prepare("UPDATE responses SET answer = NULL, ms = NULL, erased = 1 WHERE trial_id = ?").bind(t.id).run();
    await expect(env.DB.prepare("UPDATE responses SET erased = 0 WHERE trial_id = ?").bind(t.id).run()).rejects.toThrow(/append only/);
    await expect(env.DB.prepare("DELETE FROM responses WHERE trial_id = ?").bind(t.id).run()).rejects.toThrow(/append only/);
  });

  it("リセットはテナントごとに連鎖を新しく始め、古い連鎖はとっておく", async () => {
    await appendAudit(env.DB, "demo", { card_id: null, kind: "status", actor: "x", payload: { n: 1 } });
    await appendAudit(env.DB, "demo", { card_id: null, kind: "status", actor: "x", payload: { n: 2 } });
    const old = await currentChain(env.DB, "demo");
    const next = await startNewChain(env.DB, "demo");
    expect(next).not.toBe(old);
    const e = await appendAudit(env.DB, "demo", { card_id: null, kind: "status", actor: "x", payload: { n: 3 } });
    expect(e).toMatchObject({ chain: next, n: 1 });
    expect((await readChain(env.DB, "demo", old)).length).toBe(2);
    const v = await verifyTenant(env.DB, "demo");
    expect(v.ok).toBe(true);
    expect(v.chains.map((c) => c.chain)).toEqual([old, next]);
    // ほかのテナントの連鎖は変わらない
    expect(await currentChain(env.DB, "practice")).toBe("c1");
  });
});
