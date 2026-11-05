// 紙（注意事項の貼り紙）と、紙から折った紙の人。
// 紙の面には、ぼかした文字の貼り紙の絵を貼る。形が折れて変わっても、面の絵は同じ座標に貼ったままなので、折るたびに一緒に切り抜かれる。
// 紙の人の骨格と姿勢は、アプリのピクトグラムと同じ部品（src/shared/picto/poses.ts）から読む。ここでは読むだけで、部品は直さない
import React from "react";
import { type Angles, POSES, poseAngles, stickJoints } from "../../src/shared/picto/poses";

export type Pt = [number, number];

export const PAPER = "#fbf6e8";
export const PAPER_FAR = "#ece3cc";
export const PAPER_EDGE = "#b9ad8f";

/** 紙の面の絵（ぼかした文字の貼り紙）。紙の左上を (-100,-200) とし、200×400 で 1 枚 */
const PaperPattern: React.FC<{ id: string; dy: number }> = ({ id, dy }) => (
  <>
    <filter id={`${id}-blur`} x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="2.2" />
    </filter>
    <pattern id={id} patternUnits="userSpaceOnUse" x={-100} y={-200 + dy} width={200} height={400}>
      <rect x={0} y={0} width={200} height={400} fill={PAPER} />
      <g filter={`url(#${id}-blur)`}>
        <rect x={14} y={16} width={172} height={30} rx={3} fill="#c94a3a" opacity={0.75} />
        <text x={100} y={39} textAnchor="middle" fontSize={20} fontWeight={700} fill="#fff" fontFamily="Yu Gothic, Meiryo, sans-serif">
          守るべき注意事項
        </text>
        {Array.from({ length: 9 }, (_, i) => (
          <g key={i}>
            <circle cx={22} cy={78 + i * 36} r={4} fill="#555" />
            <rect x={34} y={74 + i * 36} width={i % 3 === 2 ? 110 : 150} height={7} rx={3} fill="#777" />
            <rect x={34} y={86 + i * 36} width={i % 2 ? 90 : 128} height={5} rx={2} fill="#aaa" />
          </g>
        ))}
      </g>
    </pattern>
  </>
);
/**
 * 紙の面の絵を 2 つ置く: paper は折る紙（左上が (-100,-200)）、paper-body は紙の人の体（赤い見出しが胸に来るように下へずらす。
 * 頭に来ると口のように見えるため）
 */
export const PaperDefs: React.FC = () => (
  <defs>
    <PaperPattern id="paper" dy={0} />
    <PaperPattern id="paper-body" dy={74} />
  </defs>
);

// ---- 形を変える（多角形を同じ点の数に並べ直してから、点ごとに動かす） ----

/** 多角形の周りを n 個の等しい間の点に並べ直す（最初の点から時計回り） */
export function resample(poly: Pt[], n = 64): Pt[] {
  const edges = poly.map((p, i) => [p, poly[(i + 1) % poly.length]] as const);
  const lens = edges.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const out: Pt[] = [];
  let e = 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const want = (i / n) * total;
    while (e < edges.length - 1 && acc + lens[e] < want) acc += lens[e++];
    const t = lens[e] ? (want - acc) / lens[e] : 0;
    const [a, b] = edges[e];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
export const lerpPoly = (a: Pt[], b: Pt[], t: number): Pt[] => a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t]);
export const d = (poly: Pt[]) => `M${poly.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("L")}Z`;

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const shift = (poly: Pt[], dx: number, dy: number): Pt[] => poly.map(([x, y]) => [x + dx, y + dy]);

/**
 * 折り紙 ① の 8 コマ（紙 → 紙の人）。上の正方形が腕と頭、下の正方形が 2 本の脚になる。
 * 形は折り方の手順（上下 2 枚の正方形 → 下は対角 → 菱形 → 細い菱形 → 2 本の脚 / 上は菱形 → 腕と頭 → 体を脚にかぶせる）を、自分で多角形に描き起こしたもの。
 * crease は、そのコマで付いた折り目（以降のコマでも薄く残す）
 */
