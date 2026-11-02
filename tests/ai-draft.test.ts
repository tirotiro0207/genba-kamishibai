import { describe, expect, it } from "vitest";
import { aiDraftReasons } from "../src/shared/make/ai-draft";
import { sampleCard } from "./fixtures/card";

describe("AI 下書きの判定（035）", () => {
  it("元の文に無い理由（ai の印）があれば理由を返す", () => {
    const card = sampleCard();
    expect(aiDraftReasons(card)).toEqual([]);
    card.statements[1].ai = true;
    expect(aiDraftReasons(card)).toEqual([`${card.statements[1].id} の理由は元の文に無い（AI が書いた）`]);
  });

  it("元の文に無い数字を見つける。全角と半角はそろえる", () => {
    const card = sampleCard();
    card.statements[0].text = "2 m 以上の所では安全帯を 1 本かける";
    expect(aiDraftReasons(card, ["高さ２ｍ以上の所では安全帯を使う"])).toEqual([`${card.statements[0].id} の数字 「1」が元の文に無い`]);
    expect(aiDraftReasons(card, ["高さ２ｍ以上の所では安全帯を１本かける"])).toEqual([]);
  });

  it("元の文の抜き出しが無ければ数字は調べない", () => {
    const card = sampleCard();
    card.statements[0].text = "3 回たしかめる";
    expect(aiDraftReasons(card)).toEqual([]);
  });
});
