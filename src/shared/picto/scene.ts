// 1 コマの絵（015〜）。枠・左の薄いグレーの壁・床の線・人を重ね、視線・距離・強調・手元のアップを数字で決める。
// 人は最新のキャラクター（character.ts の characterSvg。髪・顔・服・かぶり物・着る物）で描く。姿勢の数（skeleton.ts の角度）はそのまま使う（11/5 作者）。
// 強調は線の太さ・大きさ・明暗・枠だけで出す（色を変えない）。役はかぶり物と服で見分ける（新人は白いヘルメット、上の人は黒い帽子、ほかの作業の人はグレーのヘルメット）。
// 重ねる順: 壁と床 → 壁や床に置く小物 → 人（かぶり物と着る物を含む） → 人に付ける小物 → 吹き出し。
import { type CharacterRole, characterJoints, characterSvg, type CharacterSpec, type HeadwearKind } from "./character";
import type { Outfit } from "./outfit";
import { poseAngles } from "./poses";
import { BUBBLES, type PropKind, type PropSpec, propsSvg, validateProps } from "./props";
import type { FigureSpec, Joint, Posed, Pt } from "./skeleton";
import { validateFigure } from "./skeleton";

export const SIZE = 768;
export const GROUND = 0.88;
/** 天井の線の高さと、壁（盤や道具がある場所）の右の端 */
export const CEILING = 0.06;
export const WALL = 0.36;

export const ROLES = ["new", "lead", "worker"] as const;
export type Role = (typeof ROLES)[number];
/**
 * 役 → かぶり物と服（1 か所の表）。電気工事の業種の下絵（industry-drafts.ts の 01）と同じ服。
 * かぶり物の明るさは役で決まる（新人は白・上の人は黒・ほかの作業の人はグレー。character.ts の ROLE_TONE）
 */
export const ROLE_LOOK: Record<Role | "none", { headwear: HeadwearKind | "none"; outfit: Outfit }> = {
  new: { headwear: "helmet", outfit: { wear: [{ kind: "jacket", tone: "#ddd" }], sleeve: "#ddd", pants: "#bbb" } },
  worker: { headwear: "helmet", outfit: { stripes: 2, armband: true, toolBelt: true, wear: [{ kind: "jacket", tone: "#444" }], sleeve: "#444", pants: "#444" } },
  lead: { headwear: "cap", outfit: { wear: [{ kind: "jacket", tone: "#666" }], sleeve: "#666", pants: "#555" } },
  none: { headwear: "none", outfit: { wear: [{ kind: "jacket", tone: "#ddd" }], sleeve: "#ddd", pants: "#bbb" } },
};

/**
 * 人に着ける小物は、小物の絵を重ねずに、キャラクターの服とかぶり物にする（着る物の部品が全部ある）。
 * 着けたと読むのは、付く関節が合うときだけ（頭の物は head、手の物は hand、足の物は foot、体の物はどこでも）。手に持ったヘルメットなどは小物のまま
 */
type Worn = { at: "head" | "hand" | "foot" | "body"; put: (o: Outfit, w: { headwear?: HeadwearKind; role?: CharacterRole }) => void };
const WORN: Partial<Record<PropKind, Worn>> = {
  helmet: { at: "head", put: (_, w) => { w.headwear = "helmet"; w.role = "worker"; } },
  helmet_new: { at: "head", put: (_, w) => { w.headwear = "helmet"; w.role = "new"; } },
  cap_lead: { at: "head", put: (_, w) => { w.headwear = "cap"; w.role = "lead"; } },
  goggles: { at: "head", put: (o) => { o.eyewear = "goggles"; } },
  dust_mask: { at: "head", put: (o) => { o.respirator = true; } },
  gloves: { at: "hand", put: (o) => { o.gloves = "#999"; } },
  cut_gloves: { at: "hand", put: (o) => { o.glove = "cut"; } },
  insulated_gloves: { at: "hand", put: (o) => { o.glove = "insulated"; } },
  wristband: { at: "hand", put: (o) => { o.wristband = true; } },
  safety_shoes: { at: "foot", put: (o) => { o.shoes = "safety"; } },
  insulated_boots: { at: "foot", put: (o) => { o.bootsHigh = true; } },
  harness: { at: "body", put: (o) => { o.wear = [...(o.wear ?? []), { kind: "fullHarness" }]; } },
  cooling_vest: { at: "body", put: (o) => { o.wear = [...(o.wear ?? []).filter((g) => g.kind !== "jacket"), { kind: "fanJacket" }]; } },
  armband: { at: "body", put: (o) => { o.armband = "cross"; } },
};
const wornOn = (p: PropSpec): number | undefined => {
  const w = WORN[p.kind];
  if (!w || !("figure" in p.at)) return undefined;
  const j = p.at.joint;
  const ok = w.at === "body" || (w.at === "head" ? j === "head" : j.startsWith(w.at));
  return ok ? p.at.figure : undefined;
};