export interface FoldKey { top: Pt[]; bottom: Pt[]; crease: [Pt, Pt][] }
const LEGS: Pt[] = [[-38, 30], [38, 30], [42, 214], [14, 214], [0, 92], [-14, 214], [-42, 214]];
const SHIRT: Pt[] = [[-22, -212], [22, -212], [22, -168], [80, -148], [96, -36], [70, -36], [56, -116], [40, 2], [-40, 2], [-56, -116], [-70, -36], [-96, -36], [-80, -148], [-22, -168]];
export const FOLDS: FoldKey[] = [
  // 1 印刷された 1 枚
  { top: rect(-100, -200, 100, 0), bottom: rect(-100, 0, 100, 200), crease: [] },
  // 2 上下 2 枚の正方形に分かれる
  { top: rect(-100, -215, 100, -15), bottom: rect(-100, 15, 100, 215), crease: [] },
  // 3 下を対角に折る
  { top: rect(-100, -215, 100, -15), bottom: [[-100, 15], [100, 15], [100, 215]], crease: [[[-100, 15], [100, 215]]] },
  // 4 上も下も菱形に
  { top: [[0, -215], [100, -115], [0, -15], [-100, -115]], bottom: [[0, 15], [100, 115], [0, 215], [-100, 115]], crease: [[[-100, -115], [100, -115]], [[0, 15], [0, 215]]] },
  // 5 下を細い菱形に
  { top: [[0, -215], [100, -115], [0, -15], [-100, -115]], bottom: [[0, 5], [44, 115], [0, 230], [-44, 115]], crease: [[[0, -215], [0, -15]]] },
  // 6 下を 2 本の脚に、上を腕と頭の形に
  { top: SHIRT, bottom: LEGS, crease: [[[0, 92], [0, 30]], [[-22, -168], [22, -168]]] },
  // 7 体を脚にかぶせて、パチンとはめる
  { top: shift(SHIRT, 0, 30), bottom: LEGS, crease: [[[-40, 32], [40, 32]]] },
  // 8 頭・首・足先のある紙の人が立つ
  {
    top: [[-26, -205], [26, -205], [32, -180], [10, -162], [10, -150], [70, -140], [92, -30], [72, -26], [56, -110], [42, 36], [-42, 36], [-56, -110], [-72, -26], [-92, -30], [-70, -140], [-10, -150], [-10, -162], [-32, -180]],
    bottom: [[-38, 30], [38, 30], [42, 200], [62, 214], [14, 214], [0, 92], [-14, 214], [-62, 214], [-42, 200]],
    crease: [[[0, -150], [0, 36]]],
  },
];

/** 折る 1 コマの時間（0.35 秒）の中で、形が動く割合。残りは止めて見せる */
export const FOLD_MOVE = 0.6;

/** 0〜(コマ数-1) の進み p での形（整数で止まる。間は easeInOut で動く） */
export function foldAt(p: number) {
  const n = 64;
  const i = Math.max(0, Math.min(FOLDS.length - 1, Math.floor(p)));
  const j = Math.min(FOLDS.length - 1, i + 1);
  const f = p - i;
  const m = Math.min(1, f / FOLD_MOVE);
  const t = m < 0.5 ? 2 * m * m : 1 - (-2 * m + 2) ** 2 / 2;
  const A = FOLDS[i];
  const B = FOLDS[j];
  return {
    top: lerpPoly(resample(A.top, n), resample(B.top, n), t),
    bottom: lerpPoly(resample(A.bottom, n), resample(B.bottom, n), t),
    creases: FOLDS.slice(1, i + 1).flatMap((k) => k.crease),
    fresh: j > i ? B.crease : [],
    t,
  };
}

// ---- 紙の人（ピクトグラムの骨格を、折った紙の形で描く） ----

/** 2 点を結ぶ紙の帯（先が少し細くなる。折り紙らしく角を立てる） */
function band(a: Pt, b: Pt, w0: number, w1: number): Pt[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = -(b[1] - a[1]) / len;
  const ny = (b[0] - a[0]) / len;
  return [
    [a[0] + nx * w0, a[1] + ny * w0],
    [b[0] + nx * w1, b[1] + ny * w1],
    [b[0] - nx * w1, b[1] - ny * w1],
    [a[0] - nx * w0, a[1] - ny * w0],
  ];
}
const hexagon = (c: Pt, r: number, rot: number): Pt[] =>
  Array.from({ length: 6 }, (_, i) => {
    const a = ((i * 60 + 30 + rot) * Math.PI) / 180;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * 1.08] as Pt;
  });

export const mirrorRun = (a: Angles): Angles => ({
  ...a,
  arm_near_upper: a.arm_far_upper,
  arm_near_lower: a.arm_far_lower,
  arm_far_upper: a.arm_near_upper,
  arm_far_lower: a.arm_near_lower,
  leg_near_upper: a.leg_far_upper,
  leg_near_lower: a.leg_far_lower,
  leg_far_upper: a.leg_near_upper,
  leg_far_lower: a.leg_near_lower,
});
export const mixAngles = (a: Angles, b: Angles, t: number): Angles =>
  Object.fromEntries(Object.keys(a).map((k) => [k, a[k as keyof Angles] + (b[k as keyof Angles] - a[k as keyof Angles]) * t])) as Angles;

