// 動画だけで使う特別なキャラクター「案内人」の部品の組み合わせ。キャラクターを作る画面の選択肢には出さない。
// 絵を 1 枚描き直さず、ほかのキャラと同じ部品（CharacterSpec）で組む。関節・姿勢・正面／斜め／横の向きがそのまま使えるため。
// 髪（guideMash）・目（white）・ひげ（stubble）・短い杖（outfit.wand）は、この案内人のために足した選択肢。どれも既定値は変えていない
import type { CharacterSpec, View } from "./character";
import { poseAngles, vary, type Angles, type ViewPose } from "./poses";

/** スーツの上着・袖・ズボンの濃いグレー */
export const GUIDE_TONE = "#4a4a4a";

/** 案内人の見た目（姿勢・位置・大きさ・向きは、使う側が足す） */
export const GUIDE: Pick<CharacterSpec, "look" | "hair" | "headwear" | "face" | "outfit"> = {
  look: "b",
  hair: "guideMash",
  headwear: "none",
  face: { face: "square", eyeShape: "white", lashes: "threeCenter", beard: "stubble" },
  outfit: { wear: [{ kind: "suit", tone: GUIDE_TONE }], sleeve: GUIDE_TONE, pants: GUIDE_TONE, neck: "tie" },
};

/**
 * 短い杖の持ち方（向きごと。11/5 作者: 長い電球の杖はやめ、身長のおよそ 5 分の 1 の短い杖にした）。
 * 正面は奥の手で体の外へ向ける（見本と同じ）。斜め・真横で奥の手に持つと、奥の手が胴のまん中あたりに来て杖が胴に重なるので、
 * 手前の手に持ち替え、手前の二の腕を 25° 前へ出して、杖の先を顔の向く側（スライドを指せる向き）へ向ける。25° は 7 対 3 の決まりの ±30° の内
 */
export const GUIDE_HOLD: Record<View, { wand: { arm: "near" | "far"; toward: 1 | -1 }; arm: Partial<Angles> }> = {
  front: { wand: { arm: "far", toward: -1 }, arm: {} },
  quarter: { wand: { arm: "near", toward: 1 }, arm: { arm_near_upper: 25 } },
  side: { wand: { arm: "near", toward: 1 }, arm: { arm_near_upper: 25 } },
};
/**
 * 手を振る（杖を持たない方の腕を挙げる）。腕を体の外へ上げ、頭から離れた所で手を振る（見本 r9 の形）。
 * 11/6 作者: 前の 135°・40° は、正面で手が頭の横に来て、頭をかいている・照れている仕草に読まれた。動画では「ようこそ」と迎えるあいさつに見せたい。
 * 数は向きに写したあとの角度（正面へ写すと腕が頭の上へ寄るので、写したあとで直に決める）。真横は手が顔の前に重ならないよう、少し前へ下げる
 */
export const GUIDE_WAVE: Record<View, Partial<Angles>> = {
  front: { arm_near_upper: 115, arm_near_lower: 45 },
  quarter: { arm_far_upper: 115, arm_far_lower: 45 },
  side: { arm_far_upper: 95, arm_far_lower: 45 },
};
/** 案内人の姿勢（立つ姿に杖の持ち方を足し、wave なら手を振る腕を GUIDE_WAVE に置き換える） */
export function guidePose(view: View, wave = false): ViewPose {
  const p = poseAngles(vary("stand", GUIDE_HOLD[view].arm), view);
  if (!wave) return p;
  const len = { ...p.len };
  for (const k of Object.keys(GUIDE_WAVE[view])) delete len[k as keyof typeof len];
  return { ...p, angles: { ...p.angles, ...GUIDE_WAVE[view] }, len };
}
/**
 * ヘルメットをかぶるとき、ヘルメットを持ち上げる量（顔の座標）。前髪のふぞろいな下のふちが、つばの下からぎりぎり見える高さ。
 * 11/6 作者: 動画の 0:52〜 は案内人もかぶる（安全の話でかぶっていないと決まりを破って見える）。ただ、この案内人らしさは前髪のギザギザなので、下のふちだけ残す
 */
export const GUIDE_HELMET_LIFT = 5;
/** 案内人の CharacterSpec の見た目と、その向きの杖の持ち方。helmet なら白いヘルメット（新人と同じ色）をかぶる */
export const guideLook = (view: View, helmet = false): Pick<CharacterSpec, "look" | "hair" | "headwear" | "face" | "outfit" | "role"> => ({
  ...GUIDE,
  ...(helmet ? { headwear: "helmet" as const, role: "new" as const } : {}),
  outfit: { ...GUIDE.outfit, wand: GUIDE_HOLD[view].wand, ...(helmet ? { hatLift: GUIDE_HELMET_LIFT } : {}) },
});
