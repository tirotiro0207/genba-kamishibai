// アセット（小物・服・表情）の差し替えの大元の決まり（11/7 作者「服と表情もテナントごとに Claude で直す」）。docs/assets.md に同じことを短く書いてある。
// どの会社がどう変えても絵が成り立つように、差し替えられる所を枠で決める。描く側（outfit.ts・avatar.ts・props.ts）と API（worker/assets.ts）は、
// ここだけを見る。このファイルは何も読み込まない（型だけは除く）ので、どこから読んでも輪にならない。
import type { View } from "./character";

// ---- 1. kind の名前 ----
// 小物は今のまま（first_aid など）。服は wear_ + 服の名前（chefJacket → wear_chef_jacket）、表情は face_ + 表情の名前（anger → face_anger）。どれも [a-z0-9_]+
export type AssetGroup = "prop" | "wear" | "face";
export const KIND_RE = /^[a-z0-9_]+$/;
export const WEAR_PREFIX = "wear_";
export const FACE_PREFIX = "face_";
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
export const wearKind = (garment: string) => `${WEAR_PREFIX}${snake(garment)}`;
export const faceKind = (expression: string) => `${FACE_PREFIX}${expression}`;
/** 頭の文字で部類を分ける。名前の形が違えば null */
export function groupOfKind(kind: string): AssetGroup | null {
  if (!KIND_RE.test(kind)) return null;
  return kind.startsWith(WEAR_PREFIX) ? "wear" : kind.startsWith(FACE_PREFIX) ? "face" : "prop";
}

// ---- 2. 色: 差し替えの SVG の fill / stroke は灰色（R=G=B）に直す ----
/** 服の明るさ（tone）に置き換える色の名前。灰色に直すときもそのまま残す */
export const TONE = "TONE";
const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], white: [255, 255, 255], gray: [128, 128, 128], grey: [128, 128, 128], silver: [192, 192, 192], red: [255, 0, 0],
  green: [0, 128, 0], lime: [0, 255, 0], blue: [0, 0, 255], yellow: [255, 255, 0], orange: [255, 165, 0], purple: [128, 0, 128],
  brown: [165, 42, 42], pink: [255, 192, 203], navy: [0, 0, 128], maroon: [128, 0, 0], olive: [128, 128, 0], teal: [0, 128, 128],
  cyan: [0, 255, 255], aqua: [0, 255, 255], magenta: [255, 0, 255], fuchsia: [255, 0, 255], gold: [255, 215, 0], beige: [245, 245, 220],
  lightgray: [211, 211, 211], lightgrey: [211, 211, 211], darkgray: [169, 169, 169], darkgrey: [169, 169, 169], dimgray: [105, 105, 105],
};
const hex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
/**
 * 1 つの色を、明るさ（0.299 R + 0.587 G + 0.114 B）を保った灰色の #rrggbb に直す。none と TONE はそのまま。
 * 読めない色は中くらいの灰色（#808080）にする
 */
export function grayColor(value: string): string {
  const v = value.trim();
  if (v === "none" || v === TONE) return v;
  let rgb: [number, number, number] | undefined;
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)?.[1];
  if (h) rgb = (h.length === 3 ? [...h].map((c) => parseInt(c + c, 16)) : [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))) as [number, number, number];
  else {
    const f = /^rgb\(\s*([\d.]+)(%?)\s*,\s*([\d.]+)(%?)\s*,\s*([\d.]+)(%?)\s*\)$/i.exec(v);
    if (f) rgb = [1, 3, 5].map((i) => (f[i + 1] ? (Number(f[i]) * 255) / 100 : Number(f[i]))) as [number, number, number];
    else rgb = NAMED[v.toLowerCase()];
  }
  if (!rgb || rgb.some((x) => !Number.isFinite(x))) return "#808080";
  const l = hex2(0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]);
  return `#${l}${l}${l}`;
}
/** SVG の中身の fill / stroke の値を全部灰色に直す（sanitizePropSvg のあとにかける。属性は ` name="value"` の形に揃っている前提） */
export const grayifySvg = (body: string) => body.replace(/(\s)(fill|stroke)="([^"]*)"/g, (_m, sp: string, name: string, val: string) => `${sp}${name}="${grayColor(val)}"`);

// ---- 3. 服: 3 つの向き全部の SVG を、胴の座標のまま、向きごとの枠の中だけに描く ----
export const VIEWS: readonly View[] = ["front", "quarter", "side"];
/** 胴の幅（片側）。正面と斜めは 46、真横は 30（outfit.ts の今の服はこれで描く） */
export const TORSO_HALF: Record<View, number> = { front: 46, quarter: 46, side: 30 };
/**
 * 差し替えの服を見せる枠（胴の座標。原点＝腰）。x は胴の幅より左右に 20 ずつ広く、y は −175〜140。
 * 根拠: 今の 22 の服の塗りを全部描いて端を測ると、x は正面・斜めが −66〜66（空調服の腰のファン）、真横が −50〜39、
 * y は −145（胴の上の端）〜121（長い前掛けの裾）。どれも収まり、胴の上の端から首・肩の上へ 30、裾の下へ 19 の余りがある。
 * 枠の外へはみ出した線は、服の差し替えでは描かない（体・腕・頭へ飛び出して絵を壊さないため）
 */
