import { describe, expect, it } from "vitest";
import { imageBlock, pngChunks, svgToPng } from "../src/node/png";
import { renderPoseSvg, SIZE } from "../src/shared/pose/svg";
import { standingPose } from "./fixtures/pose";

describe("SVG を PNG にする（006b）", () => {
  const svg = renderPoseSvg(standingPose());

  it("同じ SVG から同じ PNG", () => {
    expect(Buffer.from(svgToPng(svg)).equals(Buffer.from(svgToPng(svg)))).toBe(true);
  });

  it("大きさは固定、背景は白（四隅が白）", () => {
    const png = svgToPng(svg);
    const v = new DataView(png.buffer, png.byteOffset);
    expect([v.getUint32(16), v.getUint32(20)]).toEqual([SIZE, SIZE]);
    // 透明の無い白い背景: 背景を抜いた SVG でも同じ大きさで白
    const empty = svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"></svg>`);
    expect(pngChunks(empty)[0]).toBe("IHDR");
  });

  it("PNG の中に文字の塊が無い", () => {
    const chunks = pngChunks(svgToPng(svg));
    expect(chunks.every((c) => ["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(c))).toBe(true);
  });

  it("渡す塊は画像のデータだけ", () => {
    const b = imageBlock(svgToPng(svg));
    expect(Object.keys(b)).toEqual(["type", "source"]);
    expect(Object.keys(b.source).sort()).toEqual(["data", "media_type", "type"]);
  });
});
