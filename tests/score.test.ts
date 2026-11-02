import { describe, expect, it } from "vitest";
import { judgeParams } from "../src/shared/eval/judge";
import { type Claim, type Judgement, score, sumScores } from "../src/shared/eval/score";

// 手で作った 3 組。評価データの答えは使わず、架空の決まりで作った
const cases: Array<{ name: string; gold: Claim[]; pred: Claim[]; j: Judgement; want: Record<string, number> }> = [
  {
    name: "全部合う（1 つは言い方の違い）",
    gold: [
      { kind: "do", text: "脚立は開き止めを掛けてから使う" },
      { kind: "why", text: "脚立が開いて倒れないようにするため" },
    ],
    pred: [
      { kind: "do", text: "脚立の開き止めを必ず掛ける" },
      { kind: "why", text: "倒れないように" },
    ],
    j: { pairs: [{ gold: 0, pred: 0, verdict: "same" }, { gold: 1, pred: 1, verdict: "wording" }], dangerousExtras: [] },
    want: { gold: 2, pred: 2, matched: 2, same: 1, wording: 1, missed: 0, extra: 0, dangerous: 0 },
  },
  {
    name: "漏れと取り出しすぎ",
    gold: [
      { kind: "do", text: "工具は腰袋に入れて運ぶ" },
      { kind: "dont", text: "工具を上から投げ渡さない" },
    ],
    pred: [
      { kind: "do", text: "工具は腰袋で運ぶ" },
      { kind: "do", text: "作業の前に体操をする" },
      { kind: "do", text: "手袋をする" },
    ],
    j: { pairs: [{ gold: 0, pred: 0, verdict: "same" }], dangerousExtras: [] },
    want: { gold: 2, pred: 3, matched: 1, same: 1, wording: 0, missed: 1, extra: 2, dangerous: 0 },
  },
  {
    name: "危ない読み違い（組の中の取り違えと、危ない取り出しすぎ）",
    gold: [{ kind: "dont", text: "通電中の盤の扉を開けない" }],
    pred: [
      { kind: "do", text: "通電中の盤の扉を開けて確かめる" },
      { kind: "do", text: "急ぐときは検電を省いてよい" },
    ],
    j: { pairs: [{ gold: 0, pred: 0, verdict: "dangerous" }], dangerousExtras: [1] },
    want: { gold: 1, pred: 2, matched: 1, same: 0, wording: 0, missed: 0, extra: 1, dangerous: 2 },
  },
];

describe("取り出しの採点（003a）", () => {
  it.each(cases)("$name", ({ gold, pred, j, want }) => {
    expect(score(gold, pred, j)).toEqual(want);
  });

  it("3 組の合計", () => {
    const s = sumScores(cases.map((c) => score(c.gold, c.pred, c.j)));
    expect(s).toEqual({ gold: 5, pred: 7, matched: 4, same: 2, wording: 1, missed: 1, extra: 3, dangerous: 2 });
  });

  it("同じものを 2 回組にした判定と、範囲の外の番号は断る", () => {
    const g = cases[1].gold;
    const p = cases[1].pred;
    expect(() => score(g, p, { pairs: [{ gold: 0, pred: 0, verdict: "same" }, { gold: 1, pred: 0, verdict: "same" }], dangerousExtras: [] })).toThrow();
    expect(() => score(g, p, { pairs: [{ gold: 5, pred: 0, verdict: "same" }], dangerousExtras: [] })).toThrow();
    expect(() => score(g, p, { pairs: [{ gold: 0, pred: 0, verdict: "same" }], dangerousExtras: [0] })).toThrow();
  });

  it("判定の依頼に、正解と答えが番号付きで入る", () => {
    const params = judgeParams(cases[0].gold, cases[0].pred);
    const text = JSON.stringify(params.messages);
    expect(text).toContain("0. [do] 脚立は開き止めを掛けてから使う");
    expect(text).toContain("1. [why] 倒れないように");
  });
});
