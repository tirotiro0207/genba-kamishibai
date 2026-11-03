import { describe, expect, it } from "vitest";
import { POSES } from "../src/shared/picto/poses";
import { PROP_KINDS } from "../src/shared/picto/props";
import { STORY_BUBBLE_INNER, STORY_KINDS, storyFrameSvg } from "../src/shared/picto/story";
import { checkStyle } from "../src/shared/picto/style";

// 096a: 動画の起の紙芝居の部品。カードの小物とは別に持ち、どれも絵柄の決まり（黒とグレー・文字なし・白は吹き出しの中だけ）を守る
const F = { x: 0.3, height: 0.5, facing: "right" as const, angles: POSES.hands };

describe("起の紙芝居の部品（096a）", () => {
  it("部品はどれも 1 枚の絵に置けて、絵柄のテストが通る", () => {
    for (const kind of STORY_KINDS) {
      const svg = storyFrameSvg({ figures: [F] }, [{ kind, x: 0.65, y: 0.45, size: 0.3 }]);
      expect(svg, kind).toContain('data-part="prop"');
      expect(checkStyle(svg), kind).toEqual([]);
      // 枠の線は部品より上に残る
      expect(svg.lastIndexOf('data-part="border"'), kind).toBeGreaterThan(svg.lastIndexOf('data-part="prop"'));
    }
  });

  it("考える吹き出しに地図・地球・ハートを 1 つか 2 つ入れられ、白は吹き出しの中だけ", () => {
    for (const a of STORY_BUBBLE_INNER)
      for (const inner of [[a], [a, "map_vietnam" as const]]) {
        const svg = storyFrameSvg({ figures: [F] }, [{ kind: "think", x: 0.6, y: 0.25, size: 0.4, inner, to: [0.3, 0.35] }]);
        expect(checkStyle(svg), inner.join("+")).toEqual([]);
      }
  });

  it("カードの小物の一覧（AI の構造化出力のスキーマ）には入れない", () => {
    for (const k of STORY_KINDS) expect((PROP_KINDS as readonly string[]).includes(k), k).toBe(false);
  });
});
