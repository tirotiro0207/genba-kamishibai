import { describe, expect, it } from "vitest";
import { bareKanji, rubyBase, rubyParen, rubySegments } from "../src/shared/ruby";

describe("やさしい日本語のふりがな（docs/yasashii-nihongo.md）", () => {
  it("｜漢字《よみ》を、ふりがなの付いた字に分ける", () => {
    expect(rubySegments("｜検電器《けんでんき》を　もつ")).toEqual([{ text: "検電器", ruby: "けんでんき" }, { text: "を　もつ" }]);
  });

  it("｜を省いたときは、《 の直前に続く漢字だけを親の字にする", () => {
    expect(rubySegments("この感電《かんでん》の")).toEqual([{ text: "この" }, { text: "感電", ruby: "かんでん" }, { text: "の" }]);
  });

  it("ふりがなを外した文と、（ ）にした文を作る", () => {
    const s = "｜検電器《けんでんき》で　｜感電《かんでん》を　ふせぐ";
    expect(rubyBase(s)).toBe("検電器で　感電を　ふせぐ");
    expect(rubyParen(s)).toBe("検電器（けんでんき）で　感電（かんでん）を　ふせぐ");
  });

  it("ふりがなの無い漢字を見つける（ふりがなの付いた字は見ない）", () => {
    expect(bareKanji("｜検電器《けんでんき》を　持って　作業する")).toEqual(["持", "作", "業"]);
    expect(bareKanji("｜検電器《けんでんき》を　もって　しごとを　してください。")).toEqual([]);
    expect(bareKanji("ふりがなの無い文は　ひらがなだけ")).toEqual(["無", "文"]);
  });
});
