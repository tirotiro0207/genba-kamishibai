// アセット（小物・服・表情）の一覧と、見本の絵・Claude に見せる元の絵（11/7）。大元の決まりは asset-rules.ts。
// 一覧の並びは 小物 → 服 → 表情。API（worker/assets.ts）と画面（client/assets）が同じ一覧を使う
import { PROP_JA } from "../make/script";
import { type AssetGroup, faceKind, groupOfKind, parseFace, parseWear, stringifyFace, TONE, VIEWS, wearFrame, wearKind } from "./asset-rules";
import { DEFAULT_FACE, EXPRESSIONS, type Expression, expressionRig, faceSvg } from "./avatar";
import { characterSvg, type View } from "./character";
import { type Garment, GARMENTS, garmentBase, garmentTone } from "./outfit";
import { A_POSE } from "./poses";
import { ASSET_KINDS, propBaseSquareSvg, propPreviewSvg, withOverride } from "./prop-preview";

export const WEAR_JA: Record<Garment, string> = {
  jacket: "作業着の上着", polo: "ポロシャツ", chefJacket: "コックコート", coat: "白衣・上っ張り", suit: "上着（かんたんな背広）",
  waiterVest: "給仕のベスト", hivis: "反射のベスト", harness: "安全帯", apronLong: "長い前掛け", apronShort: "短い前掛け",
  apronBib: "胸当てのエプロン", uniform: "制服の上着", coverall: "つなぎ", tunic: "襟の無い上衣", lifeJacket: "救命胴衣",
  checked: "チェックのシャツ", fanJacket: "空調服", fullHarness: "フルハーネス", businessSuit: "背広", suitVest: "三つ揃い",
  fittedJacket: "腰のくびれた上着", skirt: "スカート",
};
export const FACE_JA: Record<Expression, string> = {
  neutral: "ふつうの顔", joy: "喜ぶ", fun: "楽しい", anger: "怒る", sad: "悲しい", surprise: "驚く", worry: "困る", pain: "痛い", serious: "真剣",
};

export interface AssetDef {
  kind: string;
  group: AssetGroup;
  /** 画面の名前（日本語） */
  name: string;
  garment?: Garment;
  expression?: Expression;
}
/** 差し替えられる物の全部。小物 → 服 → 表情 */
export const ASSET_LIST: AssetDef[] = [
  ...ASSET_KINDS.map((kind): AssetDef => ({ kind, group: "prop", name: PROP_JA[kind] })),
  ...GARMENTS.map((g): AssetDef => ({ kind: wearKind(g), group: "wear", name: WEAR_JA[g], garment: g })),
  ...EXPRESSIONS.map((e): AssetDef => ({ kind: faceKind(e), group: "face", name: FACE_JA[e], expression: e })),
];
const BY_KIND = new Map(ASSET_LIST.map((a) => [a.kind, a]));
/** kind から差し替えられる物を引く。知らない名前は undefined */
export const assetDef = (kind: unknown): AssetDef | undefined => (typeof kind === "string" ? BY_KIND.get(kind) : undefined);
export const GROUP_JA: Record<AssetGroup, string> = { prop: "小物", wear: "服", face: "表情" };

const svgOf = (viewBox: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="160" height="160">${body}</svg>`;

/** 服の見本: 既定のキャラクターがその服を着た姿（向き view）。swap が undefined なら今の登録のまま、null なら元の服、文字ならその差し替えで描く */
export function wearPreviewSvg(kind: string, swap?: string | null, view: View = "front"): string {
  const g = assetDef(kind)?.garment;
  if (!g) return svgOf("0 0 1 1", "");
  const draw = () => characterSvg({ angles: A_POSE[view], x: 100, groundY: 290, height: 270, facing: "right", view, role: "new", hair: "bob", headwear: "none", outfit: { wear: [{ kind: g }] } });
  return svgOf("-10 14 220 220", swap === undefined ? draw() : withOverride(kind, swap, draw));
}
/** 表情の見本: 既定の顔のその表情（向き view） */
export function facePreviewSvg(kind: string, swap?: string | null, view: View = "front"): string {
  const e = assetDef(kind)?.expression;
  if (!e) return svgOf("0 0 1 1", "");
  const draw = () => faceSvg(view, DEFAULT_FACE, 0, { expression: e });
  return svgOf("-62 -97 124 124", swap === undefined ? draw() : withOverride(kind, swap, draw));
}
/** 部類に合わせた見本の SVG（小物は向きを使わない） */
export function assetPreviewSvg(kind: string, swap?: string | null, view: View = "front"): string {
  const g = groupOfKind(kind);
  return g === "wear" ? wearPreviewSvg(kind, swap, view) : g === "face" ? facePreviewSvg(kind, swap, view) : propPreviewSvg(kind as never, swap);
}

/** Claude に見せる服の 1 つの向きの SVG（胴の座標。枠と同じ viewBox）。body は <svg> の外枠を除いた中身 */
export const wearFramed = (body: string, view: View) => {
  const f = wearFrame(view);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f.x} ${f.y} ${f.w} ${f.h}">${body}</svg>`;
};
/** 元の服の 3 つの向きの中身。主な塗り（服の明るさ）は TONE に置き換えてある */
export function wearBaseBodies(g: Garment): Record<View, string> {
  const tone = garmentTone(g);
  return Object.fromEntries(VIEWS.map((v) => [v, garmentBase(v, g).split(`fill="${tone}"`).join(`fill="${TONE}"`)])) as Record<View, string>;
}
/** 版に残した JSON の文字を、Claude に見せる 3 つの向きの SVG にする。読めなければ元の服 */
export function wearPromptSvgs(g: Garment, saved?: string): Record<View, string> {
  const w = saved ? parseWear(saved) : null;
  const bodies = w ?? wearBaseBodies(g);
  return Object.fromEntries(VIEWS.map((v) => [v, wearFramed(bodies[v], v)])) as Record<View, string>;
}
/** Claude に見せる今の表情の組み合わせ（JSON）。版があればその版、無ければ今の絵の組み合わせ */
export function faceBaseJson(e: Expression, saved?: string): string {
  return stringifyFace((saved ? parseFace(saved) : null) ?? expressionRig(e));
}
export { propBaseSquareSvg };
