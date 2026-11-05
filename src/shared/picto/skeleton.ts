// 人形の骨格の正式版（015。11/2 に作者のスケッチに合わせて見た目を直した）。
// 丸い頭に目と口、胴はベストを着た台形、足は太く、手は丸。縁取りは外周を 1 周するだけにし、関節の区切りを見せない（11/2 の 2 回目の直し）。
// 関節ごとに名前と角度の範囲を持ち、範囲の外は断る。向きは左右を変えられる。

export const BONES = ["torso", "neck", "arm_near_upper", "arm_near_lower", "arm_far_upper", "arm_far_lower", "leg_near_upper", "leg_near_lower", "leg_far_upper", "leg_far_lower"] as const;
export type Bone = (typeof BONES)[number];

/**
 * 角度（度）。0 はまっすぐ立った姿。正は向いている側（前）へ回す。
 * torso: 胴の前への傾き / neck: 頭の前への傾き（正でうつむく）
 * *_upper: 真下を 0 として前へ（腕は 180 で真上）/ arm_*_lower: ひじの曲げ（正で前へ曲げる）/ leg_*_lower: ひざの曲げ（負で後ろへ曲げる）
 */
export const BONE_RANGE: Record<Bone, [number, number]> = {
  torso: [-95, 95], // 仰向けに横になる（lie_down_back）で -90 まで後ろへ倒す（11/6）
  neck: [-40, 50],
  arm_near_upper: [-60, 200],
  arm_near_lower: [0, 150],
  arm_far_upper: [-60, 200],
  arm_far_lower: [0, 150],
  // ももを後ろへ 95 度まで（横になる姿勢 lie_down で、足を後ろへまっすぐ伸ばす。11/6）
  leg_near_upper: [-95, 120],
  leg_near_lower: [-150, 0],
  leg_far_upper: [-95, 120],
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
  limbWidth: 0.085, // 足の太さ
  armWidth: 0.07,
  hand: 0.042, // 手の丸の半径
  outline: 0.02, // 縁取りの太さ
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
/** 折れ線の太い線（関節の角は丸める） */
const poly = (pts: Pt[], w: number, c: string) =>
  `<path d="M${pts.map((q) => `${n(q[0])} ${n(q[1])}`).join("L")}" fill="none" stroke="${c}" stroke-width="${n(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** 閉じた形。stroke を付けると、その半分だけ外へ太る（縁取りの層に使う） */
const shapePath = (pts: Pt[], fill: string, stroke = 0) =>
  `<path d="M${pts.map((q) => `${n(q[0])} ${n(q[1])}`).join("L")}Z" fill="${fill}"${stroke ? ` stroke="${fill}" stroke-width="${n(stroke)}" stroke-linejoin="round"` : ""}/>`;

/** 塗りの色（黒とグレーだけ）。腕はベストと同じ色、奥の足だけ 1 段明るくして 2 本に見せる。faded はほかの人を薄くするときの色 */
const INKS = {
  normal: { edge: "#000", skin: "#ececec", vest: "#7a7a7a", band: "#e6e6e6", pants: "#454545", pantsFar: "#5e5e5e" },
  faded: { edge: "#a8a8a8", skin: "#f4f4f4", vest: "#d0d0d0", band: "#f0f0f0", pants: "#c4c4c4", pantsFar: "#d2d2d2" },
};

export interface FigureStyle {
  /** ほかの人を目立たせるため、この人を薄く描く */
  faded?: boolean;
  /** 太さの倍率（強調） */
  width?: number;
}

/**
 * 人形の SVG（g 1 つ）。2 回描き: まず全部の部位を黒で縁の分だけ太く描き（縁取りの層）、
 * そのあと同じ形を塗りの色で描く（塗りの層）。関節で縁が交差しないので、手足と胴が 1 つのかたまりに見える。
 * 手前の足と腕だけは、塗りの下に細い黒を入れて前後を読ませる。
 */
export function figureSvg(p: Posed, style: FigureStyle = {}): string {
  const { joints: j, h, d } = p;
  const P = PROPORTION;
  const c = style.faded ? INKS.faded : INKS.normal;
  const k = style.width ?? 1;
  const o = Math.max(2, P.outline * h * k);
  const lw = P.limbWidth * h * k;
  const aw = P.armWidth * h * k;
  const tw = P.torsoWidth * h * k;
  // 2 本の足は腰の左右に分けて付け、重ならないようにする（間は縁の線 1 本ぶんだけ）
  const off = (q: Pt, s: number): Pt => [q[0] + s * d * (lw / 2 + o * 0.5), q[1]];
  const legPts = (s: "near" | "far", sign: number): Pt[] => [off(j.hip, sign), off(j[`knee_${s}`], sign), off(j[`foot_${s}`], sign)];
  // 靴: 足先から前へ出る小判形。すねに直角の向きにして、斜めの足でも足首が折れて見えないようにする。奥の靴は短く
  const bootPts = (s: "near" | "far", sign: number): Pt[] => {
    const f = off(j[`foot_${s}`], sign);
    const kn = j[`knee_${s}`];
    const vl = Math.hypot(f[0] - off(kn, sign)[0], f[1] - kn[1]) || 1;
    const fw: Pt = [((f[1] - kn[1]) / vl) * d, (-(f[0] - off(kn, sign)[0]) / vl) * d];
    const toe = s === "near" ? 0.65 : 0.45;
    return [[f[0] - fw[0] * lw * 0.2, f[1] - fw[1] * lw * 0.2], [f[0] + fw[0] * lw * toe, f[1] + fw[1] * lw * toe]];
  };
  const bw = lw * 0.55;
  // 胴: 肩が狭く腰が広い台形。裾は腰より少し下まで伸ばし、足の付け根を覆う
  const ax: Pt = [j.hip[0] - j.shoulder[0], j.hip[1] - j.shoulder[1]];
  const len = Math.hypot(ax[0], ax[1]) || 1;
  const u: Pt = [ax[0] / len, ax[1] / len];
  const per: Pt = [-u[1], u[0]];
  const top: Pt = [j.shoulder[0] - u[0] * o * 0.5, j.shoulder[1] - u[1] * o * 0.5];
  // 腕は胴の中から出す（肩に瘤を作らない）
  const sh: Pt = [j.shoulder[0] + u[0] * aw * 0.6, j.shoulder[1] + u[1] * aw * 0.6];
  const armPts = (s: "near" | "far"): Pt[] => [sh, j[`elbow_${s}`], j[`hand_${s}`]];
  const bot: Pt = [j.hip[0] + u[0] * lw * 0.3, j.hip[1] + u[1] * lw * 0.3];
  const at = (q: Pt, s: number, wd: number): Pt => [q[0] + per[0] * s * wd / 2, q[1] + per[1] * s * wd / 2];
  const hipW = Math.max(tw, 2 * lw + 2 * o);
  const torso: Pt[] = [at(top, -1, tw * 0.8), at(top, 1, tw * 0.8), at(bot, 1, hipW), at(bot, -1, hipW)];
  const bandC: Pt = [j.shoulder[0] + ax[0] * 0.62, j.shoulder[1] + ax[1] * 0.62];
  const bandHalf = (tw * (0.8 + 0.2 * 0.62)) / 2;
  const neck: Pt[] = [j.shoulder, j.neck];
  const r = P.head * h;
  const hr = Math.max(aw * 0.65, P.hand * h * k);

  const edge = [
    poly(legPts("far", -1), lw + 2 * o, c.edge), poly(bootPts("far", -1), bw + 2 * o, c.edge),
    poly(armPts("far"), aw + 2 * o, c.edge),
    shapePath(torso, c.edge, 2 * o),
    poly(legPts("near", 1), lw + o, c.edge), poly(bootPts("near", 1), bw + o, c.edge),
    poly(armPts("near"), aw + 2 * o, c.edge),
    poly(neck, aw * 0.6 + 2 * o, c.edge),
  ];
  const fill = [
    poly(armPts("far"), aw, c.vest),
    `<circle cx="${n(j.hand_far[0])}" cy="${n(j.hand_far[1])}" r="${n(hr)}" fill="${c.skin}" stroke="${c.edge}" stroke-width="${n(o)}"/>`,
    poly(legPts("far", -1), lw, c.pantsFar), poly(bootPts("far", -1), bw, c.pantsFar),
    // 手前の足: 塗りの下に細い黒を入れて、奥の足との境を出す
    poly(legPts("near", 1), lw + o, c.edge), poly(bootPts("near", 1), bw + o, c.edge),
    poly(legPts("near", 1), lw, c.pants), poly(bootPts("near", 1), bw, c.pants),
    shapePath(torso, c.vest),
    `<line x1="${n(bandC[0] - per[0] * (bandHalf - o * 0.5))}" y1="${n(bandC[1] - per[1] * (bandHalf - o * 0.5))}" x2="${n(bandC[0] + per[0] * (bandHalf - o * 0.5))}" y2="${n(bandC[1] + per[1] * (bandHalf - o * 0.5))}" stroke="${c.band}" stroke-width="${n(h * 0.025)}"/>`,
    poly(neck, aw * 0.6, c.skin),
    // 手前の腕: 胴と同じ色なので、細い黒で胴との境を出す
    poly(armPts("near"), aw + o, c.edge), poly(armPts("near"), aw, c.vest),
    `<circle cx="${n(j.hand_near[0])}" cy="${n(j.hand_near[1])}" r="${n(hr)}" fill="${c.skin}" stroke="${c.edge}" stroke-width="${n(o)}"/>`,
  ];
  // 頭: 塗りの丸と、向いている側の目と口。首の傾きに合わせて回す
  const [hx, hy] = j.head;
  const tilt = (Math.atan2(j.head[0] - j.shoulder[0], j.shoulder[1] - j.head[1]) * 180) / Math.PI;
  const face = `<g transform="rotate(${n(tilt)} ${n(hx)} ${n(hy)})">` +
    `<circle cx="${n(hx)}" cy="${n(hy)}" r="${n(r)}" fill="${c.skin}" stroke="${c.edge}" stroke-width="${n(o)}"/>` +
    `<circle cx="${n(hx + d * r * 0.42)}" cy="${n(hy + r * 0.12)}" r="${n(r * 0.12)}" fill="${c.edge}"/>` +
    bar([hx + d * r * 0.3, hy + r * 0.42], [hx + d * r * 0.6, hy + r * 0.42], Math.max(o * 0.7, r * 0.1), c.edge) + "</g>";
  return `<g data-part="figure">${edge.join("")}${fill.join("")}${face}</g>`;
}
