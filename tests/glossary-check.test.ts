import { describe, expect, it } from "vitest";
import { checkGlossary, splitJa, viOptions } from "../src/shared/make/glossary-check";
import { sampleCard } from "./fixtures/card";

// 用語表とカードの「言葉」の欄の照合（056）
const card = (id: string, ja: string, vi: string) => ({ id, body: { ...sampleCard(), words: { ja, vi } } });

describe("用語表の照合（056）", () => {
  it("読み仮名を分け、ベトナム語の候補を区切る", () => {
    expect(splitJa("検電器（けんでんき）")).toEqual({ base: "検電器", reading: "けんでんき" });
    expect(splitJa("EPS")).toEqual({ base: "EPS", reading: null });
    expect(viOptions("bút thử điện / máy dò điện áp (dụng cụ)")).toEqual(["bút thử điện", "máy dò điện áp"]);
  });

  it("日本語が読み仮名で出てくれば合う。ベトナム語は候補のどれかが出てくれば合う", () => {
    const cards = [card("c1", "けんでんきで しらべます。", "Dùng bút thử điện để kiểm tra.")];
    expect(checkGlossary(cards, [{ ja: "検電器（けんでんき）", vi: "máy dò điện áp / bút thử điện", card_id: "c1" }])).toEqual([]);
  });

  it("出てこない日本語・ベトナム語と、カードによって違うベトナム語を食い違いにする", () => {
    const cards = [card("c1", "けんでんきで しらべます。", "Dùng bút thử điện."), card("c2", "けんでんきを つかいます。", "Dùng máy dò điện áp.")];
    const out = checkGlossary(cards, [
      { ja: "検電器（けんでんき）", vi: "bút thử điện", card_id: "c1" },
      { ja: "検電器（けんでんき）", vi: "máy dò điện áp", card_id: "c2" },
      { ja: "施錠", vi: "khóa lại", card_id: "c1" },
    ]);
    expect(out.map((m) => m.kind).sort()).toEqual(["differs", "ja", "vi"]);
    expect(out.find((m) => m.kind === "differs")!.ja).toBe("検電器");
  });
});
