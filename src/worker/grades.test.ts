import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const base = "/api/t/practice/trials";

async function answered() {
  const t = (await (await call(base, json("POST", { participants: ["staff-alpha", "staff-beta"], seed: "grade" }))).json()) as { id: string };
  const post = (b: unknown) => call(`${base}/${t.id}/responses`, json("POST", b)).then((r) => r.json() as Promise<{ seq: number }>);
  await post({ participant: "staff-alpha", item: "A", ms: 4200 });
  const a1 = await post({ participant: "staff-alpha", item: "B", answer: "dừng lại và báo" });
  const b1 = await post({ participant: "staff-beta", item: "B", answer: "chạm vào, \"không sao\"" });
  return { id: t.id, a1: a1.seq, b1: b1.seq };
}
const grade = (id: string, b: unknown) => call(`${base}/${id}/grades`, json("POST", b));

describe("回答の記録 3: 採点と書き出し（025）", () => {
  it("採点 2 人が別々に付け、相手の判定は見えない", async () => {
    const t = await answered();
    expect((await grade(t.id, { response_seq: t.a1, grader: "g1", verdict: "correct", answer_ja: "止めて知らせる" })).status).toBe(201);
    expect((await grade(t.id, { response_seq: t.a1, grader: "g2", verdict: "wrong" })).status).toBe(201);
    const g1 = (await (await call(`${base}/${t.id}/grades?grader=g1`)).json()) as { grades: { grader: string; verdict: string }[] };
    expect(g1.grades.map((g) => [g.grader, g.verdict])).toEqual([["g1", "correct"]]);
    expect((await call(`${base}/${t.id}/grades`)).status).toBe(400);
  });

  it("判定は 3 つだけ。答えの無い行・別の回の行・知らない採点者は断る", async () => {
    const t = await answered();
    expect((await grade(t.id, { response_seq: t.a1, grader: "g1", verdict: "maybe" })).status).toBe(400);
    expect((await grade(t.id, { response_seq: t.a1, grader: "g3", verdict: "correct" })).status).toBe(400);
    const timeOnly = t.a1 - 1; // 項目 A の時間だけの行
    expect((await grade(t.id, { response_seq: timeOnly, grader: "g1", verdict: "correct" })).status).toBe(400);
    const other = await answered();
    expect((await grade(t.id, { response_seq: other.a1, grader: "g1", verdict: "correct" })).status).toBe(400);
  });

  it("付け直しは追記で、最後の判定を使う。書き換えと消すことは断る", async () => {
    const t = await answered();
    await grade(t.id, { response_seq: t.b1, grader: "g1", verdict: "correct" });
    await grade(t.id, { response_seq: t.b1, grader: "g1", verdict: "danger" });
    await grade(t.id, { response_seq: t.b1, grader: "g2", verdict: "danger" });
    expect((await call(`${base}/${t.id}/grades`, json("PUT", {}))).status).toBe(405);
    expect((await call(`${base}/${t.id}/grades/1`, json("DELETE"))).status).toBe(405);
    await expect(env.DB.prepare("UPDATE grades SET verdict = 'correct' WHERE trial_id = ?").bind(t.id).run()).rejects.toThrow(/append only/);
    await expect(env.DB.prepare("DELETE FROM grades WHERE trial_id = ?").bind(t.id).run()).rejects.toThrow(/append only/);
    const csv = await (await call(`${base}/${t.id}/answers.csv`)).text();
    expect(csv).toContain("danger,danger,no");
  });

  it("書き出しは匿名の CSV で、名前も日時も入らず、食い違いの欄がある", async () => {
    const t = await answered();
    await grade(t.id, { response_seq: t.a1, grader: "g1", verdict: "correct", answer_ja: "止めて知らせる" });
    await grade(t.id, { response_seq: t.a1, grader: "g2", verdict: "wrong" });
    const res = await call(`${base}/${t.id}/answers.csv`);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    const csv = (await res.text()).replace(/^﻿/, "");
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("respondent,item,shown,ms,answer,answer_ja,grader1,grader2,disagree");
    expect(csv).not.toMatch(/staff|\d{4}-\d{2}-\d{2}/);
    expect(lines.find((l) => l.includes("dừng lại"))).toMatch(/^R0[12],B,(card|text),,dừng lại và báo,止めて知らせる,correct,wrong,yes$/);
    expect(csv).toContain('"chạm vào, ""không sao"""');
    expect(lines).toHaveLength(4);
  });

  it("別のテナントからは採点も書き出しもできない", async () => {
    const t = await answered();
    expect((await call(`/api/t/demo/trials/${t.id}/answers.csv`)).status).toBe(404);
    expect((await call(`/api/t/demo/trials/${t.id}/grades`, json("POST", { response_seq: t.a1, grader: "g1", verdict: "correct" }))).status).toBe(404);
  });
});
