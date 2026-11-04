import { describe, expect, it } from "vitest";
import { crossSummary, OTHER } from "../src/shared/summary";

// 交差の回の結果（11/5 作者）: 判定は全員で 1 つの数。国籍ごとの数はまとめた数だけで、1 人の国籍は「その他」
describe("交差の回の結果", () => {
  const people = [
    { id: "v1", group: "ベトナム" },
    { id: "v2", group: "ベトナム" },
    { id: "m1", group: "ミャンマー" },
    { id: "n1", group: "ネパール" },
    { id: "x1", group: "モンゴル" },
  ];
  const r = (seq: number, participant: string, item: "A" | "B", shown: "card" | "text", ms: number) => ({ seq, participant, item, shown, ms, answer: "x" });
  const responses = [r(1, "v1", "A", "card", 3000), r(2, "v2", "A", "text", 9000), r(3, "m1", "A", "card", 5000), r(4, "n1", "A", "text", 7000), r(5, "x1", "A", "card", 4000)];
  const grades = [
    { seq: 1, response_seq: 1, grader: "g1" as const, verdict: "correct" as const, answer_ja: null },
    { seq: 2, response_seq: 1, grader: "g2" as const, verdict: "correct" as const, answer_ja: null },
    { seq: 3, response_seq: 3, grader: "g1" as const, verdict: "correct" as const, answer_ja: "訳" },
    { seq: 4, response_seq: 3, grader: "g2" as const, verdict: "wrong" as const, answer_ja: null },
  ];

  it("全員の数は 1 つ。中央値・2 人とも付けた数・2 人とも正しい数・食い違い", () => {
    const s = crossSummary(people, responses, grades);
    expect(s.all.find((c) => c.item === "A" && c.shown === "card")).toEqual({ item: "A", shown: "card", n: 3, median_ms: 4000, graded: 2, correct: 1, disagree: 1 });
    expect(s.all.find((c) => c.item === "A" && c.shown === "text")).toMatchObject({ n: 2, median_ms: 8000 });
  });

  it("1 人しかいない国籍は「その他」にまとめ、国籍の名前を出さない", () => {
    const s = crossSummary(people, responses, grades);
    expect(s.groups.map((g) => [g.group, g.people])).toEqual([
      ["ベトナム", 2],
      [OTHER, 3],
    ]);
    expect(JSON.stringify(s)).not.toMatch(/ミャンマー|ネパール|モンゴル/);
    expect(s.hidden).toBe(0);
  });

  it("まとめても 2 人に満たないまとまりは出さない", () => {
    const s = crossSummary(people.slice(0, 3), responses.slice(0, 3), grades);
    expect(s.groups.map((g) => g.group)).toEqual(["ベトナム"]);
    expect(s.hidden).toBe(1);
  });
});
