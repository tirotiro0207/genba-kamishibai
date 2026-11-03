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
  /** 歩く */
  walk: pose({ torso: 6, arm_near_upper: -30, arm_near_lower: 25, arm_far_upper: 35, arm_far_lower: 25, leg_near_upper: 30, leg_near_lower: -10, leg_far_upper: -25, leg_far_lower: -35 }),
  /** 倒れる（後ろへ倒れかかる） */
  fall: pose({ torso: -30, neck: -30, arm_near_upper: 120, arm_near_lower: 20, arm_far_upper: 150, arm_far_lower: 10, leg_near_upper: 45, leg_near_lower: -20, leg_far_upper: 20, leg_far_lower: -5 }),
  /** 申し出る（少し前へ出て、手前の手を前に上げる） */
  report: pose({ torso: 10, neck: -5, arm_near_upper: 115, arm_near_lower: 20, arm_far_upper: 10, arm_far_lower: 30, leg_near_upper: 18, leg_far_upper: -12, leg_far_lower: -10 }),
  /** 手元（手前の手を胸の前へ。手元のアップに使う） */
  hands: pose({ torso: 15, neck: 25, arm_near_upper: 55, arm_near_lower: 60, arm_far_upper: 45, arm_far_lower: 70, leg_near_upper: 5, leg_far_upper: -5 }),
} satisfies Record<string, Angles>;

export type PoseName = keyof typeof POSES;
export const POSE_NAMES = Object.keys(POSES) as PoseName[];

/**
 * キャラクターを作る画面の見本の姿勢（A ポーズ。製品仕様 §14）。腕はまっすぐ下ろして体から少し開き、足も少し開く。
 * 正面は左右で同じ角度に開く（rig が正面の奥の手足の向きを裏返すので、角度は同じ数でよい）。
 * 斜めと真横は向きを裏返さないので、外へ開く向きが奥と手前で逆になる。真横はほぼまっすぐ下ろす。
 * POSES には入れない（カードの姿勢の名前の一覧に混ぜない）
 */
export const A_POSE: Record<"front" | "quarter" | "side", Angles> = {
  front: pose({ arm_near_upper: 16, arm_far_upper: 16, leg_near_upper: 6, leg_far_upper: 6 }),
  quarter: pose({ arm_near_upper: 10, arm_far_upper: -10, leg_near_upper: 4, leg_far_upper: -4 }),
  side: pose({ arm_near_upper: 3, arm_far_upper: -3, leg_near_upper: 2, leg_far_upper: -2 }),
};
