import { describe, expect, it } from "vitest";
import { clockTimes, FAKE_CLOCKS, median } from "../src/shared/clocks";

// 095: ① の結果を時計 2 つで並べる。カードと文の、分かるまでの時間の中央値
describe("時計 2 つ（095）", () => {
  it("中央値は真ん中の値（偶数なら真ん中 2 つの平均）。空なら null", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(3);
    expect(median([])).toBeNull();
  });

  it("① の答え（項目 A）だけを、カードと文に分けて数える。時間の無い答えと ② の答えは入れない", () => {
    const rows = [
      { item: "A", shown: "card" as const, ms: 3000 },
      { item: "A", shown: "card" as const, ms: 5000 },
      { item: "A", shown: "card" as const, ms: 4000 },
      { item: "A", shown: "text" as const, ms: 12000 },
      { item: "A", shown: "text" as const, ms: null },
      { item: "B", shown: "text" as const, ms: 1000 },
    ];
    expect(clockTimes(rows)).toEqual({ card: { n: 3, median_ms: 4000 }, text: { n: 1, median_ms: 12000 }, fake: false });
    expect(clockTimes([])).toEqual({ card: { n: 0, median_ms: null }, text: { n: 0, median_ms: null }, fake: false });
  });

  it("作りものの数は作りものの印を持つ（画面にそう出す）", () => {
    expect(FAKE_CLOCKS.fake).toBe(true);
  });
});
