import { describe, expect, it } from "vitest";
import { POSES } from "../src/shared/picto/poses";
import { anchorPoint, PROP_KINDS, type PropSpec } from "../src/shared/picto/props";
import { renderFrame } from "../src/shared/picto/scene";
import { checkStyle } from "../src/shared/picto/style";

const F = (x = 0.4) => ({ x, height: 0.55, facing: "right" as const, angles: POSES.hands });

describe("小物の部品 2（018a）", () => {
  it("吊り荷と矢印・箒と箱・鍵と札がそろい、どれも絵柄のテストが通る", () => {
    expect([...PROP_KINDS]).toEqual(expect.arrayContaining(["suspended_load", "arrow_down", "broom", "box", "lock", "tag"]));
    for (const kind of ["suspended_load", "arrow_down", "broom", "box", "lock", "tag"] as const) {
      const svg = renderFrame({ figures: [F()], props: [{ kind, at: { figure: 0, joint: "hand_near" }, size: 0.15 }] }).svg;
      expect(svg, kind).toContain('data-part="prop"');
      expect(checkStyle(svg), kind).toEqual([]);
    }
  });

  it("人形のどこに付くかが数字で決まる（関節とずれ）", () => {
    const r = renderFrame({ figures: [F()] });
    const hand = r.posed[0].joints.hand_near;
    expect(anchorPoint({ figure: 0, joint: "hand_near" }, r.posed, 768).c).toEqual(hand);
    const moved = anchorPoint({ figure: 0, joint: "hand_near", dx: 0.1, dy: -0.05 }, r.posed, 768).c;
    expect(moved[0] - hand[0]).toBeCloseTo(0.1 * r.posed[0].h, 6);
    expect(moved[1] - hand[1]).toBeCloseTo(-0.05 * r.posed[0].h, 6);
    // 左向きの人では、ずれも左へ
    const l = renderFrame({ figures: [{ ...F(), facing: "left" }] });
    const lm = anchorPoint({ figure: 0, joint: "hand_near", dx: 0.1 }, l.posed, 768).c;
    expect(lm[0]).toBeLessThan(l.posed[0].joints.hand_near[0]);
    expect(anchorPoint({ x: 0.5, y: 0.25 }, [], 768).c).toEqual([384, 192]);
  });

  it("人形を動かすと、付けた小物もついて動く", () => {
    const p: PropSpec[] = [{ kind: "lock", at: { figure: 0, joint: "hand_near" }, size: 0.1 }];
    expect(renderFrame({ figures: [F(0.3)], props: p }).svg).not.toBe(renderFrame({ figures: [F(0.6)], props: p }).svg);
  });

  it("範囲の外は断る", () => {
    expect(() => renderFrame({ figures: [F()], props: [{ kind: "box", at: { figure: 2, joint: "hand_near" }, size: 0.1 }] })).toThrow(/人物の番号/);
    expect(() => renderFrame({ figures: [F()], props: [{ kind: "box", at: { x: 2, y: 0 }, size: 0.1 }] })).toThrow(/範囲の外/);
    expect(() => renderFrame({ figures: [F()], props: [{ kind: "box", at: { x: 0.5, y: 0.5 }, size: 0.9 }] })).toThrow(/size/);
  });
});
