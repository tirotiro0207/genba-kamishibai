// テスト用のカード（019〜）。中身は架空の例で、資料の文ではない
import type { CardBody } from "../../src/shared/card";
import type { MotionJson } from "../../src/shared/picto/motion";
import { POSES } from "../../src/shared/picto/poses";

const fig = (x: number, angles = POSES.stand) => ({ role: "new" as const, x, height: 0.55, facing: "right" as const, angles });
const tester = (dx = 0) => ({ kind: "tester" as const, show: true, figure: 0, joint: "hand_near" as const, dx, dy: 0, x: 0, y: 0, size: 0.12, inner: "none" as const });
const panel = () => ({ kind: "panel" as const, show: true, figure: -1, joint: "hip" as const, dx: 0, dy: 0, x: 0.75, y: 0.6, size: 0.2, inner: "none" as const });

export const MOTION: MotionJson = {
  keyframes: [
    { t: 0, mark: true, figures: [fig(0.2, POSES.walk)], props: [tester(), panel()] },
    { t: 1, mark: false, figures: [fig(0.4, POSES.stand)], props: [tester(), panel()] },
    { t: 2, mark: true, figures: [fig(0.5, POSES.squat)], props: [tester(), panel()] },
    { t: 3, mark: true, figures: [fig(0.5, POSES.hands)], props: [tester(0.05), panel()] },
  ],
};

export function sampleCard(): CardBody {
  return {
    rule: "盤に触る前に、検電器で電気が来ていないか確かめる",
    why: "電気が来ていると感電するから",
    statements: [
      { id: "s1", field: "rule", text: "盤に触る前に、検電器で電気が来ていないか確かめる", sources: [{ kind: "doc", doc: "sample", page: 3, line: 12, line_end: 13 }] },
      { id: "s2", field: "why", text: "電気が来ていると感電するから", sources: [{ kind: "speech", input: "in-1", start: 0, end: 18 }] },
    ],
    motion: { kind: "keyframes", json: structuredClone(MOTION) },
    frames: [{ t: 0 }, { t: 2 }, { t: 3 }],
    parts: [
      { id: "p1", target: { type: "figure", index: 0 }, statement: "s1", reason: "確かめる人（新人）" },
      { id: "p2", target: { type: "prop", index: 0 }, statement: "s1", reason: "検電器を当てる" },
      { id: "p3", target: { type: "prop", index: 1 }, statement: "s1", reason: "触る前の盤" },
    ],
  };
}

/** 脚本の段（11/5）の偽の答え。偽の client は system に「脚本を書く係」があればこれを返す */
export const SCRIPT = {
  trigger: "壁の盤の前に新人が来る",
  frames: [
    { who: "新人（左）", action: "盤の前に立つ", viewer: "盤を触る場面" },
    { who: "新人", action: "検電器を盤に当てる", viewer: "先に検電する" },
    { who: "新人", action: "✓ の印", viewer: "電気が来ていないと確かめた" },
  ],
  merged: "そのまま 3 コマ",
  why_shown: "3 コマ目の ✓",
  avoid: [],
  drawable: true,
  missing: null,
};
/** 脚本の 1 段目（物語）の偽の答え */
export const STORY = {
  setting: "盤のある部屋で新人が作業している",
  beats: [
    { what: "新人が盤の前に来る", viewer: "盤を触る場面" },
    { what: "新人が検電器を当てる", viewer: "先に検電する" },
    { what: "電気が来ていないと分かる", viewer: "確かめた" },
  ],
  why_shown: "最後の場面",
  time: null,
  avoid: [],
};
export const isScriptCall = (system: unknown) => String(system).includes("脚本を書く係");
/** 脚本の係への偽の答え（物語の段なら STORY、コマ割りの段なら SCRIPT） */
export const scriptReply = (system: unknown) => (String(system).includes("物語の段") ? STORY : SCRIPT);
