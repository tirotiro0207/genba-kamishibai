import { JOINTS, type Pose } from "../../src/shared/pose/schema";

/** 立って右手で前を指す 1 人。ヘルメットをかぶる */
export function standingPose(): Pose {
  return {
    figures: [{ x: 0.5, scale: 1, facing: "right", pointing: true, mouth_open: true, gaze: 0, angles: { ...Object.fromEntries(JOINTS.map((j) => [j, 0])), arm_r_upper: 90 } as Pose["figures"][0]["angles"] }],
    props: [{ kind: "helmet", attach: "head", figure: 0, x: 0, y: 0, size: 0.1 }],
    overlay: { prohibit: false, mark: "none" },
  };
}
