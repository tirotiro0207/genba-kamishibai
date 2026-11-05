// 入口の背景の顔の組み合わせ（11/5 作者）。全業種の役（かぶり物・服・役の印）× 髪形の掛け合わせを全部出す。
// 掛け合わせはまぜた順に 1 つずつ配り、全部配り終えたらまぜ直す（出ない組み合わせが無い）。目・まつ毛・眉・口・眼鏡・ひげ・顔の形・肌は乱数。
// 相性の悪い組み合わせは外す（BAD）。人形の側（character.ts）を直すまでの守り
import { FACE_OPTIONS, type FaceParts } from "../../shared/picto/avatar";
import type { CharacterRole, Hair, HeadwearKind } from "../../shared/picto/character";
import { TRACED_HAIRS } from "../../shared/picto/hair-traced";
import { INDUSTRY_DRAFTS } from "../../shared/picto/industry-drafts";
import type { Outfit } from "../../shared/picto/outfit";

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

export const HAIRS: readonly Hair[] = ["bob", ...TRACED_HAIRS];

export interface Combo {
  industry: string;
  name: string;
  role: CharacterRole;
  headwear: HeadwearKind | "none";
  outfit: Outfit;
  hair: Hair;
}

/**
 * 相性の悪いかぶり物と髪形（11/5、作者が背景で見つけた 2 枚から、かぶり物 16 × 髪 19 の一覧を作って確かめた）。
 * - 看護の帽子（nurse）は髪の上に乗せる形なので、短い髪・坊主だと宙に浮く（buzz・twoBlock・skinhead・softMohawk）
 * - ツインテールは、かぶり物の下で左右に出た房が耳当てのように見える（かぶらないときだけ使う）
 * - 溶接の面を下ろした形（welder）は顔が隠れる
 */
export function isBad(headwear: HeadwearKind | "none", hair: Hair): boolean {
  if (headwear === "welder") return true;
  if (headwear === "nurse" && ["buzz", "twoBlock", "skinhead", "softMohawk"].includes(hair)) return true;
  if (headwear !== "none" && hair === "twinTails") return true;
  return false;
}

/** 全業種の役 × 髪形のうち、相性の悪いものを除いた全部 */
export const ALL_COMBOS: readonly Combo[] = INDUSTRY_DRAFTS.flatMap((d) =>
  d.roles.flatMap((r) => HAIRS.filter((hair) => !isBad(r.headwear, hair)).map((hair) => ({ industry: d.name, name: r.name, role: r.role, headwear: r.headwear, outfit: r.outfit, hair }))),
);

let deck: number[] = [];
/** 次に配る掛け合わせ。まぜた順に配り、尽きたらまぜ直す */
export function nextCombo(): Combo {
  if (!deck.length) {
    deck = ALL_COMBOS.map((_, i) => i);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  return ALL_COMBOS[deck.pop()!];
}

export function randomFace(): FaceParts {
  return Object.fromEntries((Object.keys(FACE_OPTIONS) as (keyof FaceParts)[]).map((k) => [k, pick(FACE_OPTIONS[k])])) as unknown as FaceParts;
}
