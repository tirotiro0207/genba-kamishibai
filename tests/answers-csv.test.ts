import { describe, expect, it } from "vitest";
import { anonymize, latestGrades, toAnswersCsv } from "../src/shared/answers-csv";

describe("回答の書き出し（025）", () => {
  it("匿名の番号は種で決まり、全員に重ならずに付く", () => {
    const ps = ["a", "b", "c", "d", "e"];
    const m = anonymize("s1", ps);
    expect(anonymize("s1", ps)).toEqual(m);
    expect(new Set(m.values()).size).toBe(5);
    expect([...m.values()].sort()).toEqual(["R01", "R02", "R03", "R04", "R05"]);
  });

  it("採点者ごとに最後の判定、訳は最後に書かれたもの", () => {
    const g = latestGrades([
      { seq: 3, response_seq: 1, grader: "g1", verdict: "danger", answer_ja: null },
      { seq: 1, response_seq: 1, grader: "g1", verdict: "correct", answer_ja: "訳 1" },
      { seq: 2, response_seq: 1, grader: "g2", verdict: "wrong", answer_ja: "訳 2" },
    ]);
    expect(g.get(1)).toEqual({ g1: "danger", g2: "wrong", answer_ja: "訳 2" });
  });

  it("片方しか付けていないときは食い違いの欄を空にする", () => {
    const csv = toAnswersCsv("s", ["p"], [{ seq: 1, participant: "p", item: "B", shown: "card", ms: null, answer: "x" }], [{ seq: 1, response_seq: 1, grader: "g1", verdict: "correct", answer_ja: null }]);
    expect(csv.trim().split("\r\n")[1]).toBe("R01,B,card,,x,,correct,,");
  });
});
