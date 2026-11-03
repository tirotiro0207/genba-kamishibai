// キャラクターを作る画面で選ぶ顔の部品（製品仕様 §14）。輪郭・目・まつげ・眉・口・眼鏡・ひげ・肌の明るさ。
// 顔の輪郭は 3 つの向きで同じ形のままにして、向きの違いは目・鼻・口の位置だけで出す（輪郭を向きごとに変えると、輪郭の種類 × 向きで崩れる）。
// 顔に付く部品の横の位置は、全部 landmarks()（向きごとの目印）から取る。マスクを x 0 に決め打ちして、斜めで顔のまん中からずれた失敗をくり返さないため。
// 目印の数は、初めの顔（standard、半幅 45）の値を 45 で割った係数に顔の半幅を掛けたもの。standard では今までの絵と 1 文字も変わらない。
import type { View } from "./character";

export type FaceShape = "standard" | "round" | "slim" | "square";
export type EyeShape = "oval" | "round" | "slit" | "up" | "down";
export type EyeSize = "s" | "m" | "l";
export type Lashes = "none" | "flick" | "three";
export type Brows = "none" | "flat" | "arch" | "angled";
export type Mouth = "smile" | "flat" | "open" | "small";
export type Glasses = "none" | "round" | "square";
export type Skin = "white" | "light";
export type Beard = "none" | "mustache";

/** 顔の部品の選び方。髪は CharacterSpec.hair（または avatar.hair）で選ぶ */
export interface FaceParts {
  face: FaceShape;
  eyeShape: EyeShape;
  eyeSize: EyeSize;
  lashes: Lashes;
  brows: Brows;
  mouth: Mouth;
  glasses: Glasses;
  skin: Skin;
  beard: Beard;
}
export const DEFAULT_FACE: FaceParts = {
  face: "standard", eyeShape: "oval", eyeSize: "m", lashes: "none", brows: "none", mouth: "smile", glasses: "none", skin: "white", beard: "none",
};
export const FACE_OPTIONS = {
  face: ["standard", "round", "slim", "square"],
  eyeShape: ["oval", "round", "slit", "up", "down"],
  eyeSize: ["s", "m", "l"],
  lashes: ["none", "flick", "three"],
  brows: ["none", "flat", "arch", "angled"],
  mouth: ["smile", "flat", "open", "small"],
  glasses: ["none", "round", "square"],
  skin: ["white", "light"],
  beard: ["none", "mustache"],
} as const satisfies { [K in keyof FaceParts]: readonly FaceParts[K][] };

const n = (v: number) => String(Math.round(v * 10) / 10);
export const SKIN_TONE: Record<Skin, string> = { white: "#fff", light: "#e6e6e6" };

/** 輪郭の 3 つの数: 半幅 w（ほお）・上の平らの半幅 t・あごの平らの半幅 c。高さ 70 は変えない（首・かぶり物・マスクの高さを動かさない） */
const FACE_DIM: Record<FaceShape, [number, number, number]> = {
  standard: [45, 18, 12],
  // 違いが小さな絵でも分かるよう、角の丸み（上下のまっすぐな辺の長さ）を大きく変える
  round: [46, 6, 6],
  slim: [41, 14, 4],
  square: [45, 30, 28],
};
export const faceHalfWidth = (face: FaceShape) => FACE_DIM[face][0];
/** 髪の横の倍率（顔の幅に合わせて髪を横だけ伸び縮みさせる。髪の形は半幅 45 の顔で 1 回だけ描く） */
export const hairScale = (face: FaceShape) => (faceHalfWidth(face) + 4) / 49;
export const faceOutline = (face: FaceShape) => {
  const [w, t, c] = FACE_DIM[face];
  return `M${n(-t)} -70H${n(t)}Q${n(w - 1)} -70 ${n(w - 0.4)} -48L${n(w + 0.4)} -30Q${n(w)} 0 ${n(c)} 0H${n(-c)}Q${n(-w + 0.4)} 0.4 ${n(-w)} -30L${n(-w + 0.6)} -48Q${n(-w + 1)} -70 ${n(-t)} -70Z`;
};

/** 向きごとの目印（standard の値。k ＝ 半幅 / 45 を掛けて使う） */
const MARK: Record<View, {
  eyes: number[]; out: number[]; nose: [number, number, number]; mouth: [number, number, number];
}> = {
  // eyes: 目の中心の x。out: その目の目尻の向き（−1 は画面の左）。nose: x・y・半径。mouth: 中心・半幅・笑いの線の下がり（制御点の y）
  front: { eyes: [-14, 14], out: [-1, 1], nose: [0, -25, 2], mouth: [0, 7, -10.5] },
  quarter: { eyes: [8, 30], out: [-1, 1], nose: [21, -25, 2], mouth: [20, 6.5, -10.5] },
  side: { eyes: [27], out: [1], nose: [37, -27, 2.2], mouth: [32.5, 4, -11.5] },
};
/** 耳の目印（マスクの紐の先）。正面は左右の耳の付け根の少し外、斜めは見える耳（後ろ寄り）と奥の顔の縁、真横は見える耳 */
export const EAR_MARK: Record<View, number[]> = { front: [-47, 47], quarter: [-35, 44], side: [-5] };
/** 耳の上と下の端（目の高さ −42 から鼻の下 −22 まで） */
export const EAR_TOP = -42, EAR_BOTTOM = -22;