/** 人に着せる小物か（小物の絵は描かず、服とかぶり物になる） */
export const isWorn = (p: PropSpec) => wornOn(p) !== undefined;

/** 1 人ぶんの CharacterSpec（役の表と、着けた小物から）。場面の人は斜め向きで描く */
export function sceneCharacter(f: FrameFigure, worn: PropSpec[], size: number, groundY: number): CharacterSpec {
  const base = ROLE_LOOK[f.role ?? "none"];
  const outfit: Outfit = { ...base.outfit, wear: [...(base.outfit.wear ?? [])] };
  const w: { headwear?: HeadwearKind; role?: CharacterRole } = {};
  for (const p of worn) WORN[p.kind]!.put(outfit, w);
  const view = "quarter";
  const vp = poseAngles(f.angles, view);
  return {
    angles: vp.angles, len: vp.len, shade: vp.shade, view, x: f.x * size, groundY, height: f.height * size, facing: f.facing,
    role: w.role ?? f.role ?? "new", headwear: w.headwear ?? base.headwear, outfit,
  };
}
/** 強調の「太く」: 人の線を 1.3 倍の太さにする */
const thicken = (svg: string) => svg.replace(/stroke-width="([\d.]+)"/g, (_, v) => `stroke-width="${n(Number(v) * 1.3)}"`);

export interface Gaze {
  /** 視線の向き（度）。0 で向いている側へまっすぐ、正で上、負で下 */
  angle: number;
  /** 視線の長さ（背の高さに対する割合。0.1〜1.5） */
  length: number;
}

export type Emphasis = "thick" | "large" | "dark" | "frame";

export interface FrameFigure extends FigureSpec {
  /** 役。new: 新人 / lead: 上の人 / worker: ほかの作業の人。かぶり物が自動で付く */
  role?: Role;
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
    if (fig.role !== undefined && !ROLES.includes(fig.role)) errs.push(`figures[${i}].role: ${fig.role}`);
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
  // 頭の関節は顔のまん中。髪とかぶり物の上まで囲む
  const y0 = Math.min(...ps.map((q) => q[1]), p.joints.head[1] - p.h * 0.16) - pad;
  const y1 = Math.max(...ps.map((q) => q[1])) + pad * 0.6;
  const w = Math.max(3, p.h * 0.018);
  return `<g data-part="emphasis-frame"><rect x="${n(x0)}" y="${n(y0)}" width="${n(x1 - x0)}" height="${n(y1 - y0)}" rx="${n(pad * 0.5)}" fill="none" stroke="#000" stroke-width="${n(w)}"/></g>`;
}

