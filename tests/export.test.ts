import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { printPng, writeExports } from "../src/node/export";
import { dayOf, exportCard, FOOT, footed } from "../src/shared/export";
import { renderFrame, SIZE } from "../src/shared/picto/scene";
import { cutFrames } from "../src/shared/picto/motion";
import { sampleCard } from "./fixtures/card";

// PNG・SVG の書き出し（077）
const dir = mkdtempSync(join(tmpdir(), "export-"));
afterAll(() => {
  for (const f of readdirSync(dir)) rmSync(join(dir, f));
  rmSync(dir, { recursive: true });
});
const ihdr = (png: Uint8Array) => {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
};

describe("PNG・SVG の書き出し（077）", () => {
  it("8 枚が、コマごとに版と日付入りの SVG と PNG で出る", { timeout: 60000 }, () => {
    const signedAt = "2026-11-02T16:30:00.000Z"; // 日本では 11/3
    const items = Array.from({ length: 8 }, (_, i) => exportCard(`card${i + 1}`, sampleCard(), i + 1, signedAt)).flat();
    expect(items).toHaveLength(8 * 3);
    const files = writeExports(items, dir);
    expect(files).toHaveLength(8 * 3 * 2);
    expect(readdirSync(dir).sort()).toEqual([...files].sort());
    expect(files).toContain("card5_v5_2026-11-03_2of3.png");
    for (const it of items) {
      const v = it.name.match(/_v(\d+)_/)![1];
      expect(it.svg).toContain(`版 ${v} ・ 2026-11-03 ・ `);
      const png = new Uint8Array(readFileSync(join(dir, `${it.name}.png`)));
      expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(ihdr(png)).toEqual([SIZE, SIZE + FOOT]);
    }
  });

  it("帯は絵の面の外で、絵そのものは画面と同じ。帯の字は PNG にも描かれる", () => {
    const c = sampleCard();
    const pic = renderFrame(cutFrames(c.motion.kind === "keyframes" ? c.motion.json : null!)[0].frame).svg;
    const [first] = exportCard("x", c, 2, "2026-11-03T01:00:00+09:00");
    expect(first.svg).toContain(pic.slice(pic.indexOf(">") + 1));
    expect(first.svg).toMatch(new RegExp(`<text [^>]*y="${SIZE + FOOT / 2}"`));
    const blank = printPng(footed(pic, ""));
    expect(Buffer.from(printPng(first.svg)).equals(Buffer.from(blank))).toBe(false);
    // 同じ中身なら同じ PNG
    expect(Buffer.from(printPng(first.svg)).equals(Buffer.from(printPng(first.svg)))).toBe(true);
  });

  it("日付は日本の日付。動きの HTML のカードは断る", () => {
    expect(dayOf("2026-11-02T15:00:00.000Z")).toBe("2026-11-03");
    expect(dayOf("2026-11-02T14:59:59.000Z")).toBe("2026-11-02");
    expect(() => exportCard("h", { ...sampleCard(), motion: { kind: "html", html: "<div></div>", duration: 3 } }, 1, "2026-11-03T00:00:00Z")).toThrow(/HTML/);
  });
});
