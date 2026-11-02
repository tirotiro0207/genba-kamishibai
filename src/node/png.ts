// SVG を PNG にする（006b）。大きさは固定、背景は白。確かめる AI に渡すのは画像のデータだけで、
// PNG の中に文字の塊（tEXt・iTXt・zTXt・eXIf・tIME）を残さない。
import { Resvg } from "@resvg/resvg-js";
import { SIZE } from "../shared/pose/svg";

const KEEP = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);

/** PNG の塊の名前の一覧 */
export function pngChunks(png: Uint8Array): string[] {
  const out: string[] = [];
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let i = 8; i + 8 <= png.length; ) {
    const len = v.getUint32(i);
    out.push(String.fromCharCode(...png.subarray(i + 4, i + 8)));
    i += 12 + len;
  }
  return out;
}

/** 絵に要らない塊を落とす（色の塊 gAMA・sRGB なども落とし、どの環境でも同じバイト列にする） */
export function stripPng(png: Uint8Array): Uint8Array {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  for (let i = 8; i + 8 <= png.length; ) {
    const len = v.getUint32(i);
    const type = String.fromCharCode(...png.subarray(i + 4, i + 8));
    if (KEEP.has(type)) parts.push(png.subarray(i, i + 12 + len));
    i += 12 + len;
  }
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) out.set(p, (o += p.length) - p.length);
  return out;
}

export function svgToPng(svg: string, size = SIZE): Uint8Array {
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "#ffffff",
    font: { loadSystemFonts: false },
  });
  return stripPng(r.render().asPng());
}

/** 確かめる AI に渡す画像の塊。データだけで、ファイル名や説明は付けない */
export function imageBlock(png: Uint8Array) {
  return { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: Buffer.from(png).toString("base64") } };
}
