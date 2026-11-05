// 11/6 昼の 20 枚の口の直しで足した絵の部品: 消えた電球・漢字の札 2 つ・安全の十字・「1…2…3 SEC」・元気な顔・チェック表の行の数と丸数字と行の頭の絵
import { describe, expect, it } from "vitest";
import { POSES } from "../src/shared/picto/poses";
import { INNER_KINDS, KANJI_LABEL, PROP_KINDS, type PropKind, type PropSpec } from "../src/shared/picto/props";
import { renderFrame, validateFrame } from "../src/shared/picto/scene";
import { checkStyle } from "../src/shared/picto/style";

const F = (extra: object = {}) => ({ role: "new" as const, x: 0.4, height: 0.55, facing: "right" as const, angles: POSES.stand, ...extra });
const NEW: PropKind[] = ["bulb_off", "label_teiatsu", "label_anzen", "safety_cross", "count_3sec", "healthy"];
const svgOf = (props: PropSpec[]) => renderFrame({ figures: [F()], props }).svg;

describe("11/6 昼の小物", () => {
  it("6 つがそろい、置いても手に持っても絵柄の検査が通る（text 要素は使わない）", () => {
    for (const kind of NEW) {
      expect(PROP_KINDS, kind).toContain(kind);
      const svg = svgOf([{ kind, at: { x: 0.75, y: 0.15 }, size: 0.3 }]);
      expect(checkStyle(svg), kind).toEqual([]);
      expect(svg, kind).not.toMatch(/<text/);
      expect(checkStyle(svgOf([{ kind, at: { figure: 0, joint: "hand_near" }, size: 0.12 }])), kind).toEqual([]);
    }
  });

  it("消えた電球は光の線もちらつきも無く、ガラスがグレー。安定した電球と違う絵になり、天井から下がる", () => {
    const on = renderFrame({ figures: [], props: [{ kind: "bulb_steady", at: { x: 0.5, y: 0.3 }, size: 0.14 }] }).svg;
    const off = renderFrame({ figures: [], props: [{ kind: "bulb_off", at: { x: 0.5, y: 0.3 }, size: 0.14 }] }).svg;
    expect(off).not.toBe(on);
    expect(off).toMatch(/M384 46\.1V/);
    expect(off).toContain('fill="#999"');
    expect(off).not.toContain("stroke-dasharray");
    expect((off.match(/<line/g) ?? []).length).toBeLessThan((on.match(/<line/g) ?? []).length - 6);
  });

  it("漢字の札は 4 文字を塗りの path で描く（低圧停電・安全確認）", () => {
    expect(KANJI_LABEL.label_teiatsu).toBe("低圧停電");
    expect(KANJI_LABEL.label_anzen).toBe("安全確認");
    for (const kind of ["label_teiatsu", "label_anzen"] as const) {
      const svg = svgOf([{ kind, at: { x: 0.78, y: 0.1 }, size: 0.38 }]);
      expect(svg.match(/fill="#000" transform="translate/g), kind).toHaveLength(4);
    }
    expect(svgOf([{ kind: "label_teiatsu", at: { x: 0.78, y: 0.1 }, size: 0.38 }])).not.toBe(svgOf([{ kind: "label_anzen", at: { x: 0.78, y: 0.1 }, size: 0.38 }]));
  });

  it("消えた電球・「1…2…3 SEC」・元気な顔・十字は吹き出しの中に入れられる。元気な顔と熱の顔は違う絵", () => {
    for (const k of ["bulb_off", "count_3sec", "healthy", "safety_cross"] as const) {
      expect(INNER_KINDS, k).toContain(k);
      for (const kind of ["bubble_say", "bubble_check", "think_question"] as const) {
        const svg = svgOf([{ kind, at: { figure: 0, joint: "head", dx: 0.4, dy: -0.3 }, size: 0.36, inner: k }]);
        expect(checkStyle(svg), `${kind} ${k}`).toEqual([]);
      }
    }
    const say = (inner: "healthy" | "fever") => svgOf([{ kind: "bubble_say", at: { figure: 0, joint: "head", dy: -0.3 }, size: 0.3, inner }]);
    expect(say("healthy")).not.toBe(say("fever"));
  });
});

describe("チェック表の欄", () => {
  const at = { x: 0.5, y: 0.5 };
  it("欄を省けば前の絵と同じ。欄を付けると絵が変わる", () => {
    const base = svgOf([{ kind: "checklist", at, size: 0.3 }]);
    expect(svgOf([{ kind: "checklist", at, size: 0.3, rows: 6 }])).not.toBe(base);
    // 前の絵: 3 行、✓ は上の 2 行（polyline が 2 本）
    expect(base.match(/<polyline/g)).toHaveLength(2);
  });

  it("行の数・✓ の数・丸数字・転倒の絵が描け、大きさ 0.5 まで絵柄の検査が通る", () => {
    const svg = svgOf([{ kind: "checklist", at, size: 0.5, rows: 6, checks: 4, numbered: true, icons: ["fall", "cone", "none", "spark"] }]);
    expect(checkStyle(svg)).toEqual([]);
    expect(svg.match(/<polyline/g)).toHaveLength(4);
    // 丸数字の輪 6 つ
    expect(svg.match(/<circle [^>]*fill="none"/g)?.length).toBeGreaterThanOrEqual(6);
    const noFall = svgOf([{ kind: "checklist", at, size: 0.5, rows: 6, checks: 4, numbered: true, icons: ["none", "cone", "none", "spark"] }]);
    expect(noFall).not.toBe(svg);
    const allChecked = svgOf([{ kind: "checklist", at: { figure: 0, joint: "hand_near" }, size: 0.32, rows: 6, numbered: true, checks: 6 }]);
    expect(allChecked.match(/<polyline/g)).toHaveLength(6);
  });

  it("範囲の外の欄と、チェック表のほかに付けた欄は断る", () => {
    const v = (p: Partial<PropSpec>) => validateFrame({ figures: [F()], props: [{ kind: "checklist", at, size: 0.3, ...p } as PropSpec] }).join();
    expect(v({ rows: 9 })).toMatch(/rows/);
    expect(v({ rows: 1 })).toMatch(/rows/);
    expect(v({ rows: 4, checks: 5 })).toMatch(/checks/);
    expect(v({ rows: 2, icons: ["fall", "fall", "fall"] })).toMatch(/icons/);
    // @ts-expect-error 知らない絵
    expect(v({ icons: ["star"] })).toMatch(/icons/);
    expect(v({ rows: 6, checks: 6, numbered: true, icons: ["fall"] })).toBe("");
    expect(validateFrame({ figures: [F()], props: [{ kind: "box", at, size: 0.3, rows: 6 }] }).join()).toMatch(/checklist/);
  });
});

describe("3m の距離の矢印（11/6 朝 作者「3 メートル離れる」）", () => {
  it("横の矢印と「3m」の札を線で描き、絵柄の検査が通る。長さは size で変わる", () => {
    expect(PROP_KINDS).toContain("distance_3m");
    const svg = svgOf([{ kind: "distance_3m", at: { x: 0.5, y: 0.84 }, size: 0.3 }]);
    expect(checkStyle(svg)).toEqual([]);
    expect(svg).not.toMatch(/<text/);
    expect(svg).not.toBe(svgOf([{ kind: "distance_3m", at: { x: 0.5, y: 0.84 }, size: 0.45 }]));
  });
});
