// 人形の骨格の正式版（015。11/2 に作者のスケッチに合わせて見た目を直した）。
// 丸い頭に目と口、胴はベストを着た塗りの形、足は太く、手は丸。どの形も黒い縁取りで描く。
// 関節ごとに名前と角度の範囲を持ち、範囲の外は断る。向きは左右を変えられる。奥側の手足は少し濃く塗る。

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
  head: 0.1, // 頭の半径
  neckGap: 0.02, // 頭と胴のすき間
  torso: 0.26,
  torsoWidth: 0.2, // ベストの幅
  upperArm: 0.15,
  lowerArm: 0.14,
  thigh: 0.22,
  shin: 0.22,
  limbWidth: 0.1, // 足の太さ
  armWidth: 0.07,
  hand: 0.042, // 手の丸の半径
  outline: 0.014, // 縁取りの太さ
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
/** 縁取りの棒: 黒い太い棒の上に、縁の分だけ細い塗りの棒を重ねる */
const outlined = (a: Pt, b: Pt, w: number, o: number, edge: string, fill: string) => bar(a, b, w, edge) + bar(a, b, Math.max(1, w - 2 * o), fill);

/** 塗りの色（黒とグレーだけ）。faded はほかの人を薄くするときの色 */
const INKS = {
  normal: { edge: "#000", skin: "#ececec", sleeve: "#d2d2d2", sleeveFar: "#a9a9a9", vest: "#7a7a7a", band: "#e6e6e6", pants: "#1e1e1e", pantsFar: "#4d4d4d" },
  faded: { edge: "#a8a8a8", skin: "#f4f4f4", sleeve: "#ebebeb", sleeveFar: "#dedede", vest: "#cfcfcf", band: "#f2f2f2", pants: "#bdbdbd", pantsFar: "#cdcdcd" },
};

export interface FigureStyle {
  /** ほかの人を目立たせるため、この人を薄く描く */
  faded?: boolean;
  /** 太さの倍率（強調） */
  width?: number;
}

/** 人形の SVG（g 1 つ）。奥の手足 → 胴 → 手前の足 → 手前の腕と手 → 頭の順に重ねる */
export function figureSvg(p: Posed, style: FigureStyle = {}): string {
  const { joints: j, h, d } = p;
  const P = PROPORTION;
  const c = style.faded ? INKS.faded : INKS.normal;
  const k = style.width ?? 1;
  const o = Math.max(1.5, P.outline * h * k);
  const lw = P.limbWidth * h * k;
  const aw = P.armWidth * h * k;
  const tw = P.torsoWidth * h * k;
  // 2 本の足は腰の左右に少しずらして付ける（立った姿でも 2 本に見える）
  const off = (q: Pt, s: number): Pt => [q[0] + s * d * lw * 0.32, q[1]];
  const leg = (s: "near" | "far", sign: number, fill: string) => {
    const a = off(j.hip, sign);
    const b = off(j[`knee_${s}`], sign);
    const f = off(j[`foot_${s}`], sign);
    // 靴: 足先から向いている側へ出る角の丸い箱
    const bx = Math.min(f[0] - lw * 0.45, f[0] + d * lw * 1.05);
    const boot = `<rect x="${n(bx)}" y="${n(f[1] - lw * 0.1)}" width="${n(lw * 1.5)}" height="${n(lw * 0.6)}" rx="${n(lw * 0.25)}" fill="${c.edge}"/>`;
    return outlined(a, b, lw, o, c.edge, fill) + outlined(b, f, lw, o, c.edge, fill) + boot;
  };
  const arm = (s: "near" | "far", fill: string) => {
    const e = j[`elbow_${s}`];
    const hd = j[`hand_${s}`];
    return outlined(j.shoulder, e, aw, o, c.edge, fill) + outlined(e, hd, aw, o, c.edge, fill) +
      `<circle cx="${n(hd[0])}" cy="${n(hd[1])}" r="${n(P.hand * h * k)}" fill="${c.skin}" stroke="${c.edge}" stroke-width="${n(o)}"/>`;
  };
  // ベスト: 肩から腰までの太い形と、反射材の帯 1 本
  const ax: Pt = [j.hip[0] - j.shoulder[0], j.hip[1] - j.shoulder[1]];
  const len = Math.hypot(ax[0], ax[1]) || 1;
  const mid: Pt = [j.shoulder[0] + ax[0] * 0.62, j.shoulder[1] + ax[1] * 0.62];
  const per: Pt = [(-ax[1] / len) * (tw / 2 - o), (ax[0] / len) * (tw / 2 - o)];
  const vest = outlined(j.shoulder, j.hip, tw, o, c.edge, c.vest) +
    `<line x1="${n(mid[0] - per[0])}" y1="${n(mid[1] - per[1])}" x2="${n(mid[0] + per[0])}" y2="${n(mid[1] + per[1])}" stroke="${c.band}" stroke-width="${n(h * 0.03)}"/>`;
  // 頭: 塗りの丸と、向いている側の目と口。首の傾きに合わせて回す
  const r = P.head * h;
  const [hx, hy] = j.head;
  const tilt = (Math.atan2(j.head[0] - j.shoulder[0], j.shoulder[1] - j.head[1]) * 180) / Math.PI;
  const face = `<g transform="rotate(${n(tilt)} ${n(hx)} ${n(hy)})">` +
    `<circle cx="${n(hx)}" cy="${n(hy)}" r="${n(r)}" fill="${c.skin}" stroke="${c.edge}" stroke-width="${n(o * 1.15)}"/>` +
    `<circle cx="${n(hx + d * r * 0.42)}" cy="${n(hy + r * 0.05)}" r="${n(r * 0.13)}" fill="${c.edge}"/>` +
    bar([hx + d * r * 0.3, hy + r * 0.48], [hx + d * r * 0.66, hy + r * 0.44], Math.max(1.5, r * 0.09), c.edge) + "</g>";
  const parts = [leg("far", -1, c.pantsFar), arm("far", c.sleeveFar), vest, leg("near", 1, c.pants), arm("near", c.sleeve), face];
  return `<g data-part="figure">${parts.join("")}</g>`;
}