export const WEAR_Y = [-175, 140] as const;
export const wearFrame = (view: View) => {
  const half = TORSO_HALF[view] + 20;
  return { x: -half, y: WEAR_Y[0], w: half * 2, h: WEAR_Y[1] - WEAR_Y[0] };
};
export type WearShapes = Record<View, string>;
/** 3 つの向きのどれも空でなければ、JSON の文字から服の形を取り出す。1 つでも無ければ null */
export function parseWear(json: string): WearShapes | null {
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    if (!o || typeof o !== "object") return null;
    const out = {} as WearShapes;
    for (const v of VIEWS) {
      const s = o[v];
      if (typeof s !== "string" || !s) return null;
      out[v] = s;
    }
    return out;
  } catch {
    return null;
  }
}
export const stringifyWear = (w: WearShapes) => JSON.stringify({ front: w.front, quarter: w.quarter, side: w.side });
const TONE_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/**
 * 差し替えの服を、胴の座標の枠で切って描く。id を使わずに切れるよう、入れ子の <svg>（overflow="hidden"）で包む。
 * TONE はその服の明るさ（tone）に置き換える
 */
export function wearSvg(body: string, view: View, tone: string): string {
  const f = wearFrame(view);
  const t = TONE_RE.test(tone) ? tone : "#808080";
  return `<svg x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" viewBox="${f.x} ${f.y} ${f.w} ${f.h}" overflow="hidden">${body.replace(/TONE/g, t)}</svg>`;
}

// ---- 4. 表情: SVG ではなく、決まった部品の組み合わせ ----
export const RIG_EYES = ["open", "closedArc", "pinched", "wide"] as const;
export const RIG_MOUTH = ["smile", "openSmile", "shout", "frown", "flat", "smallO", "wave", "clench"] as const;
export type RigEyes = (typeof RIG_EYES)[number];
export type RigMouth = (typeof RIG_MOUTH)[number];
/** own＝顔の部品で選んだ眉、raised＝丸く上げた眉（驚き）、数 2 つ＝鼻の側の端と外の端の y（直線の眉） */
export type RigBrows = "own" | "raised" | { inner: number; outer: number };
export interface ExprRig {
  eyes: RigEyes;
  brows: RigBrows;
  mouth: RigMouth;
  /** 口の横幅の倍率 */
  mouthWidth: number;
}
/** 眉の y の幅（今の 9 つの表情は −52〜−43.5。前髪の下の縁 −53 前後より下に収め、目 −37 の上に離す） */
export const BROW_Y: readonly [number, number] = [-54, -42];
export const MOUTH_WIDTH: readonly [number, number] = [0.6, 1.4];
/**
 * 口の形によっては、横幅を上限いっぱいまで広げると顔の輪郭の外へ出る。どの顔の形・大きさ・向きでも収まるように、形ごとの上限を決める
 * （全部の組み合わせを 0.05 刻みで描いて測った。どなる口 shout は真横の下の角が先に出るので 1.25。ほかは 1.4 まで収まる）
 */
export const MOUTH_WIDTH_MAX: Partial<Record<RigMouth, number>> = { shout: 1.25 };
export const DEFAULT_RIG: ExprRig = { eyes: "open", brows: "own", mouth: "smile", mouthWidth: 1 };
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, range: readonly [number, number], digits: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(clamp(v, range) * 10 ** digits) / 10 ** digits : undefined;
/** 組み合わせを決まった幅に直す。知らない値・数でない値は既定（DEFAULT_RIG）に戻し、数は幅に収める */
export function normalizeRig(x: unknown): ExprRig {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  const eyes = (RIG_EYES as readonly unknown[]).includes(o.eyes) ? (o.eyes as RigEyes) : DEFAULT_RIG.eyes;
  const mouth = (RIG_MOUTH as readonly unknown[]).includes(o.mouth) ? (o.mouth as RigMouth) : DEFAULT_RIG.mouth;
  let brows: RigBrows = DEFAULT_RIG.brows;
  if (o.brows === "own" || o.brows === "raised") brows = o.brows;
  else if (o.brows && typeof o.brows === "object") {
    const b = o.brows as Record<string, unknown>;
    const inner = num(b.inner, BROW_Y, 1), outer = num(b.outer, BROW_Y, 1);
    if (inner !== undefined && outer !== undefined) brows = { inner, outer };
  }
  const width = num(o.mouthWidth, MOUTH_WIDTH, 2) ?? DEFAULT_RIG.mouthWidth;
  return { eyes, brows, mouth, mouthWidth: Math.min(width, MOUTH_WIDTH_MAX[mouth] ?? MOUTH_WIDTH[1]) };
}
/** 保存した JSON の文字から組み合わせを取り出す。JSON の物でなければ null */
export function parseFace(json: string): ExprRig | null {
  try {
    const o = JSON.parse(json) as unknown;
    return o && typeof o === "object" && !Array.isArray(o) ? normalizeRig(o) : null;
  } catch {
    return null;
  }
}
export const stringifyFace = (r: ExprRig) => JSON.stringify(r);
