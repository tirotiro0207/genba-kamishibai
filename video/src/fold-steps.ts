// 冒頭の折り紙の手（本当に折る版）。手本の大きい手の順（正方形 → 対角線の三角 → 菱形・凧 → 脚が分かれる → 腕が出る → 頭が出る）に合わせ、
// 折り終えた形は手本の「できあがりの形」の輪郭 20 点（docs/origami-folds.md）に合わせる。
// 2 枚とも、刷った面を向こうにして菱形に置く（手本の「裏返す」）。だから折り返したフラップにだけ刷った字が出て、頭と腕は無地になる。
// 座標は菱形の真ん中が (0,0)、y は下が正。菱形の半分の対角は 141.4。紙の人の座標は体の紙の座標のまま（脚の紙は LEG_DY 下に置く）。
// 「折り込む」（tuck）は、向こうへ倒した所が紙の間に入って見えなくなる手（手本の折り込み・中割りを、外から見た形で見せる）
import type { Facet, FoldOp, FStep } from "./fold";

type P = [number, number];
const D = 141.42;
const BIG = 400;
const L = (a: P, b: P): [P, P] => [a, b];
/** 左右を入れ替えた手（右の手から左の手を作る） */
const mx = (op: FoldOp): FoldOp => ({
  ...op,
  line: [[-op.line[0][0], op.line[0][1]], [-op.line[1][0], op.line[1][1]]],
  move: [-op.move[0], op.move[1]],
  mask: op.mask?.map(([x, y]) => [-x, y] as P).reverse(),
});
const both = (op: FoldOp): FoldOp[] => [op, mx(op)];

// ---- 手本の「できあがりの形」（幅 : 高さ = 0.46 : 1）を紙の人の座標へ ----
/** 手本の箱の (u, v) を紙の人の座標へ。肩の高さを y = -25、全体の高さを 403 にする（頭のてっぺんが体の紙の上の角の中に入る大きさ） */
const FIG_H = 403.2;
export const fig = (u: number, v: number): P => [(u - 0.46) * FIG_H * 0.46, -25 + (v - 0.22) * FIG_H];
export const HEAD_TOP = fig(0.61, 0.01); // 頭の上の右の角
const HEAD_MID = fig(0.67, 0.09);
const HEAD_LOW = fig(0.66, 0.15);
const NECK = fig(0.55, 0.2);
export const SHOULDER = fig(0.82, 0.22);
const ELBOW = fig(0.93, 0.35);
export const ARM_TIP = fig(0.97, 0.58);
export const CROTCH = fig(0.46, 0.62);
export const FOOT_IN = fig(0.56, 0.97);
export const FOOT_OUT = fig(0.82, 0.98);

/** 手本のできあがりの形の輪郭 20 点（時計回り）。見比べの線を描くのに使う */
export const OUTLINE: P[] = ([[0.3, 0.01], [0.61, 0.01], [0.67, 0.09], [0.66, 0.15], [0.55, 0.2], [0.82, 0.22], [0.93, 0.35], [0.97, 0.58], [0.82, 0.8], [0.82, 0.98], [0.56, 0.97], [0.46, 0.62], [0.46, 0.97], [0.18, 0.99], [0.18, 0.79], [0.07, 0.59], [0.01, 0.35], [0.12, 0.22], [0.37, 0.2], [0.25, 0.15]] as P[]).map(([u, v]) => fig(u, v));

// ---- 脚の紙（4 手） ----
/** 脚の紙の足の裏（脚の紙の座標）。紙の人の足の裏に合わせて脚の紙を置く */
export const LEG_FOOT_Y = 80;
export const LEG_DY = FOOT_OUT[1] - LEG_FOOT_Y;
const crotchL: P = [0, CROTCH[1] - LEG_DY];
const footInL: P = [FOOT_IN[0], FOOT_IN[1] - LEG_DY];
const crotchAt = (y: number) => crotchL[0] + ((footInL[0] - crotchL[0]) * (y - crotchL[1])) / (footInL[1] - crotchL[1]);

export const LEG_FOLDS: FStep[] = [
  { id: "L1", label: "対角線で三角に折って戻す（折り筋）", ops: [{ line: L([-BIG, 0], [BIG, 0]), move: [0, 60], crease: true }] },
  { id: "L2", label: "左右の角を真ん中へ（谷・細長い六角）", ops: both({ line: L([D / 2, -BIG], [D / 2, BIG]), move: [120, 0] }) },
  { id: "L3", label: "下の角を向こうへ（山・足の裏を平らに）", ops: [{ line: L([-BIG, LEG_FOOT_Y], [BIG, LEG_FOOT_Y]), move: [0, 120], valley: false }] },
  {
    id: "L4",
    label: "股から下を左右に分ける（中割り・脚が分かれる）",
    ops: both({
      line: L(crotchL, [crotchAt(BIG), BIG]),
      move: [2, LEG_FOOT_Y - 4],
      valley: false,
      tuck: true,
      mask: [crotchL, [crotchAt(BIG), BIG], [0, BIG]],
    }),
  },
];

