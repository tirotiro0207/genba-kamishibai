// 冒頭の折り紙の手（本当に折る版）。紙は 200 の正方形で、真ん中が (0,0)。y は下が正。
// 1 手ごとに、折り線の 2 点・動く側（move の点がある側）・谷か山か・戻すか を決める。左右で同じ手は 1 手にまとめて同時に折る。
// 手本の手順表が届いたら、ここの手を合わせる（docs/origami-folds.md）
import type { Facet, FStep } from "./fold";

const L = (x0: number, y0: number, x1: number, y1: number): [[number, number], [number, number]] => [[x0, y0], [x1, y1]];
const BIG = 400;
const box = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** 上に重なったフラップだけ（裏の面が見えている面） */
const flapOnly = (f: Facet) => !f.up;

// ---- 脚の紙（6 手） ----
export const LEG_FOLDS: FStep[] = [
  { id: "L1", label: "縦に半分の折り目を付けて戻す", ops: [{ line: L(0, -100, 0, 100), move: [50, 0], crease: true }] },
  { id: "L2", label: "左右の端を真ん中へ（谷）", ops: [{ line: L(-50, -100, -50, 100), move: [-80, 0] }, { line: L(50, -100, 50, 100), move: [80, 0] }] },
  { id: "L3", label: "もう一度、左右を真ん中へ（谷）", ops: [{ line: L(-25, -100, -25, 100), move: [-40, 0] }, { line: L(25, -100, 25, 100), move: [40, 0] }] },
  { id: "L4", label: "上を向こうへ折る（山・腰の線）", ops: [{ line: L(-BIG, -55, BIG, -55), move: [0, -80], valley: false }] },
  {
    id: "L5",
    label: "下の半分を左右へ開いて 2 本の脚（谷）",
    ops: [
      { line: L(0, 5, -20, 100), move: [-2, 90], mask: box(-BIG, -BIG, 0, BIG) },
      { line: L(0, 5, 20, 100), move: [2, 90], mask: box(0, -BIG, BIG, BIG) },
    ],
  },
  { id: "L6", label: "足先を折り上げる（谷）", ops: [{ line: L(-BIG, 86, BIG, 86), move: [0, 99] }] },
];

// ---- 体の紙（6 手） ----
export const BODY_FOLDS: FStep[] = [
  { id: "B1", label: "縦に半分の折り目を付けて戻す", ops: [{ line: L(0, -100, 0, 100), move: [50, 0], crease: true }] },
  { id: "B2", label: "左右の端を真ん中へ（谷）", ops: [{ line: L(-50, -100, -50, 100), move: [-80, 0] }, { line: L(50, -100, 50, 100), move: [80, 0] }] },
  {
    id: "B3",
    label: "上のフラップをめくって外へ倒す（腕）",
    ops: [
      { line: L(-50, -100, -50, 100), move: [-20, -60], mask: box(-60, -72, 0, -44), pick: flapOnly },
      { line: L(50, -100, 50, 100), move: [20, -60], mask: box(0, -72, 60, -44), pick: flapOnly },
    ],
  },
  {
    id: "B4",
    label: "上の角を向こうへ折る（頭と肩・山）",
    ops: [
      { line: L(-20, -100, -50, -76), move: [-48, -98], valley: false, mask: box(-BIG, -BIG, 0, -73) },
      { line: L(20, -100, 50, -76), move: [48, -98], valley: false, mask: box(0, -BIG, BIG, -73) },
    ],
  },
  {
    id: "B5",
    label: "腕の下を細く、向こうへ折る（胴・山）",
    ops: [
      { line: L(-24, -BIG, -24, BIG), move: [-40, 40], valley: false, mask: box(-BIG, -43, 0, BIG) },
      { line: L(24, -BIG, 24, BIG), move: [40, 40], valley: false, mask: box(0, -43, BIG, BIG) },
    ],
  },
  {
    id: "B6",
    label: "腕の先を少し折る（手・谷）",
    ops: [
      { line: L(-88, -BIG, -88, BIG), move: [-99, -58], mask: box(-BIG, -80, -60, -40) },
      { line: L(88, -BIG, 88, BIG), move: [99, -58], mask: box(60, -80, BIG, -40) },
    ],
  },
];
