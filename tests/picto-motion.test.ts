import { describe, expect, it } from "vitest";
import { cutPngs } from "../src/node/motion-png";
import { cutFrames, frameAt, MOTION_JSON_SCHEMA, type MotionJson, playSvgs, validateMotion } from "../src/shared/picto/motion";
import { POSES } from "../src/shared/picto/poses";
import { renderFrame } from "../src/shared/picto/scene";
import { checkStyle } from "../src/shared/picto/style";

const fig = (x: number, angles = POSES.stand) => ({ x, height: 0.55, facing: "right" as const, angles });
const prop = (dx = 0) => ({ kind: "tester" as const, figure: 0, joint: "hand_near" as const, dx, dy: 0, x: 0, y: 0, size: 0.12 });
// 歩いて近づき、しゃがんで、検電器を当てる
const M: MotionJson = {
  keyframes: [
    { t: 0, mark: true, figures: [fig(0.2, POSES.walk)], props: [prop()] },
    { t: 1, mark: false, figures: [fig(0.4, POSES.stand)], props: [prop()] },
    { t: 2, mark: true, figures: [fig(0.5, POSES.squat)], props: [prop()] },
    { t: 3, mark: true, figures: [fig(0.5, POSES.hands)], props: [prop(0.05)] },
  ],
};

describe("動きを再生してコマを切り出す（079a）", () => {
  it("スキーマはキーフレームの形を決め、関節の名前をすべて求める", () => {
    const k = MOTION_JSON_SCHEMA.properties.keyframes.items;
    expect(k.required).toEqual(["t", "mark", "figures", "props"]);
    expect(k.properties.figures.items.properties.angles.required).toContain("arm_near_lower");
    expect(validateMotion(M)).toEqual([]);
  });

  it("範囲の外は断る（時刻の順・印の数・人数・関節・小物の並び）", () => {
    const bad = (f: (m: MotionJson) => void) => {
      const m = structuredClone(M);
      f(m);
      return validateMotion(m).join(" / ");
    };
    expect(bad((m) => (m.keyframes[2].t = 0.5))).toMatch(/前より後/);
    expect(bad((m) => (m.keyframes[3].mark = false))).toMatch(/印は 3〜4/);
    expect(bad((m) => m.keyframes[1].figures.push(fig(0.8)))).toMatch(/人数/);
    expect(bad((m) => (m.keyframes[1].figures[0].angles.torso = 170))).toMatch(/torso/);
    expect(bad((m) => (m.keyframes[1].props[0].kind = "lock"))).toMatch(/小物の並び/);
    expect(bad((m) => (m.keyframes[3].t = 99))).toMatch(/範囲の外/);
    expect(() => cutPngs({ keyframes: [M.keyframes[0]] })).toThrow(/2 つ以上/);
  });

  it("間は線形に補って動く", () => {
    const mid = frameAt(M, 0.5).figures[0];
    expect(mid.x).toBeCloseTo(0.3, 6);
    const a = POSES.walk.leg_near_upper;
    const b = POSES.stand.leg_near_upper;
    expect(mid.angles.leg_near_upper).toBeCloseTo((a + b) / 2, 6);
    const p = frameAt(M, 2.5).props?.[0].at;
    expect(p && "dx" in p ? p.dx : null).toBeCloseTo(0.025, 6);
    expect(playSvgs(M, 4)).toHaveLength(13);
  });

  it("印の 3 か所がコマになり、同じ JSON なら同じコマ。どのコマも絵柄のテストが通る", () => {
    const c = cutFrames(M);
    expect(c.map((x) => x.t)).toEqual([0, 2, 3]);
    for (const { frame } of c) expect(checkStyle(renderFrame(frame).svg)).toEqual([]);
    const p1 = cutPngs(M);
    const p2 = cutPngs(structuredClone(M));
    expect(p1).toHaveLength(3);
    p1.forEach((x, i) => expect(Buffer.from(x.png).equals(Buffer.from(p2[i].png))).toBe(true));
    expect(Buffer.from(p1[0].png).equals(Buffer.from(p1[1].png))).toBe(false);
  });
});