// ---- 体の紙（6 手） ----
const isFlap = (f: Facet) => f.up; // 裏返して置いたので、折り返したフラップだけが表（刷った面）
/** 凧の右の辺（肩の角 (82.8,-58.6) → 下の角 (0,141.4)） */
const KITE_W: P = [82.8, -58.58];
const kiteX = (y: number) => (KITE_W[0] * (D - y)) / (D - KITE_W[1]);
const U: P = [(0 - KITE_W[0]) / 216.1, (D - KITE_W[1]) / 216.1]; // 辺の向き（下へ）
const N: P = [-U[1], U[0]]; // 辺の内向き
/** 腕の付け根（凧の辺の上の、肩の高さの点） */
export const ARM_PIVOT: P = [kiteX(SHOULDER[1]), SHOULDER[1]];
const ARM_W = 20;
export const ARM_LEN = 140;
/** 腕を垂らす: 辺に沿った帯を、付け根を通る線でめくり返す。線は「辺の向き」と「垂らしたい向き（ほぼ真下）」のまん中 */
const HANG: P = [0, 1];
const lineDir: P = (() => {
  const x = U[0] + HANG[0];
  const y = U[1] + HANG[1];
  const l = Math.hypot(x, y);
  return [x / l, y / l];
})();
const at = (t: number, w: number): P => [ARM_PIVOT[0] + U[0] * t + N[0] * w, ARM_PIVOT[1] + U[1] * t + N[1] * w];
const ARM: FoldOp = {
  line: L(ARM_PIVOT, [ARM_PIVOT[0] + lineDir[0] * 200, ARM_PIVOT[1] + lineDir[1] * 200]),
  move: at(60, 10),
  mask: [at(0, -2), at(ARM_LEN, -2), at(ARM_LEN, ARM_W), at(0, ARM_W)],
  pick: isFlap,
};
/** 肩の線（首 → 肩）を外へのばした線の上の、x での y */
const shoulderY = (x: number) => NECK[1] + ((SHOULDER[1] - NECK[1]) * (x - NECK[0])) / (SHOULDER[0] - NECK[0]);
const headTopY = HEAD_TOP[1];
/** 肩 → 肘の線の上の、高さ y の点の x（なで肩の線） */
const slopeX = (y: number) => SHOULDER[0] + ((ELBOW[0] - SHOULDER[0]) * (y - SHOULDER[1])) / (ELBOW[1] - SHOULDER[1]);
const sideA = (y: number) => HEAD_TOP[0] + ((HEAD_MID[0] - HEAD_TOP[0]) * (y - HEAD_TOP[1])) / (HEAD_MID[1] - HEAD_TOP[1]);

export const BODY_FOLDS: FStep[] = [
  { id: "B1", label: "対角線で三角に折って戻す（折り筋を 2 本）", ops: [{ line: L([0, -BIG], [0, BIG]), move: [50, 0], crease: true }, { line: L([-BIG, 0], [BIG, 0]), move: [0, 50], crease: true }] },
  { id: "B2", label: "下の 2 辺を真ん中の線へ（谷・凧）", ops: both({ line: L([0, D], [KITE_W[0], KITE_W[1]]), move: [100, 20] }) },
  { id: "B3", label: "フラップの外の帯を、肩から下へめくり出す（谷・腕が出て垂れる）", ops: both(ARM) },
  { id: "B4", label: "頭の先を向こうへ（山・頭の上を平らに）", ops: [{ line: L([-BIG, headTopY], [BIG, headTopY]), move: [0, -130], valley: false }] },
  {
    id: "B5",
    label: "頭の左右を向こうへ折り込む（八角の頭）",
    ops: [
      ...both({ line: L(HEAD_TOP, HEAD_MID), move: [60, -90], valley: false, tuck: true, mask: [[sideA(-BIG), -BIG], [BIG, -BIG], [BIG, HEAD_MID[1]], HEAD_MID] }),
      ...both({ line: L(HEAD_MID, HEAD_LOW), move: [70, -65], valley: false, tuck: true, mask: [HEAD_MID, [BIG, HEAD_MID[1]], [BIG, HEAD_LOW[1]], HEAD_LOW] }),
    ],
  },
  {
    id: "B6",
    label: "あごの下・肩の上・腕の付け根の外の角を折り込む（首と、なで肩）",
    ops: [
      ...both({ line: L(HEAD_LOW, NECK), move: [50, -40], valley: false, tuck: true, mask: [HEAD_LOW, [BIG, HEAD_LOW[1]], [BIG, shoulderY(BIG)], NECK] }),
      ...both({ line: L(SHOULDER, ELBOW), move: [ELBOW[0] + 4, SHOULDER[1]], valley: false, tuck: true, mask: [[slopeX(-60), -60], [BIG, -60], [BIG, ELBOW[1]], ELBOW] }),
    ],
  },
];
