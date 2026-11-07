import { describe, expect, it } from "vitest";
import { needsJapanese } from "../src/shared/answer-fields";

describe("採点で訳が要る答えの見分け（11/7 作者「母語で書いたところは全部訳を」）", () => {
  it("母語の欄があれば要る。日本語の欄に外国の字が混ざっていても要る。日本語だけなら要らない", () => {
    expect(needsJapanese({ ja: "", own: "dừng lại" })).toBe(true);
    expect(needsJapanese({ ja: "止まる dung lai", own: "" })).toBe(true);
    expect(needsJapanese({ ja: "ឈប់", own: "" })).toBe(true);
    expect(needsJapanese({ ja: "ရပ်", own: "" })).toBe(true);
    expect(needsJapanese({ ja: "止まる。検電する", own: "" })).toBe(false);
    expect(needsJapanese({ ja: "", own: "" })).toBe(false);
  });
});
