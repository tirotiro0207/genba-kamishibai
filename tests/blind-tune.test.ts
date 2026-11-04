import { describe, expect, it } from "vitest";
import { countJudged, leaks, points, toFields } from "../scripts/blind-tune";

// 目隠しの合わせ込みの数え方と、正解の語句の混入の検査
describe("目隠しの合わせ込み", () => {
  it("採点を数える。範囲の外・同じ答えの使い回し・付け忘れは足りないに倒し、組にならない答えは余計", () => {
    const c = countJudged(3, 3, {
      gold: [
        { i: 0, label: "合う", pred: 0 },
        { i: 1, label: "違う", pred: 0 },
        { i: 2, label: "合う", pred: 9 },
      ],
      extra: [],
      skip: [2],
    });
    expect(c).toEqual({ 合う: 1, 足りない: 2, 余計: 1, 違う: 0 });
    expect(points(c)).toBeCloseTo(1 / 4);
    expect(points({ 合う: 0, 足りない: 0, 余計: 0, 違う: 0 })).toBe(1);
  });

  it("取り出しの結果を欄に分け、同じ理由はまとめる", () => {
    const f = toFields({
      rules: [
        { kind: "do", text: "A する", reasons: [{ text: "体を守るため", stated: true }] },
        { kind: "dont", text: "B しない", reasons: [{ text: "体を守るため ", stated: false }] },
      ],
    });
    expect(f).toEqual({ do: ["A する"], dont: ["B しない"], why: ["体を守るため"] });
  });

  it("正解の文から 8 字続く語句がプロンプトにあれば見つける（記号と空白は見ない）", () => {
    const items = [{ no: 1, text: "", do: [{ text: "作りものの決まりの文、ここまで" }], dont: [], why: [] }];
    expect(leaks("例: 作りもの の決まりの文 を書く", items)).toContain("作りものの決まり");
    expect(leaks("関係の無い文", items)).toEqual([]);
  });
});
