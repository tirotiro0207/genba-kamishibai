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
