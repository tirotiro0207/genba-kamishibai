// 動画だけで使う特別なキャラクター「案内人」の部品の組み合わせ。キャラクターを作る画面の選択肢には出さない。
// 絵を 1 枚描き直さず、ほかのキャラと同じ部品（CharacterSpec）で組む。関節・姿勢・正面／斜め／横の向きがそのまま使えるため。
// 髪（guideMash）・目（white）・ひげ（stubble）・短い杖（outfit.wand）は、この案内人のために足した選択肢。どれも既定値は変えていない
import type { CharacterSpec, View } from "./character";
import type { Angles } from "./poses";

/** スーツの上着・袖・ズボンの濃いグレー */
export const GUIDE_TONE = "#4a4a4a";

/** 案内人の見た目（姿勢・位置・大きさ・向きは、使う側が足す） */
export const GUIDE: Pick<CharacterSpec, "look" | "hair" | "headwear" | "face" | "outfit"> = {
  look: "b",
  hair: "guideMash",
  headwear: "none",
  face: { face: "square", eyeShape: "white", lashes: "three", beard: "stubble" },
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
/** 手を振る（杖を持たない方の腕を挙げる） */
export const GUIDE_WAVE: Record<View, Partial<Angles>> = {
  front: { arm_near_upper: 135, arm_near_lower: 40 },
  quarter: { arm_far_upper: 135, arm_far_lower: 40 },
  side: { arm_far_upper: 135, arm_far_lower: 40 },
};
/** 案内人の CharacterSpec の見た目と、その向きの杖の持ち方 */
export const guideLook = (view: View): Pick<CharacterSpec, "look" | "hair" | "headwear" | "face" | "outfit"> => ({
  ...GUIDE, outfit: { ...GUIDE.outfit, wand: GUIDE_HOLD[view].wand },
});
