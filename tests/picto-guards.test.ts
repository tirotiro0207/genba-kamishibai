// 壊れた・古い値で落ちないことの守り（11/7 の点検の直し）
import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, normalizeAvatar } from "../src/client/avatar/store";
import { DEFAULT_FACE } from "../src/shared/picto/avatar";
import { characterSvg } from "../src/shared/picto/character";
import { keyToFrame, type MotionJson, validateFrameJson, validateMotion } from "../src/shared/picto/motion";
import { POSES } from "../src/shared/picto/poses";
import { craneTip, propCenters, validateProps } from "../src/shared/picto/props";
import { renderFrame, validateFrame } from "../src/shared/picto/scene";
import { STANDING } from "../src/shared/picto/skeleton";

const fig = (x: number) => ({ role: "new" as const, x, height: 0.55, facing: "right" as const, angles: POSES.stand });
const prop = () => ({ kind: "tester" as const, show: true, figure: 0, joint: "hand_near" as const, dx: 0, dy: 0, x: 0, y: 0, size: 0.12, inner: "none" as const });
const M: MotionJson = {
  keyframes: [
    { t: 0, mark: true, figures: [fig(0.2)], props: [prop()] },
    { t: 1, mark: true, figures: [fig(0.4)], props: [prop()] },
    { t: 2, mark: true, figures: [fig(0.5)], props: [prop()] },
  ],
};

describe("形の壊れた動きは、例外でなく文字のエラーで返す", () => {
  it("figures・props が並びでないキーフレーム", () => {
    for (const broken of [{ figures: "x" }, { props: 3 }, { figures: [null] }, { props: [null] }]) {
      const m = structuredClone(M) as unknown as { keyframes: Record<string, unknown>[] };
      Object.assign(m.keyframes[1], broken);
      expect(() => validateMotion(m as unknown as MotionJson)).not.toThrow();
      expect(validateMotion(m as unknown as MotionJson).join(" / ")).toMatch(/keyframes\[1\]/);
    }
    expect(validateMotion({ keyframes: [null, null] } as unknown as MotionJson)).toHaveLength(1);
  });

  it("1 枚の絵の検査も落ちない", () => {
    expect(validateFrame({ figures: "x" } as never)).toHaveLength(1);
    expect(validateFrame({ figures: [], props: "x" } as never)).toHaveLength(1);
    expect(validateFrame({ figures: [null] } as never)).toHaveLength(1);
    expect(validateProps([null, { kind: "tester", size: 0.1 }] as never, 1)).toHaveLength(2);
    expect(validateFrameJson({ figures: [null], props: [] } as never)).toHaveLength(1);
  });
});

describe("NaN・小数の番号は通さない", () => {
  const at = (a: Record<string, unknown>) => validateProps([{ kind: "tester", size: 0.1, at: { figure: 0, joint: "hand_near", ...a } }] as never, 2);
  it("小物のずれ・人の番号・関節", () => {
    expect(at({})).toEqual([]);
    expect(at({ dx: Number.NaN })).toHaveLength(1);
    expect(at({ dy: Number.POSITIVE_INFINITY })).toHaveLength(1);
    expect(at({ figure: 0.5 })).toHaveLength(1);
    expect(at({ joint: "tail" })).toHaveLength(1);
  });
  it("視線と手元のアップ", () => {
    const f = { ...fig(0.5), gaze: { angle: Number.NaN, length: 0.5 } };
    expect(validateFrame({ figures: [f] }).join()).toMatch(/gaze/);
    expect(validateFrame({ figures: [{ ...f, gaze: { angle: 0, length: Number.NaN } }] }).join()).toMatch(/gaze/);
    expect(validateFrame({ figures: [fig(0.5)], zoom: { figure: 0, joint: "hand_near", factor: Number.NaN } }).join()).toMatch(/zoom/);
  });
});

