import { describe, expect, it } from "vitest";
import { validateCard, wordsRubyErrors } from "../src/shared/card";
import { sampleCard } from "./fixtures/card";

describe("言葉の欄の形と、ふりがなの検査", () => {
  it("words は ja が要り、vi は無くてもよい（訳は出さない）", () => {
    expect(validateCard({ ...sampleCard(), words: { ja: "たしかめる" } })).toEqual([]);
    expect(validateCard({ ...sampleCard(), words: { ja: "たしかめる", vi: "kiểm tra" } })).toEqual([]);
    expect(validateCard({ ...sampleCard(), words: { ja: "", vi: "kiểm tra" } })).toContain("words は ja が要る");
    expect(validateCard({ ...sampleCard(), words: { ja: "たしかめる", vi: 1 as unknown as string } })).toContain("words.vi は 2000 字までの文");
  });

  it("人が直した words.ja も、ふりがなの無い漢字と崩れた書き方を断る", () => {
    expect(wordsRubyErrors({ ...sampleCard(), words: { ja: "検電器を　もつ" } })).toEqual([expect.stringContaining("検・電・器")]);
    expect(wordsRubyErrors({ ...sampleCard(), words: { ja: "｜けんでんきを　もつ" } })).toEqual([expect.stringContaining("崩れている")]);
    expect(wordsRubyErrors({ ...sampleCard(), words: { ja: "｜検電器《けんでんき》を　もつ" } })).toEqual([]);
    expect(wordsRubyErrors(sampleCard())).toEqual([]);
  });

  it("前の版を渡すと、words.ja が変わったときだけ見る（決まりより前のカードの、ほかの欄の直しは止めない）", () => {
    const old = { ...sampleCard(), words: { ja: "検電器を　もつ" } };
    expect(wordsRubyErrors({ ...old, rule: "盤に触る前に確かめる" }, old)).toEqual([]);
    expect(wordsRubyErrors({ ...old, words: { ja: "電気を　たしかめる" } }, old)).toHaveLength(1);
  });
});
