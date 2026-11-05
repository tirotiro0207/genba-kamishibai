// 入口の背景の顔の部品を乱数で選ぶ（11/5 作者）。職業ごとのかぶり物・髪形・目・まつ毛・眉・口・眼鏡・ひげ・顔の形・肌。
// かぶらない人もいる（NO_HAT の割合）。キャラクターはあとで作者が手を入れるので、選べる部品は人形の側の一覧をそのまま使う
import { FACE_OPTIONS, type FaceParts } from "../../shared/picto/avatar";
import {
  type CharacterRole,
  type Hair,
  HEADWEAR,
  type HeadwearKind,
} from "../../shared/picto/character";
import { TRACED_HAIRS } from "../../shared/picto/hair-traced";

const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/** かぶり物をかぶらない人の割合 */
export const NO_HAT = 0.35;
/** 溶接の面（下ろした形）は顔が隠れるので、顔を見せるカードには使わない */
const HATS = (Object.keys(HEADWEAR) as HeadwearKind[]).filter(
  (h) => h !== "welder",
);
const HAIRS: readonly Hair[] = ["bob", ...TRACED_HAIRS];
const ROLES: readonly CharacterRole[] = ["new", "lead", "worker"];

export function avatarParts(): {
  hair: Hair;
  headwear: HeadwearKind | "none";
  role: CharacterRole;
  face: FaceParts;
} {
  const face = Object.fromEntries(
    (Object.keys(FACE_OPTIONS) as (keyof FaceParts)[]).map((k) => [
      k,
      pick(FACE_OPTIONS[k]),
    ]),
  ) as unknown as FaceParts;
  return {
    hair: pick(HAIRS),
    headwear: Math.random() < NO_HAT ? "none" : pick(HATS),
    role: pick(ROLES),
    face,
  };
}