/** 歩く・走るの 1 歩（phase は 0〜1 で 1 歩。0.5 で左右が入れ替わる） */
export function gait(name: "walk" | "run", phase: number): Angles {
  const a = POSES[name];
  const t = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
  return mixAngles(a, mirrorRun(a), t);
}

/**
 * 紙の人（g 1 つ）。x は腰の横の位置、ground は床の高さ。背の高さは height（ピクトグラムの 434 を基に縮める）。
 * 奥の手足は一段暗い紙、手前は明るい紙。面にはぼかした文字の貼り紙が残る
 */
export const PaperPerson: React.FC<{ angles: Angles; x: number; ground: number; height?: number; facing?: "left" | "right"; view?: "front" | "quarter"; pattern?: string; opacity?: number }> = ({
  angles,
  x,
  ground,
  height = 356,
  facing = "right",
  view = "quarter",
  pattern = "paper-body",
  opacity = 1,
}) => {
  const j = stickJoints(poseAngles(angles, view), view);
  const low = Math.max(j.ankle[0][1], j.ankle[1][1]) + 25;
  const k = height / 434;
  const sx = facing === "right" ? k : -k;
  const fill = `url(#${pattern})`;
  const axis = [j.chest[0] - j.hip[0], j.chest[1] - j.hip[1]];
  const al = Math.hypot(axis[0], axis[1]) || 1;
  const nx = -axis[1] / al;
  const ny = axis[0] / al;
  const off = (p: Pt, w: number): Pt => [p[0] + nx * w, p[1] + ny * w];
  const torso: Pt[] = [off(j.neck, 16), off(j.chest, 50), off(j.hip, 34), off(j.hip, -34), off(j.chest, -50), off(j.neck, -16)];
  const foot = (i: number): Pt[] => {
    const a = j.ankle[i];
    // 正面は足先を外へ向ける（画面の左の足は左へ）。斜めは向いている側へ
    const s = view === "front" ? Math.sign(j.hipJoint[i][0]) || 1 : 1;
    return [[a[0] - 14 * s, a[1] - 6], [a[0] + 34 * s, a[1] + 22], [a[0] - 16 * s, a[1] + 24]];
  };
  const limb = (i: number) => (
    <g key={i}>
      <path d={d(band(j.hipJoint[i], j.knee[i], 22, 18))} />
      <path d={d(band(j.knee[i], j.ankle[i], 18, 14))} />
      <path d={d(foot(i))} />
    </g>
  );
  const arm = (i: number) => (
    <g key={`a${i}`}>
      <path d={d(band(j.shoulder[i], j.elbow[i], 17, 14))} />
      <path d={d(band(j.elbow[i], j.hand[i], 14, 10))} />
    </g>
  );
  const headRot = (Math.atan2(j.head[1] - j.neck[1], j.head[0] - j.neck[0]) * 180) / Math.PI + 90;
  const stroke = { stroke: PAPER_EDGE, strokeWidth: 2.5 / k, strokeLinejoin: "round" as const };
  return (
    <g transform={`translate(${x} ${ground}) scale(${sx} ${k}) translate(0 ${-low})`} opacity={opacity}>
      <g fill={PAPER_FAR} {...stroke}>
        {arm(0)}
        {limb(0)}
      </g>
      <g fill={fill} {...stroke}>
        {limb(1)}
        <path d={d(torso)} />
        <path d={`M${j.neck[0]} ${j.neck[1]}L${j.hip[0]} ${j.hip[1]}`} fill="none" stroke={PAPER_EDGE} strokeWidth={1.5 / k} opacity={0.6} />
        <path d={d(band(j.neck, [j.neck[0], j.neck[1] - 14], 9, 9))} />
        <path d={d(hexagon(j.head, 40, headRot))} />
        {arm(1)}
      </g>
    </g>
  );
};

/** 床に落ちる紙の人の影 */
export const Shadow: React.FC<{ x: number; ground: number; w?: number; opacity?: number }> = ({ x, ground, w = 70, opacity = 0.18 }) => (
  <ellipse cx={x} cy={ground + 4} rx={w} ry={9} fill="#000" opacity={opacity} />
);