describe("「無し」と一緒に書かれた残りの欄は捨てる", () => {
  it("inner2 が none なら inner_marks を、inner が none なら inner2 を捨てる", () => {
    const bubble = { ...prop(), kind: "think_question" as const, joint: "head" as const, dy: -0.4, size: 0.26 };
    const k = { figures: [fig(0.5)], props: [{ ...bubble, inner: "tester" as const, inner2: "none" as const, inner_marks: ["circle", "cross"] as ["circle", "cross"] }] };
    expect(keyToFrame(k).props?.[0]).not.toHaveProperty("inner_marks");
    expect(validateFrameJson(k)).toEqual([]);
    const onlySecond = { figures: [fig(0.5)], props: [{ ...bubble, inner: "none" as const, inner2: "tester" as const }] };
    expect(keyToFrame(onlySecond).props?.[0]).not.toHaveProperty("inner2");
    expect(validateFrameJson(onlySecond)).toEqual([]);
  });
  it("チェック表でない小物の rows・checks は捨てる", () => {
    const k = { figures: [fig(0.5)], props: [{ ...prop(), rows: 4, checks: 2, numbered: true }] };
    expect(keyToFrame(k).props?.[0]).not.toHaveProperty("rows");
    expect(validateFrameJson(k)).toEqual([]);
    const c = { figures: [fig(0.5)], props: [{ ...prop(), kind: "checklist" as const, figure: -1, x: 0.5, y: 0.5, size: 0.3, rows: 4, checks: 2 }] };
    expect(keyToFrame(c).props?.[0]).toMatchObject({ rows: 4, checks: 2 });
  });
});

describe("置いてあった自分のキャラクターの値", () => {
  it("一覧に無い髪・顔の部品は既定に戻し、絵が描ける", () => {
    const a = normalizeAvatar({ hair: "mohawk", face: { skin: "blue", eyeShape: "round", glasses: 3 } });
    expect(a.hair).toBe(DEFAULT_AVATAR.hair);
    expect(a.face).toEqual({ ...DEFAULT_FACE, eyeShape: "round" });
    expect(() => characterSvg({ angles: STANDING, x: 100, groundY: 200, height: 150, facing: "right", hair: a.hair, face: a.face } as never)).not.toThrow();
    expect(normalizeAvatar("壊れた")).toEqual(DEFAULT_AVATAR);
  });
});

describe("高い所に立つ人の椅子", () => {
  it("lift のある人の腰に付けた椅子は、床でなくその人の立つ面に脚が付く", () => {
    const chairFeet = (lift: number) => {
      const r = renderFrame({ figures: [{ ...fig(0.5), angles: POSES.sit, ...(lift ? { lift } : {}) }], props: [{ kind: "chair", at: { figure: 0, joint: "hip" }, size: 0.2 }] });
      const chair = r.svg.match(/<g data-part="prop">(.*?)<\/g>/)?.[1] ?? "";
      return Math.max(...[...chair.matchAll(/<path d="M[\d.]+ ([\d.]+)L/g)].map((m) => Number(m[1])));
    };
    const ground = chairFeet(0);
    expect(ground).toBeGreaterThan(0.88 * 768 - 10);
    expect(Math.abs(chairFeet(0.2) - (ground - 0.2 * 768))).toBeLessThan(2);
  });
});

describe("吊り荷の真ん中の点（タップの範囲と絵をそろえる）", () => {
  it("クレーンにつながった吊り荷は先の真下、つながらなければ置き場所の点", () => {
    const crane = { kind: "crane" as const, at: { x: 0.4, y: 0.88 }, size: 0.4 };
    const tip = craneTip([0.4 * 768, 0.88 * 768], 0.4 * 768, 1);
    const [, near] = propCenters([crane, { kind: "suspended_load", at: { x: 0.66, y: 0.6 }, size: 0.14 }], [], 768);
    expect(near[0]).toBeCloseTo(tip[0], 6);
    expect(near[1]).toBeCloseTo(0.6 * 768, 6);
    const [, far] = propCenters([crane, { kind: "suspended_load", at: { x: 0.2, y: 0.5 }, size: 0.1 }], [], 768);
    expect(far).toEqual([0.2 * 768, 0.5 * 768]);
  });
});
