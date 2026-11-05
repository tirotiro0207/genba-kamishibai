// 8 枚の口の直し（11/6）で足した絵の部品: 表情・疲れの線・高い所に立つ・熱の顔・2 つ入る吹き出し・電球・点線の範囲・仕切り・切れた電線・高さの札
import { describe, expect, it } from "vitest";
import { cutFrames, MOTION_JSON_SCHEMA, type MotionJson, validateMotion } from "../src/shared/picto/motion";
import { POSES } from "../src/shared/picto/poses";
import { INNER_KINDS, PROP_KINDS, type PropKind, STAND_TOP } from "../src/shared/picto/props";
import { renderFrame, validateFrame } from "../src/shared/picto/scene";
import { checkStyle } from "../src/shared/picto/style";

const F = (extra: object = {}) => ({ role: "new" as const, x: 0.5, height: 0.55, facing: "right" as const, angles: POSES.stand, ...extra });
const NEW: PropKind[] = ["bulb_flicker", "bulb_steady", "danger_zone", "partition", "wire_broken", "height_2m", "fever"];

describe("11/6 の小物", () => {
  it("7 つがそろい、置いても手に持っても絵柄の検査が通る（字は「2m」だけで、線で描く）", () => {
    for (const kind of NEW) {
      expect(PROP_KINDS, kind).toContain(kind);
      const svg = renderFrame({ figures: [F()], props: [{ kind, at: { x: 0.7, y: 0.6 }, size: 0.2 }] }).svg;
      expect(svg, kind).toContain('data-part="prop"');
      expect(checkStyle(svg), kind).toEqual([]);
      expect(checkStyle(renderFrame({ figures: [F()], props: [{ kind, at: { figure: 0, joint: "hand_near" }, size: 0.12 }] }).svg), kind).toEqual([]);
    }
  });

  it("電球をキャンバスに置くと天井からコードで下がり、手に持つとコードは無い。ちらつく電球と安定した電球は違う絵になる", () => {
    const hung = renderFrame({ figures: [], props: [{ kind: "bulb_steady", at: { x: 0.5, y: 0.3 }, size: 0.14 }] }).svg;
    const held = renderFrame({ figures: [F()], props: [{ kind: "bulb_steady", at: { figure: 0, joint: "hand_near" }, size: 0.14 }] }).svg;
    expect(hung).toMatch(/M384 46\.1V/); // 天井の線（0.06 × 768）から下がるコード
    expect(held).not.toMatch(/M[\d.]+ 46\.1V/);
    expect(renderFrame({ figures: [], props: [{ kind: "bulb_flicker", at: { x: 0.5, y: 0.3 }, size: 0.14 }] }).svg).not.toBe(hung);
  });

  it("熱の顔・2 つの電球・切れた電線は吹き出しの中に入れられる", () => {
    for (const k of ["fever", "bulb_flicker", "bulb_steady", "wire_broken"] as const) {
      expect(INNER_KINDS, k).toContain(k);
      const svg = renderFrame({ figures: [F()], props: [{ kind: "bubble_say", at: { figure: 0, joint: "head", dy: -0.3 }, size: 0.3, inner: k }] }).svg;
      expect(checkStyle(svg), k).toEqual([]);
    }
  });

  it("台の上の面の高さ（STAND_TOP）は作業台・足場・高所作業車・踏み台にある", () => {
    for (const k of ["work_platform", "rolling_scaffold", "aerial_platform", "step_stool"] as const) expect(STAND_TOP[k], k).toBeGreaterThan(0);
  });
});

