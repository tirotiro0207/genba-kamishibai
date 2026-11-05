// 人の体の寸法と、関節の置き場所（character.ts の絵と、poses.ts の棒人間が同じ数を使う）。
// 絵の部品を読み込まずに姿勢の計算だけをしたい所（poses.ts）のために、数だけをここに分けて置く。

/** 正面は立って向き合う場面のため。斜めは 3/4、真横は横顔 */
export type View = "front" | "quarter" | "side";

/** 長さ（単位は背の高さ 434 の中の値） */
export const L = { torso: 142, shoulderDrop: 22, upperArm: 70, lowerArm: 52, thigh: 85, shin: 77, sole: 25, headUp: 2 };

/**
 * 部位の置き場所（[奥, 手前]）。右を向くと体の右側がこちらを向くので、斜めでは手前の腕と足が画面の左（向きと逆の側）に来る。
 * 真横は前後に重ねる。正面は左右に開く
 */
export const SPOT: Record<View, { arm: [number, number]; leg: [number, number] }> = {
  front: { arm: [-56, 56], leg: [-20, 20] },
  quarter: { arm: [42, -42], leg: [18, -18] },
  side: { arm: [-6, 4], leg: [-8, 6] },
};

/** b は頭を少し持ち上げて、あごと胴の間に短い首を見せる（a は首なし） */
export const NECK_LEN = { a: 0, b: 14 } as const;

/**
 * 首の横の位置。斜めは胸が向く側へ寄せる（11/3 作者の確認で 6）。真横も首は胴のまん中より少し前（x 6）に立つ
 */
export const NECK_X: Record<View, number> = { front: 0, quarter: 6, side: 6 };
