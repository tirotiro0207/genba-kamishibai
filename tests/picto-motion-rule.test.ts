import { describe, expect, it } from "vitest";
import { type MotionJson, validateMotion } from "../src/shared/picto/motion";
import { motionRuleLine, motionRuleWarnings } from "../src/shared/picto/motion-rule";
import { POSES, vary } from "../src/shared/picto/poses";

const fig = (angles: Record<string, number>) => ({ role: "worker" as const, x: 0.5, height: 0.6, facing: "right" as const, angles: angles as never });
const key = (t: number, angles: Record<string, number>, mark = true) => ({ t, mark, figures: [fig(angles)], props: [] });

describe("動きの決まりの警告（エラーにしない）", () => {
  const ok = vary("walk", { arm_near_lower: 20, neck: -15, torso: 8 });
  const bad = vary("walk", { arm_near_upper: 45 });

  it("決まりの中の姿勢は警告なし、外れた姿勢は何番目のキーフレームの誰かを数える", () => {
    const m: MotionJson = { keyframes: [key(0, POSES.stand), key(1, ok), key(2, bad), key(3, bad)] };
    expect(motionRuleWarnings({ keyframes: [key(0, POSES.stand), key(1, ok)] })).toEqual([]);
    expect(motionRuleWarnings(m)).toEqual([
      { keyframe: 2, figure: 0, role: "worker" },
      { keyframe: 3, figure: 0, role: "worker" },
    ]);
    expect(motionRuleLine(motionRuleWarnings(m))).toBe("決まりから外れた姿勢が 2 人");
    expect(motionRuleLine([])).toBe("");
  });

  it("validateMotion には入れない（外れていてもエラーの一覧に決まりの話は出ない）", () => {
    const m: MotionJson = { keyframes: [key(0, bad), key(1, bad), key(2, bad), key(3, bad)] };
    expect(validateMotion(m).join()).not.toMatch(/決まり|派生/);
  });

  it("形の壊れた動きでも例外にしない", () => {
    expect(motionRuleWarnings({} as MotionJson)).toEqual([]);
    expect(motionRuleWarnings({ keyframes: [{ figures: [{}] }] } as unknown as MotionJson)).toEqual([]);
  });
});

describe("動きの決まりの警告: 数え方と壊れた入り", () => {
  const bad = vary("walk", { arm_near_upper: 45 });
  const ok = vary("walk", { arm_near_lower: 20 });

  it("同じキーフレームに 2 人いれば、外れた人だけ figure の番号で数える", () => {
    const m: MotionJson = { keyframes: [{ t: 0, mark: true, figures: [fig(ok), fig(bad), fig(bad)], props: [] }] };
    expect(motionRuleWarnings(m).map((w) => [w.keyframe, w.figure])).toEqual([[0, 1], [0, 2]]);
    expect(motionRuleLine(motionRuleWarnings(m))).toBe("決まりから外れた姿勢が 2 人");
  });

  it("動きが無い・null・keyframes が配列でないときも例外にせず空を返す", () => {
    for (const v of [undefined, null, { keyframes: null }, { keyframes: "x" }, { keyframes: [null, { figures: null }] }])
      expect(motionRuleWarnings(v as unknown as MotionJson)).toEqual([]);
  });

  it("angles の無い人は数えない（画面が止まらない）", () => {
    const m = { keyframes: [{ t: 0, mark: true, figures: [{ role: "worker" }, null], props: [] }] };
    expect(motionRuleWarnings(m as unknown as MotionJson)).toEqual([]);
  });
});
