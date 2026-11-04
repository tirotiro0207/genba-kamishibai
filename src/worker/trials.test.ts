import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const base = "/api/t/practice/trials";

async function newTrial(seed?: string) {
  const res = await call(base, json("POST", { participants: ["p1", "p2", "p3", "p4"], seed }));
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; seed: string; assignments: { participant: string; A: string[]; B: string[] }[] };
}

describe("回答の記録 1: 保存と順番の乱数（011）", () => {
  it("種が残り、同じ種なら同じ割り当て", async () => {
    const t = await newTrial();
    expect(t.seed).toMatch(/^[0-9a-f]{16}$/);
    const again = (await (await call(`${base}/${t.id}`)).json()) as typeof t;
    expect(again.seed).toBe(t.seed);
    const same = await newTrial(t.seed);
    expect(same.assignments).toEqual(t.assignments);
  });

  it("見せたものは割り当てのとおりに記録され、追記だけ", async () => {
    const t = await newTrial("fixed");
    const p1 = t.assignments[0];
    const r1 = (await (await call(`${base}/${t.id}/responses`, json("POST", { participant: "p1", item: "A", ms: 4200 }))).json()) as { seq: number; shown: string };
    const r2 = (await (await call(`${base}/${t.id}/responses`, json("POST", { participant: "p1", item: "A", ms: 9100 }))).json()) as { seq: number; shown: string };
    expect([r1.shown, r2.shown]).toEqual(p1.A);
    expect((await call(`${base}/${t.id}/responses`, json("POST", { participant: "p1", item: "A", ms: 1 }))).status).toBe(409);
    const b1 = (await (await call(`${base}/${t.id}/responses`, json("POST", { participant: "p1", item: "B", answer: "止めて知らせる" }))).json()) as { shown: string };
    expect(b1.shown).toBe(p1.B[0]);
    expect(b1.shown).not.toBe(r1.shown);
  });

  it("交差の回（11/5）: 国籍つきで作り、1 人が項目ごとに 1 回だけ答える。カードと文を 1 つずつ", async () => {
    const people = [
      { id: "v1", group: "ベトナム" },
      { id: "v2", group: "ベトナム" },
      { id: "c1", group: "カンボジア" },
      { id: "c2", group: "カンボジア" },
    ];
    expect((await call(base, json("POST", { design: "cross", participants: [{ id: "x" }] }))).status).toBe(400);
    const t = (await (await call(base, json("POST", { design: "cross", participants: people, seed: "cross-1" }))).json()) as { id: string; design: string; participants: string[]; assignments: { participant: string; group: string; set: number; A: string[]; B: string[] }[] };
    expect(t.design).toBe("cross");
    expect(t.participants).toEqual(["v1", "v2", "c1", "c2"]);
    for (const g of ["ベトナム", "カンボジア"]) expect(t.assignments.filter((a) => a.group === g).map((a) => a.set).sort()).toEqual([1, 2]);
    const a = (await (await call(`${base}/${t.id}/responses`, json("POST", { participant: "v1", item: "A", ms: 5000, answer: "電気を確かめる" }))).json()) as { shown: string };
    expect((await call(`${base}/${t.id}/responses`, json("POST", { participant: "v1", item: "A", ms: 1 }))).status).toBe(409);
    const b = (await (await call(`${base}/${t.id}/responses`, json("POST", { participant: "v1", item: "B", ms: 7000, answer: "下に入らない" }))).json()) as { shown: string };
    expect([a.shown, b.shown].sort()).toEqual(["card", "text"]);
    // 結果は項目ごと・カードか文かごと。国籍ごとの数はまとめた数だけ
    const s = (await (await call(`${base}/${t.id}/summary`)).json()) as { all: { n: number }[]; groups: { group: string; people: number }[] };
    expect(s.all.reduce((x, c) => x + c.n, 0)).toBe(2);
    expect(s.groups.map((g) => [g.group, g.people])).toEqual([["カンボジア", 2], ["ベトナム", 2]].sort());
    expect((await call(`${base}/${(await newTrial()).id}/summary`)).status).toBe(400);
  });

  it("書き換えと消すことはサーバーが断り、DB でも断る", async () => {
    const t = await newTrial();
    await call(`${base}/${t.id}/responses`, json("POST", { participant: "p2", item: "A", ms: 3000 }));
    expect((await call(`${base}/${t.id}/responses`, json("PUT", { participant: "p2", item: "A", ms: 1 }))).status).toBe(405);
    expect((await call(`${base}/${t.id}/responses/1`, json("DELETE"))).status).toBe(405);
    expect((await call(`${base}/${t.id}`, json("DELETE"))).status).toBe(405);
    await expect(env.DB.prepare("UPDATE responses SET ms = 1 WHERE trial_id = ?").bind(t.id).run()).rejects.toThrow(/append only/);
    await expect(env.DB.prepare("DELETE FROM responses WHERE trial_id = ?").bind(t.id).run()).rejects.toThrow(/append only/);
    const list = (await (await call(`${base}/${t.id}/responses`)).json()) as { responses: { ms: number }[] };
    expect(list.responses.map((r) => r.ms)).toEqual([3000]);
  });

  it("参加者でない ID と別のテナントの回は断る", async () => {
    const t = await newTrial();
    expect((await call(`${base}/${t.id}/responses`, json("POST", { participant: "zz", item: "A" }))).status).toBe(400);
    expect((await call(`/api/t/demo/trials/${t.id}`)).status).toBe(404);
  });
});
