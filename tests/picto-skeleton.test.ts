import { describe, expect, it } from "vitest";
import { GROUND, renderFrame, SIZE } from "../src/shared/picto/scene";
import { BONE_RANGE, BONES, type FigureSpec, posePoints, STANDING, validateFigure } from "../src/shared/picto/skeleton";
import { checkStyle } from "../src/shared/picto/style";

const fig = (over: Partial<FigureSpec> = {}): FigureSpec => ({ x: 0.5, height: 0.62, facing: "right", angles: { ...STANDING, arm_near_upper: 60 }, ...over });

describe("人形の骨格の正式版（015）", () => {
  it("関節ごとに名前と角度の範囲があり、範囲の外と知らない関節は断る", () => {
    expect(BONES.every((b) => BONE_RANGE[b][0] < BONE_RANGE[b][1])).toBe(true);
    expect(validateFigure(fig())).toEqual([]);
    expect(validateFigure(fig({ angles: { ...STANDING, neck: 90 } })).join()).toMatch(/neck/);
    expect(validateFigure(fig({ angles: { ...STANDING, tail: 3 } as never })).join()).toMatch(/知らない関節/);
    expect(() => posePoints(fig({ height: 2 }), SIZE, 600)).toThrow(/範囲の外/);
  });

  it("左右の向きを変えると、腰を軸に鏡に映した形になる", () => {
    const r = posePoints(fig(), SIZE, 600);
    const l = posePoints(fig({ facing: "left" }), SIZE, 600);
    for (const k of Object.keys(r.joints) as (keyof typeof r.joints)[]) {
      expect(l.joints[k][0] - l.joints.hip[0]).toBeCloseTo(-(r.joints[k][0] - r.joints.hip[0]), 6);
      expect(l.joints[k][1]).toBeCloseTo(r.joints[k][1], 6);
    }
    // 右向きで前へ上げた手は、腰より右にある
    expect(r.joints.hand_near[0]).toBeGreaterThan(r.joints.hip[0]);
  });

  it("人は最新のキャラクター（髪・顔・服・かぶり物）で描き、関節の位置は頭・肩・腰の順に上から並ぶ（11/5）", () => {
    const { svg, posed } = renderFrame({ figures: [fig()] });
    expect(svg).toContain('data-part="figure"');
    expect(svg).toContain('data-part="ground"');
    expect(svg).toMatch(/<circle [^>]*r="15"[^>]*stroke="#000"/); // 丸い手
    const j = posed[0].joints;
    expect(j.head[1]).toBeLessThan(j.neck[1]);
    expect(j.neck[1]).toBeLessThan(j.shoulder[1]);
    expect(j.shoulder[1]).toBeLessThan(j.hip[1]);
    // 右向きで前へ上げた手は、腰より右にある
    expect(j.hand_near[0]).toBeGreaterThan(j.hip[0]);
  });

  it("いちばん低いところ（靴底）が地面に乗る", () => {
    const { posed } = renderFrame({ figures: [fig()] });
    const p = posed[0];
    // 足首（foot）の下に靴底がある。足首は地面より少し上
    const gap = GROUND * SIZE - Math.max(p.joints.foot_near[1], p.joints.foot_far[1]);
    expect(gap / p.h).toBeGreaterThan(0.02);
    expect(gap / p.h).toBeLessThan(0.1);
  });

  it("絵柄の決まりを守り、同じ入力なら同じ SVG", () => {
    const a = renderFrame({ figures: [fig(), fig({ x: 0.25, facing: "left", angles: { ...STANDING, torso: 40, leg_near_upper: 90, leg_near_lower: -90 } })] }).svg;
    expect(checkStyle(a)).toEqual([]);
    expect(renderFrame({ figures: [fig(), fig({ x: 0.25, facing: "left", angles: { ...STANDING, torso: 40, leg_near_upper: 90, leg_near_lower: -90 } })] }).svg).toBe(a);
  });
});
