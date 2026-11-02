import { describe, expect, it } from "vitest";
import { checkStyle } from "../src/shared/picto/style";

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g data-part="bg"><rect width="100" height="100" fill="#fff"/></g>${body}</svg>`;

describe("絵柄の決まりのテスト（014）", () => {
  it("黒・グレーだけの絵は通る", () => {
    expect(checkStyle(svg(`<circle r="5" fill="#000"/><rect width="3" height="3" fill="#7a7a7a" stroke="rgb(40,40,40)"/>`))).toEqual([]);
  });

  it("黒・グレー以外の色は落ちる", () => {
    expect(checkStyle(svg(`<circle r="5" fill="#ffcc00"/>`)).join()).toMatch(/黒・グレー以外/);
    expect(checkStyle(svg(`<path d="M0 0" stroke="#3366ff"/>`)).join()).toMatch(/黒・グレー以外/);
    expect(checkStyle(svg(`<rect style="fill: #0a6"/>`)).join()).toMatch(/黒・グレー以外/);
    expect(checkStyle(svg(`<rect fill="url(#g)"/>`)).join()).toMatch(/読めない色/);
  });

  it("禁止の赤と新人の白いヘルメットは例外", () => {
    expect(checkStyle(svg(`<g data-part="prohibit"><circle r="40" fill="none" stroke="#d21e1e"/></g>`))).toEqual([]);
    expect(checkStyle(svg(`<g data-part="helmet-new"><path d="M0 0" fill="#fff" stroke="#000"/></g>`))).toEqual([]);
  });

  it("色だけの強調（例外の外の赤・白）は落ちる", () => {
    expect(checkStyle(svg(`<circle r="5" fill="#e00000"/>`)).join()).toMatch(/赤は禁止の印の中だけ/);
    expect(checkStyle(svg(`<g data-part="worker"><path d="M0 0" fill="#ffffff"/></g>`)).join()).toMatch(/白は/);
    expect(checkStyle(svg(`<g data-part="helmet-new"></g><circle r="5" fill="white"/>`)).join()).toMatch(/白は/);
  });

  it("絵の面の文字は落ち、「？」「✓」は図形なら通る", () => {
    expect(checkStyle(svg(`<text x="1" y="1">危</text>`)).join()).toMatch(/<text>/);
    expect(checkStyle(svg(`<foreignObject/>`)).join()).toMatch(/foreignObject/);
    expect(checkStyle(svg(`<image href="x.png"/>`)).join()).toMatch(/image/);
    expect(checkStyle(svg(`<g>？</g>`)).join()).toMatch(/文字/);
    const marks = `<g data-part="bubble"><ellipse rx="20" ry="12" fill="#fff" stroke="#000"/><path d="M-4 -4 Q0 -9 4 -4 Q4 0 0 2 L0 4" fill="none" stroke="#000"/><circle cy="8" r="1.5" fill="#000"/></g>`;
    expect(checkStyle(svg(marks))).toEqual([]);
  });
});
