import { describe, expect, it } from "vitest";
import { packAnswer, unpackAnswer } from "../src/shared/answer-fields";
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
    expect(g.get(1)).toEqual({ g1: "danger", g2: "wrong", answer_ja: "訳 2", f1: "ja", f2: "own" });
  });

  it("片方しか付けていないときは食い違いの欄を空にする", () => {
    const csv = toAnswersCsv("s", ["p"], [{ seq: 1, participant: "p", item: "B", shown: "card", ms: null, answer: "x" }], [{ seq: 1, response_seq: 1, grader: "g1", verdict: "correct", answer_ja: null }]);
    expect(csv.trim().split("\r\n")[1]).toBe("R01,B,card,,x,,,ja,,correct,,");
  });

  it("答えの欄 2 つ（11/5）は CSV で分かれて出る。前からの 1 つの文は日本語の欄に入る", () => {
    expect(unpackAnswer(packAnswer({ ja: " 止める ", own: "dừng lại" }))).toEqual({ ja: "止める", own: "dừng lại" });
    expect(unpackAnswer("{ふつうの文")).toEqual({ ja: "{ふつうの文", own: "" });
    const csv = toAnswersCsv(
      "s",
      ["p", "q"],
      [
        { seq: 1, participant: "p", item: "A", shown: "card", ms: 3000, answer: packAnswer({ ja: "", own: "ឈប់, រាយការណ៍" }) },
        { seq: 2, participant: "q", item: "A", shown: "text", ms: 5000, answer: packAnswer({ ja: "とめる", own: "" }) },
      ],
      [{ seq: 1, response_seq: 1, grader: "g1", verdict: "correct", answer_ja: "止めて知らせる" }],
    );
    const lines = csv.trim().split("\r\n");
    const anon = anonymize("s", ["p", "q"]);
    expect(lines[0]).toBe("respondent,item,shown,ms,answer,answer_own,answer_ja,field1,field2,grader1,grader2,disagree");
    expect(lines).toContain(`${anon.get("p")},A,card,3000,,"ឈប់, រាយការណ៍",止めて知らせる,own,,correct,,`);
    expect(lines).toContain(`${anon.get("q")},A,text,5000,とめる,,,,,,,`);
  });
});
