import { describe, expect, it } from "vitest";
import { checkStyle } from "../src/shared/picto/style";
import { burntJacketSvg, posterSvg } from "../src/shared/video/stills";

// 029: 動画の承の素材 2 枚。焼けた作業服はピクトグラムの絵柄の決まりを守り、貼り紙の文字は「イメージ」のほかは全部ぼかす
describe("動画の承の素材（029）", () => {
  it("焼けた作業服は、絵柄の決まり（黒とグレーだけ・文字なし）を守る", () => {
    const svg = burntJacketSvg();
    expect(checkStyle(svg)).toEqual([]);
    expect(svg).not.toMatch(/<text/);
    expect(burntJacketSvg()).toBe(svg);
  });

  it("貼り紙の文字は、ぼかしの中だけ。外にあるのは「イメージ」の 1 つだけ", () => {
    const svg = posterSvg();
    const start = svg.indexOf('<g data-part="poster-text" filter="url(#blur)">');
    const end = svg.indexOf('<g data-part="image-label">');
    expect(start).toBeGreaterThan(0);
    const outside = svg.slice(0, start) + svg.slice(end);
    expect([...outside.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1])).toEqual(["イメージ"]);
    expect([...svg.slice(start, end).matchAll(/<text/g)].length).toBeGreaterThan(30);
    expect(svg).toMatch(/feGaussianBlur stdDeviation="[4-9]/);
  });
});
