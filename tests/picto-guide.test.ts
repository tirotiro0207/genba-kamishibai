// 動画だけの特別なキャラ（案内人）の部品。キャラクターを作る画面の選択肢には出さず、ほかのキャラの絵を変えない
import { describe, expect, it } from "vitest";
import { DEFAULT_FACE, FACE_OPTIONS, faceSvg } from "../src/shared/picto/avatar";
import { characterJoints, characterSvg, type View } from "../src/shared/picto/character";
import { SPECIAL_HAIRS, TRACED, TRACED_HAIRS } from "../src/shared/picto/hair-traced";
import { GUIDE_HELMET_LIFT, GUIDE_HOLD, guideLook, guidePose } from "../src/shared/picto/guide";
import { poseAngles, vary } from "../src/shared/picto/poses";

const VIEWS: View[] = ["front", "quarter", "side"];

describe("案内人（動画だけの特別なキャラ）", () => {
  it("髪・目・ひげは選択肢の一覧に入らない", () => {
    expect(TRACED_HAIRS as readonly string[]).not.toContain("guideMash");
    expect(SPECIAL_HAIRS).toEqual(["guideMash"]);
    expect(FACE_OPTIONS.eyeShape as readonly string[]).not.toContain("white");
    expect(FACE_OPTIONS.beard as readonly string[]).not.toContain("stubble");
    expect(FACE_OPTIONS.lashes as readonly string[]).not.toContain("threeCenter");
  });
  it("髪は 3 つの向きとも形がある", () => {
    for (const v of VIEWS) expect(TRACED.guideMash[v].front.length).toBeGreaterThan(100);
  });
  it("初めの顔は、ひげと目を足す前と同じ（切り抜きも白目も入らない）", () => {
    for (const v of VIEWS) {
      const s = faceSvg(v, DEFAULT_FACE);
      expect(s).not.toContain("clipPath");
      expect(s).not.toContain('stroke-width="2.5"/><circle');
    }
  });
  it("3 つの向きで、短い杖・薄いひげ・白目が描かれる", () => {
    for (const v of VIEWS) {
      const p = poseAngles(vary("stand", GUIDE_HOLD[v].arm), v);
      const s = characterSvg({ ...guideLook(v), angles: p.angles, len: p.len, x: 0, groundY: 0, height: 300, facing: "right", view: v });
      expect(s).toContain('id="part_wand"');
      expect(s).toContain(`clip-path="url(#stubble-square-m)"`);
      expect(s).toContain('fill="#ccc"');
      expect(s).toContain('rx="10.6" ry="5.8" fill="#fff"');
    }
  });
  it("杖の持ち方は 7 対 3 の決まりの ±30° の内", () => {
    for (const v of VIEWS) for (const d of Object.values(GUIDE_HOLD[v].arm)) expect(Math.abs(d ?? 0)).toBeLessThanOrEqual(30);
  });
  it("手を振る手は、頭から離れた体の外にある（頭をかく仕草に見せない）", () => {
    for (const v of VIEWS) {
      const p = guidePose(v, true);
      const j = characterJoints({ ...guideLook(v), angles: p.angles, len: p.len, x: 0, groundY: 0, height: 300, facing: "right", view: v });
      const hand = v === "front" ? j.hand_near : j.hand_far;
      expect(hand[0] - j.head[0]).toBeGreaterThanOrEqual(300 * 0.2);
      expect(hand[1]).toBeLessThan(j.shoulder[1]);
    }
  });
  it("案内人のまつげは目の上のまん中に 3 本（three の形は変えない）", () => {
    const s = faceSvg("front", { ...DEFAULT_FACE, ...guideLook("front").face });
    const ys = [...s.matchAll(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g)].filter((m) => Number(m[4]) < Number(m[2]) - 2);
    expect(ys.length).toBe(6);
    for (const m of ys) expect(Math.abs(Number(m[3]) - Number(m[1]))).toBeLessThan(3);
  });
  it("ヘルメットは案内人だけ持ち上げる（ほかのキャラのヘルメットと髪の切り口は前のまま）", () => {
    for (const v of VIEWS) {
      const p = guidePose(v);
      const base = { angles: p.angles, len: p.len, x: 0, groundY: 0, height: 300, facing: "right" as const, view: v };
      const on = characterSvg({ ...guideLook(v, true), ...base });
      expect(on).toContain(`<g transform="translate(0 ${-GUIDE_HELMET_LIFT})">`);
      expect(on).toContain(`hcut-helmet-${v}-l${GUIDE_HELMET_LIFT}`);
      const other = characterSvg({ ...guideLook(v), headwear: "helmet", role: "new", ...base });
      expect(other).not.toContain("translate(0 -5)");
      expect(other).not.toContain(`-l${GUIDE_HELMET_LIFT}`);
    }
  });
});
