// 1 コマの絵（015〜）。白い背景・地面の線・人形を重ね、視線・距離・強調・手元のアップを数字で決める。
// 強調は線の太さ・大きさ・明暗・枠だけで出す（色を変えない）。小物と吹き出しは 017・018 で足す。
import { type PropSpec, propsSvg, validateProps } from "./props";
import { type FigureSpec, figureSvg, type Joint, type Posed, posePoints, type Pt } from "./skeleton";

export const SIZE = 768;
export const GROUND = 0.86;

export interface Gaze {
  /** 視線の向き（度）。0 で向いている側へまっすぐ、正で上、負で下 */
  angle: number;
  /** 視線の長さ（背の高さに対する割合。0.1〜1.5） */
  length: number;
}

export type Emphasis = "thick" | "large" | "dark" | "frame";

export interface FrameFigure extends FigureSpec {
  gaze?: Gaze;
  /** この人を目立たせる。thick: 棒を太く / large: 大きく / dark: ほかの人を薄いグレーに / frame: 枠で囲む */
  emphasis?: Emphasis[];
}

export interface Frame {
  figures: FrameFigure[];
  /** 小物（人形のあとに重ねる） */
  props?: PropSpec[];
  /** 手元のアップ: その人のその関節を中心に factor 倍で切り取る */
  zoom?: { figure: number; joint: Joint; factor: number };
}

export interface Rendered {
  svg: string;
  posed: Posed[];
  /** 切り取った範囲（x・y・幅） */
  view: [number, number, number];
}

const LIGHT = "#a8a8a8";
const LIGHT_FAR = "#c4c4c4";
const n = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};

/** 2 人を、間の距離（キャンバスの幅に対する割合）で左右に置く */
export function placePair(distance: number, center = 0.5): [number, number] {
  const d = Math.max(0.1, Math.min(0.8, distance));
  return [center - d / 2, center + d / 2];
}

export function validateFrame(f: Frame): string[] {
  const errs: string[] = [];
  if (!Array.isArray(f.figures) || f.figures.length > 3) errs.push("人物は 0〜3 人");
  f.figures.forEach((fig, i) => {
    if (fig.gaze && (Math.abs(fig.gaze.angle) > 90 || fig.gaze.length < 0.1 || fig.gaze.length > 1.5)) errs.push(`figures[${i}].gaze が範囲の外`);
    for (const e of fig.emphasis ?? []) if (!["thick", "large", "dark", "frame"].includes(e)) errs.push(`figures[${i}].emphasis: ${e}`);
  });
  errs.push(...validateProps(f.props ?? [], f.figures.length));
  if (f.zoom && (f.zoom.figure < 0 || f.zoom.figure >= f.figures.length || f.zoom.factor < 1 || f.zoom.factor > 5)) errs.push("zoom が範囲の外");
  return errs;
}

function gazeSvg(p: Posed, g: Gaze): string {
  const r = (g.angle * Math.PI) / 180;
  const from: Pt = [p.joints.head[0] + p.d * p.h * 0.1, p.joints.head[1]];
  const len = g.length * p.h;
  const to: Pt = [from[0] + p.d * Math.cos(r) * len, from[1] - Math.sin(r) * len];
  const w = Math.max(2, p.h * 0.014);
  return `<g data-part="gaze"><line x1="${n(from[0])}" y1="${n(from[1])}" x2="${n(to[0])}" y2="${n(to[1])}" stroke="#6a6a6a" stroke-width="${n(w)}" stroke-dasharray="${n(w * 3)} ${n(w * 2.5)}" stroke-linecap="round"/></g>`;
}

function frameBox(p: Posed): string {
  const ps = Object.values(p.joints);
  const pad = p.h * 0.12;
  const x0 = Math.min(...ps.map((q) => q[0])) - pad;
  const x1 = Math.max(...ps.map((q) => q[0])) + pad;
  const y0 = Math.min(...ps.map((q) => q[1])) - pad;
  const y1 = Math.max(...ps.map((q) => q[1])) + pad * 0.6;
  const w = Math.max(3, p.h * 0.018);
  return `<g data-part="emphasis-frame"><rect x="${n(x0)}" y="${n(y0)}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" rx="${n(pad * 0.5)}" fill="none" stroke="#000" stroke-width="${n(w)}"/></g>`;
}

export function renderFrame(frame: Frame, size = SIZE): Rendered {
  const errs = validateFrame(frame);
  if (errs.length) throw new Error(`コマの数字が範囲の外: ${errs.join(" / ")}`);
  const g = GROUND * size;
  const figs = frame.figures.map((f) => (f.emphasis?.includes("large") ? { ...f, height: Math.min(0.75, f.height * 1.2) } : f));
  const posed = figs.map((f) => posePoints(f, size, g));
  const darkIdx = frame.figures.findIndex((f) => f.emphasis?.includes("dark"));
  const body = [
    `<g data-part="bg"><rect width="${size}" height="${size}" fill="#fff"/></g>`,
    `<g data-part="ground"><line x1="0" y1="${g}" x2="${size}" y2="${g}" stroke="#000" stroke-width="${Math.round(size * 0.008)}"/></g>`,
  ];
  posed.forEach((p, i) => {
    const f = frame.figures[i];
    const faded = darkIdx >= 0 && darkIdx !== i;
    body.push(figureSvg(p, { color: faded ? LIGHT : undefined, far: faded ? LIGHT_FAR : undefined, width: f.emphasis?.includes("thick") ? 1.35 : 1 }));
    if (f.gaze) body.push(gazeSvg(p, f.gaze));
    if (f.emphasis?.includes("frame")) body.push(frameBox(p));
  });
  if (frame.props?.length) body.push(propsSvg(frame.props, posed, size));
  let view: [number, number, number] = [0, 0, size];
  if (frame.zoom) {
    const c = posed[frame.zoom.figure].joints[frame.zoom.joint];
    const w = size / frame.zoom.factor;
    view = [Math.max(0, Math.min(size - w, c[0] - w / 2)), Math.max(0, Math.min(size - w, c[1] - w / 2)), w];
  }
  const vb = view.map(n);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${vb[0]} ${vb[1]} ${vb[2]} ${vb[2]}">${body.join("")}</svg>`, posed, view };
}