export interface Landmarks {
  w: number;
  k: number;
  eyes: { x: number; out: number; far: boolean }[];
  nose: [number, number, number];
  mouth: { cx: number; hw: number; ctrl: number };
  ears: number[];
}
export const landmarks = (face: FaceShape, view: View): Landmarks => {
  const w = faceHalfWidth(face), k = w / 45, m = MARK[view];
  return {
    w, k,
    eyes: m.eyes.map((x, i) => ({ x: x * k, out: m.out[i], far: view === "quarter" && i === 0 })),
    nose: [m.nose[0] * k, m.nose[1], m.nose[2]],
    mouth: { cx: m.mouth[0] * k, hw: m.mouth[1] * k, ctrl: m.mouth[2] },
    ears: EAR_MARK[view].map((x) => x * k),
  };
};

const EYE_SIZE: Record<EyeSize, [number, number]> = { s: [3.8, 4.8], m: [4.6, 5.8], l: [5.5, 7] };
const EYE_Y = -37;
const line = (d: string, w = 3.5) => `<path d="${d}" stroke="#000" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;

/** 目 1 つ（まつげを含む）。つり目・たれ目は目尻の側を上げ下げする向きに 12° 回す */
const eyeSvg = (e: Landmarks["eyes"][number], p: FaceParts, view: View) => {
  const [rx, ry] = EYE_SIZE[p.eyeSize];
  const cx = n(e.x);
  let body: string;
  if (p.eyeShape === "round") body = `<circle cx="${cx}" cy="${EYE_Y}" r="${n(ry * 0.9)}"/>`;
  else if (p.eyeShape === "slit") {
    // 糸目は線 1 本。真横は鼻の点と見分けがつくよう、1.3 倍に長くして少し前上がりにする
    const half = ((2 * rx + 2) / 2) * (view === "side" ? 1.3 : 1);
    body = line(`M${n(e.x - half)} ${EYE_Y}H${n(e.x + half)}`);
    if (view === "side") body = `<g transform="rotate(-8 ${cx} ${EYE_Y})">${body}</g>`;
  } else body = `<ellipse cx="${cx}" cy="${EYE_Y}" rx="${rx}" ry="${ry}"/>`;
  const lashes = lashSvg(e, rx, ry, p.lashes);
  // 目尻は out の側。SVG の回転は時計回りが正で、正の回転は画面の左の端を持ち上げる。つり目は目尻を上げる
  const tilt = p.eyeShape === "up" ? -e.out * 12 : p.eyeShape === "down" ? e.out * 12 : 0;
  return tilt ? `<g transform="rotate(${tilt} ${cx} ${EYE_Y})">${body}${lashes}</g>` : body + lashes;
};
/** まつげ。目尻の上の縁から外上へ。斜めの奥の目は回り込んで見えにくいので、短く・本数を減らす */
const lashSvg = (e: Landmarks["eyes"][number], rx: number, ry: number, kind: Lashes) => {
  if (kind === "none") return "";
  const angles = kind === "flick" ? [35] : e.far ? [45, 70] : [20, 45, 70];
  const len = ry * (kind === "flick" ? 1.3 : 0.9) * (e.far ? 0.6 : 1);
  const bx = e.x + e.out * rx * Math.cos(Math.PI / 6), by = EYE_Y - ry * Math.sin(Math.PI / 6);
  return angles.map((a) => {
    const r = (a * Math.PI) / 180;
    return line(`M${n(bx)} ${n(by)}L${n(bx + e.out * len * Math.cos(r))} ${n(by - len * Math.sin(r))}`, kind === "flick" ? 3 : 2.5);
  }).join("");
};
/** 眉（y −48）。斜めは両方を少し短く（顔が回り込む）、真横は 1 本で前へ長く。上の端は前髪の下の縁（−53 前後）より下に収める */
const browSvg = (lm: Landmarks, kind: Brows, view: View) => {
  if (kind === "none") return "";
  const h0 = 7 * lm.k;
  return lm.eyes.map((e) => {
    // つり眉は線が太いので、斜めではもう少し詰めて手前の目尻側を横の房から離す
    const h = h0 * (view === "quarter" ? (kind === "angled" ? 0.7 : 0.8) : 1);
    const [a, b] = view === "side" ? [e.x - 4 * lm.k, e.x + 8 * lm.k] : [e.x - h, e.x + h];
    const inner = e.out > 0 ? a : b, outer = e.out > 0 ? b : a;
    if (kind === "flat") return line(`M${n(a)} -48H${n(b)}`);
    if (kind === "arch") return line(`M${n(a)} -46Q${n((a + b) / 2)} -50 ${n(b)} -46`);
    return line(`M${n(inner)} -46L${n(outer)} -48.5`, 4);
  }).join("");
};
const mouthSvg = (lm: Landmarks, kind: Mouth) => {
  const { cx, hw, ctrl } = lm.mouth;
  if (kind === "smile") return line(`M${n(cx - hw)} -16Q${n(cx)} ${ctrl} ${n(cx + hw)} -16`);
  if (kind === "flat") return line(`M${n(cx - hw)} -13H${n(cx + hw)}`);
  if (kind === "open") return `<path d="M${n(cx - hw)} -16A${n(hw)} ${n(hw * 0.8)} 0 0 0 ${n(cx + hw)} -16Z" fill="#000" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>`;
  return `<circle cx="${n(cx)}" cy="-13" r="2.8" fill="#fff" stroke="#000" stroke-width="3"/>`;
};
const beardSvg = (lm: Landmarks, kind: Beard) =>
  kind === "none" ? "" : line(`M${n(lm.mouth.cx - lm.mouth.hw - 2 * lm.k)} -19Q${n(lm.mouth.cx)} -21 ${n(lm.mouth.cx + lm.mouth.hw + 2 * lm.k)} -19`, 3.5);

/**
 * 耳（髪の前の層の上・かぶり物の下に描く。マスクの紐と眼鏡の蔓は耳の下へ入る）。
 * 正面は顔の縁から外へ出た半分だけを描く。斜めは奥へ回った見える耳 1 つ、真横は頭の真ん中の耳 1 つで、穴の向きは顔の向く側
 */
export const earsSvg = (view: View, p: FaceParts) => {
  const { w, k } = landmarks(p.face, view);
  const skin = SKIN_TONE[p.skin];
  const ink = (d: string) => `<path d="${d}" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>`;
  if (view === "front") return [-1, 1].map((s) => {
    const x = (d: number) => n(s * (w + d));
    return `<path d="M${x(-1)} ${EAR_TOP}Q${x(11)} ${EAR_TOP - 4} ${x(10)} -32Q${x(10)} ${EAR_BOTTOM + 2} ${x(-1)} ${EAR_BOTTOM}Z" fill="${skin}" stroke="#000" stroke-width="4" stroke-linejoin="round"/>` +
      ink(`M${x(3)} -38Q${x(7)} -34 ${x(3.5)} -27`);
  }).join("");
  const cx = EAR_MARK[view][0] * k, rx = view === "side" ? 6.5 : 6;
  return `<ellipse cx="${n(cx)}" cy="-32" rx="${rx}" ry="10" fill="${skin}" stroke="#000" stroke-width="4"/>` +
    ink(`M${n(cx + 2.5)} -37Q${n(cx - 2.5)} -37 ${n(cx - 2)} -31Q${n(cx - 1.5)} -27 ${n(cx + 2)} -26`);
};

/** 顔（輪郭・目・まつげ・眉・鼻・口・ひげ）。初めの値は今までの FACE_B と同じ文字列になる */
export const faceSvg = (view: View, p: FaceParts) => {
  const lm = landmarks(p.face, view);
  const [nx, ny, nr] = lm.nose;
  return `<path d="${faceOutline(p.face)}" fill="${SKIN_TONE[p.skin]}" stroke="#000" stroke-width="5" stroke-linejoin="round"/>` +
    lm.eyes.map((e) => eyeSvg(e, p, view)).join("") + browSvg(lm, p.brows, view) +
    `<circle cx="${n(nx)}" cy="${ny}" r="${nr}"/>` + mouthSvg(lm, p.mouth) + beardSvg(lm, p.beard);
};

/** 眼鏡（マスクより上、髪の前の層より下に描く）。斜めの奥のレンズは細く、蔓は見える耳へ 1 本 */
export const glassesSvg = (view: View, p: FaceParts) => {
  if (p.glasses === "none") return "";
  const lm = landmarks(p.face, view);
  const r = EYE_SIZE[p.eyeSize][1] + 3.5;
  const lens = (x: number, sx: number) => p.glasses === "round"
    ? `<ellipse cx="${n(x)}" cy="${EYE_Y}" rx="${n(r * sx)}" ry="${n(r)}" fill="none" stroke="#000" stroke-width="3"/>`
    : `<rect x="${n(x - r * sx)}" y="${n(EYE_Y - r)}" width="${n(2 * r * sx)}" height="${n(2 * r)}" rx="2" fill="none" stroke="#000" stroke-width="3"/>`;
  const sx = lm.eyes.map((e) => (e.far ? 0.8 : 1));
  const lenses = lm.eyes.map((e, i) => lens(e.x, sx[i])).join("");
  if (view === "front") return lenses + line(`M${n(lm.eyes[0].x + r)} ${EYE_Y}H${n(lm.eyes[1].x - r)}`, 3);
  if (view === "quarter") {
    const [f, near] = lm.eyes;
    return lenses + line(`M${n(f.x + r * sx[0])} ${EYE_Y}H${n(near.x - r)}`, 3) + line(`M${n(f.x - r * sx[0])} ${EYE_Y}L${n(-(lm.w - 1))} -40`, 3);
  }
  return lenses + line(`M${n(lm.eyes[0].x - r)} ${EYE_Y}L${n(-8 * lm.k)} -40`, 3);
};
