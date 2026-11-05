import { describe, expect, it } from "vitest";
import { clockTimes, crossClockRows, FAKE_CLOCKS, median, noAnswers } from "../src/shared/clocks";

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

  it("交差の回の欄から、項目ごとにカードと文の組を作る。欄が無ければ 0 人・null", () => {
    const cells = [
      { item: "A" as const, shown: "card" as const, n: 4, median_ms: 2000 },
      { item: "A" as const, shown: "text" as const, n: 3, median_ms: 8000 },
      { item: "B" as const, shown: "card" as const, n: 0, median_ms: null },
    ];
    expect(crossClockRows(cells)).toEqual([
      { item: "A", card: { n: 4, median_ms: 2000 }, text: { n: 3, median_ms: 8000 } },
      { item: "B", card: { n: 0, median_ms: null }, text: { n: 0, median_ms: null } },
    ]);
  });

  it("全部の欄が 0 件のときだけ「答えが無い」（仮の数字を出す）", () => {
    expect(noAnswers([{ item: "A", shown: "card", n: 0, median_ms: null }])).toBe(true);
    expect(noAnswers([{ item: "A", shown: "card", n: 0, median_ms: null }, { item: "B", shown: "text", n: 1, median_ms: null }])).toBe(false);
  });

  it("仮の数字は仮の印を持つ（画面にそう出す）", () => {
    expect(FAKE_CLOCKS.fake).toBe(true);
  });
});
