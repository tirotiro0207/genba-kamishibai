import { describe, expect, it } from "vitest";
import { POSE_NAMES, POSES } from "../src/shared/picto/poses";
import { renderFrame } from "../src/shared/picto/scene";
import { posePoints, validateFigure } from "../src/shared/picto/skeleton";
import { checkStyle } from "../src/shared/picto/style";

const at = (name: keyof typeof POSES) => posePoints({ x: 0.5, height: 0.62, facing: "right", angles: POSES[name] }, 768, 660).joints;

describe("主な姿勢 4 つ（016a）", () => {
  it("4 つとも範囲の中で、絵柄のテストが通る", () => {
    expect(POSE_NAMES).toEqual(["stand", "point", "squat", "raise_hand"]);
    for (const name of POSE_NAMES) {
      for (const facing of ["right", "left"] as const) {
        const f = { x: 0.5, height: 0.62, facing, angles: POSES[name] };
        expect(validateFigure(f), name).toEqual([]);
        expect(checkStyle(renderFrame({ figures: [f] }).svg), name).toEqual([]);
      }
    }
  });

  it("姿勢ごとの形の特徴が出ている", () => {
    const point = at("point");
    expect(Math.abs(point.hand_near[1] - point.shoulder[1])).toBeLessThan(15); // 指差す手は肩の高さ
    expect(point.hand_near[0] - point.shoulder[0]).toBeGreaterThan(100); // 前へ伸びる
    const raise = at("raise_hand");
    expect(raise.hand_near[1]).toBeLessThan(raise.head[1]); // 手は頭より上
    const squat = at("squat");
    const stand = at("stand");
    expect(squat.head[1] - stand.head[1]).toBeGreaterThan(120); // しゃがむと頭が低い
  });
});
