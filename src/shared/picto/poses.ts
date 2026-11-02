// 主な姿勢（016a〜）。骨格の角度に名前を付けておき、キーフレームや角度の係はこの名前から始める。
import { type Bone, STANDING } from "./skeleton";

export type Angles = Record<Bone, number>;
const pose = (a: Partial<Angles>): Angles => ({ ...STANDING, ...a });

export const POSES = {
  /** 立つ */
  stand: pose({ arm_near_upper: 14, arm_near_lower: 8, arm_far_upper: -12, leg_near_upper: 5, leg_far_upper: -5 }),
  /** 指差す（手前の腕を前へまっすぐ） */
  point: pose({ arm_near_upper: 90, arm_near_lower: 0, arm_far_upper: -10, arm_far_lower: 10, leg_near_upper: 5, leg_far_upper: -5 }),
  /** しゃがむ */
  squat: pose({ torso: 22, neck: -5, leg_near_upper: 100, leg_near_lower: -140, leg_far_upper: 92, leg_far_lower: -135, arm_near_upper: 75, arm_near_lower: 15, arm_far_upper: 65, arm_far_lower: 20 }),
  /** 手を挙げる */
  raise_hand: pose({ arm_near_upper: 150, arm_near_lower: 5, arm_far_upper: -10, arm_far_lower: 10, leg_near_upper: 5, leg_far_upper: -5 }),
} satisfies Record<string, Angles>;

export type PoseName = keyof typeof POSES;
export const POSE_NAMES = Object.keys(POSES) as PoseName[];