/** 背景: 白い地・左の壁・天井と床の線・全体の枠 */
function backdrop(size: number, g: number): string {
  const lw = Math.round(size * 0.007);
  const top = CEILING * size;
  const wx = WALL * size;
  return `<g data-part="bg"><rect width="${size}" height="${size}" fill="#fff"/></g>` +
    `<g data-part="wall"><rect x="0" y="${n(top)}" width="${n(wx)}" height="${n(g - top)}" fill="#ececec"/>` +
    `<line x1="${n(wx)}" y1="${n(top)}" x2="${n(wx)}" y2="${n(g)}" stroke="#000" stroke-width="${lw}"/>` +
    `<line x1="0" y1="${n(top)}" x2="${size}" y2="${n(top)}" stroke="#000" stroke-width="${lw}"/></g>` +
    `<g data-part="ground"><line x1="0" y1="${n(g)}" x2="${size}" y2="${n(g)}" stroke="#000" stroke-width="${lw}"/>` +
    `<line x1="0" y1="${n(g + size * 0.045)}" x2="${size}" y2="${n(g + size * 0.045)}" stroke="#000" stroke-width="${n(lw * 0.8)}"/></g>`;
}

export function renderFrame(frame: Frame, size = SIZE): Rendered {
  const errs = validateFrame(frame);
  if (errs.length) throw new Error(`コマの数字が範囲の外: ${errs.join(" / ")}`);
  const g = GROUND * size;
  const figs = frame.figures.map((f) => (f.emphasis?.includes("large") ? { ...f, height: Math.min(0.75, f.height * 1.2) } : f));
  // 姿勢の数の範囲は、今までの人形と同じ決まりで確かめる（posePoints と同じ言い方で断る）
  for (const f of figs) {
    const e = validateFigure(f);
    if (e.length) throw new Error(`人形の数字が範囲の外: ${e.slice(0, 3).join(" / ")}`);
  }
  const props = frame.props ?? [];
  const worn = props.map(wornOn);
  const chars = figs.map((f, i) => sceneCharacter(f, props.filter((_, k) => worn[k] === i), size, g));
  const posed: Posed[] = chars.map((c) => ({ joints: characterJoints(c), h: c.height, d: c.facing === "right" ? 1 : -1 }));
  const darkIdx = frame.figures.findIndex((f) => f.emphasis?.includes("dark"));
  const onCanvas = props.filter((p) => !("figure" in p.at) && !BUBBLES.has(p.kind));
  const onFigure = props.filter((p, k) => "figure" in p.at && !BUBBLES.has(p.kind) && worn[k] === undefined);
  const bubbles = props.filter((p) => BUBBLES.has(p.kind));
  const body = [backdrop(size, g)];
  if (onCanvas.length) body.push(propsSvg(onCanvas, posed, size));
  posed.forEach((p, i) => {
    const f = frame.figures[i];
    const faded = darkIdx >= 0 && darkIdx !== i;
    // ほかの人を目立たせるときは、この人を薄く描く
    const svg = characterSvg(chars[i]);
    const one = f.emphasis?.includes("thick") ? thicken(svg) : svg;
    body.push(faded ? `<g opacity="0.35">${one}</g>` : one);
    if (f.gaze) body.push(gazeSvg(p, f.gaze));
    if (f.emphasis?.includes("frame")) body.push(frameBox(p));
  });
  if (onFigure.length) body.push(propsSvg(onFigure, posed, size));
  if (bubbles.length) body.push(propsSvg(bubbles, posed, size));
  let view: [number, number, number] = [0, 0, size];
  if (frame.zoom) {
    const c = posed[frame.zoom.figure].joints[frame.zoom.joint];
    const w = size / frame.zoom.factor;
    view = [Math.max(0, Math.min(size - w, c[0] - w / 2)), Math.max(0, Math.min(size - w, c[1] - w / 2)), w];
  }
  const vb = view.map(n);
  // 全体の枠（切り取ったときも、見える範囲の縁に描く）
  const bw = Math.max(2, view[2] * 0.012);
  body.push(`<g data-part="border"><rect x="${n(view[0] + bw / 2)}" y="${n(view[1] + bw / 2)}" width="${n(view[2] - bw)}" height="${n(view[2] - bw)}" fill="none" stroke="#000" stroke-width="${n(bw)}"/></g>`);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${vb[0]} ${vb[1]} ${vb[2]} ${vb[2]}">${body.join("")}</svg>`, posed, view };
}
