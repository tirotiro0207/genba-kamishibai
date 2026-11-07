import { describe, expect, it } from "vitest";
import { printPng } from "../src/node/export";
import { exportCard, exportPrinciples, exportSheet, LIFE_RED, SHEET_H, SHEET_W, wrapText } from "../src/shared/export";
import { principleMotion } from "../src/shared/picto/motion";
import { checkStyle } from "../src/shared/picto/style";
import { renderFrame } from "../src/shared/picto/scene";
import { cutFrames } from "../src/shared/picto/motion";
import { MOTION, sampleCard } from "./fixtures/card";

// 掲示の版・原則の列・命に関わるカードの赤い縁（11/7 既定）
const principle = () => {
  const k = MOTION.keyframes[0];
  return { ...sampleCard(), shape: "principle" as const, motion: { kind: "keyframes" as const, json: principleMotion({ figures: k.figures, props: k.props }) }, frames: [{ t: 0 }] };
};
const ihdr = (png: Uint8Array) => {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
};

describe("掲示の版", () => {
  it("A4 横の 1 枚に、コマを大きく並べ、やさしい日本語はふりがなを（ ）で、版と日付を入れる", { timeout: 60000 }, () => {
    const c = { ...sampleCard(), words: { ja: "｜盤《ばん》に さわる まえに たしかめる" } };
    const s = exportSheet("card1", c, 3, "2026-11-02T16:30:00.000Z");
    expect(s.name).toBe("card1_v3_2026-11-03_sheet");
    expect(s.svg).toContain(`width="${SHEET_W}" height="${SHEET_H}"`);
    expect(s.svg).toContain("盤（ばん）に");
    expect(s.svg).toContain("版 3 ・ 2026-11-03");
    // コマ 3 つ（大きく）。赤は無い
    expect(s.svg.match(/<svg x="/g)).toHaveLength(3);
    expect(s.svg).not.toContain(LIFE_RED);
    expect(ihdr(printPng(s.svg))).toEqual([SHEET_W, SHEET_H]);
  });

  it("命に関わるカードは紙の余白と帯に赤い縁が付き、絵の面そのものは変わらない（絵柄の検査も通る）", () => {
    const c = { ...sampleCard(), weight: "life" as const };
    const s = exportSheet("card2", c, 1, "2026-11-03T00:00:00Z");
    expect(s.svg).toContain(LIFE_RED);
    expect(s.svg).toContain("命に関わる");
    const frames = exportCard("card2", c, 1, "2026-11-03T00:00:00Z");
    const pic = renderFrame(cutFrames(c.motion.kind === "keyframes" ? c.motion.json : null!)[0].frame).svg;
    expect(frames[0].svg).toContain(pic.slice(pic.indexOf(">") + 1));
    expect(frames[0].svg).toContain('data-part="life-rim"');
    expect(checkStyle(pic)).toEqual([]);
    // ふつうのカードの帯は今までどおり
    expect(exportCard("c", sampleCard(), 1, "2026-11-03T00:00:00Z")[0].svg).not.toContain(LIFE_RED);
  });

  it("原則の 1 コマは 1 枚を大きく", () => {
    const s = exportSheet("p1", principle(), 1, "2026-11-03T00:00:00Z");
    expect(s.svg.match(/<svg x="/g)).toHaveLength(1);
  });
});

describe("原則の列", () => {
  it("原則のカードだけを横 1 列に小さく並べ、無ければ null", { timeout: 60000 }, () => {
    expect(exportPrinciples([{ id: "s", body: sampleCard(), version: 1, signedAt: "2026-11-03T00:00:00Z" }])).toBeNull();
    const row = exportPrinciples([
      { id: "a", body: principle(), version: 1, signedAt: "2026-11-03T00:00:00Z" },
      { id: "b", body: { ...principle(), weight: "life" }, version: 2, signedAt: "2026-11-03T00:00:00Z" },
      { id: "s", body: sampleCard(), version: 1, signedAt: "2026-11-03T00:00:00Z" },
    ])!;
    expect(row.svg.match(/<svg x="/g)).toHaveLength(2);
    expect(row.svg).toContain(LIFE_RED);
    expect(ihdr(printPng(row.svg))[0]).toBe(SHEET_W);
  });

  it("文は字の数で折り、多すぎれば … で切る", () => {
    expect(wrapText("あいうえおかきくけこ", 4)).toEqual(["あいうえ", "おかきく", "けこ"]);
    expect(wrapText("あいうえおかきくけこ", 4, 2)).toEqual(["あいうえ", "おかき…"]);
  });
});
