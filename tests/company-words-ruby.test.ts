import { describe, expect, it } from "vitest";
import { wordsFromChange } from "../src/shared/company-words";

describe("会社の言葉は、ふりがなを外してから比べる", () => {
  it("ふりがなだけを足した直し・外した直しは、言葉を 0 件にする", () => {
    expect(wordsFromChange({ words: { ja: "検電器を　もつ" } }, { words: { ja: "｜検電器《けんでんき》を　もつ" } })).toEqual([]);
    expect(wordsFromChange({ words: { ja: "｜検電器《けんでんき》を　もつ" } }, { words: { ja: "検電器を　もつ" } })).toEqual([]);
  });

  it("ふりがなの付いた言葉そのものを替えた直しは、ふりがなを外した形で言い換えにする", () => {
    expect(wordsFromChange({ words: { ja: "｜検電器《けんでんき》を　もつ" } }, { words: { ja: "｜検電ドライバー《けんでんどらいばー》を　もつ" } })).toEqual([
      { kind: "rephrase", phrase: "検電器", prefer: "検電ドライバー" },
    ]);
  });
});
