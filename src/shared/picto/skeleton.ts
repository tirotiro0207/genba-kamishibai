// 人形の骨格の正式版（015）。安全標識のようなピクトグラムの人: 頭は塗りの丸、胴と手足は角の丸い太い棒でつながる。
// 関節ごとに名前と角度の範囲を持ち、範囲の外は断る。向きは左右を変えられる。奥側の手足は濃いグレーで描く。

export const BONES = ["torso", "neck", "arm_near_upper", "arm_near_lower", "arm_far_upper", "arm_far_lower", "leg_near_upper", "leg_near_lower", "leg_far_upper", "leg_far_lower"] as const;
export type Bone = (typeof BONES)[number];

/**
 * 角度（度）。0 はまっすぐ立った姿。正は向いている側（前）へ回す。
 * torso: 胴の前への傾き / neck: 頭の前への傾き（正でうつむく）
 * *_upper: 真下を 0 として前へ（腕は 180 で真上）/ arm_*_lower: ひじの曲げ（正で前へ曲げる）/ leg_*_lower: ひざの曲げ（負で後ろへ曲げる）
 */
export const BONE_RANGE: Record<Bone, [number, number]> = {
  torso: [-30, 95],
  neck: [-40, 50],
  arm_near_upper: [-60, 200],
  arm_near_lower: [0, 150],
  arm_far_upper: [-60, 200],
  arm_far_lower: [0, 150],
  leg_near_upper: [-45, 120],
  leg_near_lower: [-150, 0],
  leg_far_upper: [-45, 120],
  leg_far_lower: [-150, 0],
};

/** 長さと太さ（人の背の高さに対する割合） */
export const PROPORTION = {
  head: 0.078, // 頭の半径
  neckGap: 0.022, // 頭と胴のすき間（ピクトグラムの人の首）
  torso: 0.27,
  torsoWidth: 0.135,
  upperArm: 0.165,
  lowerArm: 0.155,
  thigh: 0.235,
  shin: 0.235,
  limbWidth: 0.08,
};

export interface FigureSpec {
  /** 腰の横の位置（0〜1） */
  x: number;
  /** 背の高さ（キャンバスの高さに対する割合。0.3〜0.75） */
  height: number;
  facing: "left" | "right";
  angles: Record<Bone, number>;
}

export const STANDING: Record<Bone, number> = Object.fromEntries(BONES.map((b) => [b, 0])) as Record<Bone, number>;

export function validateFigure(f: FigureSpec): string[] {
  const errs: string[] = [];
  const range = (v: unknown, lo: number, hi: number, name: string) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) errs.push(`${name} が範囲の外（${lo}〜${hi}）: ${String(v)}`);
  };
  range(f.x, 0, 1, "x");
  range(f.height, 0.3, 0.75, "height");
  if (f.facing !== "left" && f.facing !== "right") errs.push("facing は left か right");
  for (const b of BONES) range(f.angles?.[b], ...BONE_RANGE[b], `angles.${b}`);
  for (const k of Object.keys(f.angles ?? {})) if (!(BONES as readonly string[]).includes(k)) errs.push(`知らない関節: ${k}`);
  return errs;
}

export type Pt = [number, number];
export type Joint = "hip" | "shoulder" | "neck" | "head" | `${"elbow" | "hand" | "knee" | "foot"}_${"near" | "far"}`;

export interface Posed {
  joints: Record<Joint, Pt>;
  /** 背の高さ（px） */
  h: number;
  /** 向き（右 1・左 -1） */
  d: 1 | -1;
}

/** 関節の位置を出す。いちばん低い足先を地面（groundY）に置く */
export function posePoints(f: FigureSpec, size: number, groundY: number): Posed {
  const errs = validateFigure(f);
  if (errs.length) throw new Error(`人形の数字が範囲の外: ${errs.slice(0, 3).join(" / ")}`);
  const P = PROPORTION;
  const h = f.height * size;
  const d = f.facing === "right" ? 1 : -1;
  const a = f.angles;
  // 真下を 0、前へ正の角度で、長さ len の向き
  const vec = (deg: number, len: number): Pt => {
    const r = (deg * Math.PI) / 180;
    return [d * Math.sin(r) * len * h, Math.cos(r) * len * h];
  };
  const add = (p: Pt, q: Pt): Pt => [p[0] + q[0], p[1] + q[1]];
  const hip: Pt = [0, 0];
  const shoulder = add(hip, vec(180 - a.torso, P.torso));
  const neck = add(shoulder, vec(180 - a.torso - a.neck, P.neckGap + P.head * 0.35));
  const head = add(shoulder, vec(180 - a.torso - a.neck, P.neckGap + P.head * 1.25));
  const j = { hip, shoulder, neck, head } as Record<Joint, Pt>;
  for (const s of ["near", "far"] as const) {
    const up = a[`arm_${s}_upper`] - a.torso;
    j[`elbow_${s}`] = add(shoulder, vec(up, P.upperArm));
    j[`hand_${s}`] = add(j[`elbow_${s}`], vec(up + a[`arm_${s}_lower`], P.lowerArm));
    const lu = a[`leg_${s}_upper`];
    j[`knee_${s}`] = add(hip, vec(lu, P.thigh));
    j[`foot_${s}`] = add(j[`knee_${s}`], vec(lu + a[`leg_${s}_lower`], P.shin));
  }
  const lowest = Math.max(...(Object.values(j) as Pt[]).map((p) => p[1]), head[1] + P.head * h);
  const ox = f.x * size;
  const oy = groundY - lowest - P.limbWidth * h * 0.5;
  for (const k of Object.keys(j) as Joint[]) j[k] = [j[k][0] + ox, j[k][1] + oy];
  return { joints: j, h, d };
}

const n = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};
const bar = (a: Pt, b: Pt, w: number, c: string) =>
  `<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}" stroke="${c}" stroke-width="${n(w)}" stroke-linecap="round"/>`;

export const FIGURE_COLOR = "#000";
export const FAR_COLOR = "#4a4a4a";

/** 人形の SVG（g 1 つ）。奥の手足 → 胴 → 手前の手足 → 頭の順に重ねる */
export function figureSvg(p: Posed, color = FIGURE_COLOR): string {
  const { joints: j, h } = p;
  const P = PROPORTION;
  const lw = P.limbWidth * h;
  const parts = [
    bar(j.hip, j.knee_far, lw, FAR_COLOR), bar(j.knee_far, j.foot_far, lw, FAR_COLOR),
    bar(j.shoulder, j.elbow_far, lw, FAR_COLOR), bar(j.elbow_far, j.hand_far, lw, FAR_COLOR),
    bar(j.shoulder, j.hip, P.torsoWidth * h, color),
    bar(j.hip, j.knee_near, lw, color), bar(j.knee_near, j.foot_near, lw, color),
    bar(j.shoulder, j.elbow_near, lw, color), bar(j.elbow_near, j.hand_near, lw, color),
    `<circle cx="${n(j.head[0])}" cy="${n(j.head[1])}" r="${n(P.head * h)}" fill="${color}"/>`,
  ];
  return `<g data-part="figure">${parts.join("")}</g>`;
}
