import { describe, expect, it } from "vitest";
import { summarize } from "../src/shared/stats";

describe("いつも出しておく数字（048）", () => {
  it("危ない読み違いの枚数・1 枚の分の平均・伝わる率の平均", () => {
    const s = summarize(
      [
        { rate: 80, dangerous: false },
        { rate: 55, dangerous: true },
        { rate: 70, dangerous: false },
      ],
      [4, null, 7],
    );
    expect(s).toEqual({ dangerous: 1, minutes: 5.5, rate: 68.3, checked: 3, signed: 2 });
  });
  it("何も無ければ 0 枚と空欄", () => {
    expect(summarize([], [])).toEqual({ dangerous: 0, minutes: null, rate: null, checked: 0, signed: 0 });
  });
});
