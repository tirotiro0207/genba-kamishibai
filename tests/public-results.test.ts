import { describe, expect, it } from "vitest";
import { FAKE_PUBLIC, guardGroups, OTHER } from "../src/shared/public-results";

// 094: 公開デモに出す匿名のまとめの守り
describe("公開デモの匿名の結果（094）", () => {
  it("1 人の国籍は「その他」にまとめ、まとめて 2 人以上なら出す", () => {
    const r = guardGroups([
      { group: "A", correct: 3, n: 4 },
      { group: "B", correct: 1, n: 1 },
      { group: "C", correct: 0, n: 1 },
    ]);
    expect(r.groups).toEqual([
      { group: "A", correct: 3, n: 4 },
      { group: OTHER, correct: 1, n: 2 },
    ]);
    expect(r.hidden).toBe(0);
  });

  it("まとめても 1 人なら出さず、人数だけ hidden に数える", () => {
    const r = guardGroups([
      { group: "A", correct: 2, n: 2 },
      { group: "B", correct: 1, n: 1 },
    ]);
    expect(r.groups.map((g) => g.group)).toEqual(["A"]);
    expect(r.hidden).toBe(1);
  });

  it("出す国籍は全部 2 人以上（作りものの数も同じ）。人を区別する欄は無い", () => {
    for (const g of FAKE_PUBLIC.groups) {
      expect(g.n).toBeGreaterThanOrEqual(2);
      expect(Object.keys(g).sort()).toEqual(["correct", "group", "n"]);
    }
    expect(FAKE_PUBLIC.fake).toBe(true);
    expect(FAKE_PUBLIC.groups.reduce((s, g) => s + g.n, 0)).toBe(FAKE_PUBLIC.picture.n);
    expect(FAKE_PUBLIC.groups.reduce((s, g) => s + g.correct, 0)).toBe(FAKE_PUBLIC.picture.correct);
  });
});