describe("2 つ入る吹き出し", () => {
  const two = (marks?: ["question" | "circle" | "cross" | "none", "question" | "circle" | "cross" | "none"]) =>
    renderFrame({ figures: [F()], props: [{ kind: "think_question", at: { figure: 0, joint: "head", dy: -0.3 }, size: 0.3, inner: "toolbox", inner2: "box", ...(marks ? { inner_marks: marks } : {}) }] }).svg;

  it("道具 2 つを並べ、印を変えると絵が変わる。絵柄の検査が通る", () => {
    const q = two(["question", "question"]);
    const ox = two(["circle", "cross"]);
    expect(checkStyle(q)).toEqual([]);
    expect(checkStyle(ox)).toEqual([]);
    expect(q).not.toBe(ox);
    expect(two()).not.toBe(q);
  });

  it("inner の無い inner2、inner2 の無い印、知らない印は断る", () => {
    const at = { figure: 0, joint: "head" as const };
    expect(validateFrame({ figures: [F()], props: [{ kind: "bubble_say", at, size: 0.3, inner2: "box" }] }).join()).toMatch(/inner2/);
    expect(validateFrame({ figures: [F()], props: [{ kind: "bubble_say", at, size: 0.3, inner: "box", inner_marks: ["circle", "cross"] }] }).join()).toMatch(/inner_marks/);
    // @ts-expect-error 知らない印
    expect(validateFrame({ figures: [F()], props: [{ kind: "bubble_say", at, size: 0.3, inner: "box", inner2: "toolbox", inner_marks: ["star", "cross"] }] }).join()).toMatch(/inner_marks/);
  });
});

describe("人の表情・疲れの線・高い所", () => {
  it("への字の顔（sad）は、ふつうの顔と違う絵になる。疲れの線は tired のときだけ描く", () => {
    const base = renderFrame({ figures: [F()] }).svg;
    expect(renderFrame({ figures: [F({ expression: "sad" })] }).svg).not.toBe(base);
    expect(base).not.toContain('data-part="tired"');
    const t = renderFrame({ figures: [F({ expression: "sad", tired: true })] }).svg;
    expect(t.match(/data-part="tired">(.*?)<\/g>/)?.[1].match(/<line/g)).toHaveLength(3);
    expect(checkStyle(t)).toEqual([]);
  });

  it("lift の分だけ人が上がり、範囲の外（0〜0.5）は断る", () => {
    const low = renderFrame({ figures: [F()] }).posed[0].joints.foot_near[1];
    const high = renderFrame({ figures: [F({ lift: 0.25 })] }).posed[0].joints.foot_near[1];
    expect(low - high).toBeCloseTo(0.25 * 768, 0);
    expect(validateFrame({ figures: [F({ lift: 0.6 })] }).join()).toMatch(/lift/);
    expect(validateFrame({ figures: [F({ expression: "sleepy" })] }).join()).toMatch(/expression/);
  });

  it("キーフレームの JSON で表情・疲れの線・lift・2 つの道具を書ける。lift は間を補い、表情は前のキーフレームのまま", () => {
    const fig = (lift: number, expression: "sad" | "neutral") => ({ role: "new" as const, x: 0.5, height: 0.5, facing: "right" as const, angles: POSES.stand, expression, tired: expression === "sad", lift });
    const bubble = { kind: "think_question" as const, show: true, figure: 0, joint: "head" as const, dx: 0.3, dy: -0.3, x: 0, y: 0, size: 0.3, inner: "toolbox" as const, inner2: "box" as const, inner_marks: ["circle", "cross"] as ["circle", "cross"] };
    const m: MotionJson = { keyframes: [
      { t: 0, mark: true, figures: [fig(0, "sad")], props: [bubble] },
      { t: 1, mark: true, figures: [fig(0.2, "neutral")], props: [bubble] },
      { t: 2, mark: true, figures: [fig(0.2, "neutral")], props: [bubble] },
    ] };
    expect(validateMotion(m)).toEqual([]);
    const fr = cutFrames(m);
    expect(fr[0].frame.figures[0]).toMatchObject({ expression: "sad", tired: true });
    expect(fr[1].frame.figures[0].lift).toBeCloseTo(0.2);
    expect(fr[0].frame.props?.[0]).toMatchObject({ inner2: "box", inner_marks: ["circle", "cross"] });
    const fp = MOTION_JSON_SCHEMA.properties.keyframes.items.properties;
    expect(Object.keys(fp.figures.items.properties)).toEqual(expect.arrayContaining(["expression", "tired", "lift"]));
    expect(Object.keys(fp.props.items.properties)).toEqual(expect.arrayContaining(["inner2", "inner_marks"]));
    expect(fp.figures.items.required).not.toContain("lift"); // 古いカードの JSON はそのまま通る
  });
});
