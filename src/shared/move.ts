// 絵の部品を 1 つずつ動かす（091）。監修者が人・時計・小物を 1 つ選び、そのコマのキーフレームの値だけを手で変える。
// 人は関節の角度と横の位置、小物は位置（持っていれば手元からのずれ、置いてあれば画面の位置）と大きさ。
// 人数・役・小物の種類と並び・持ち手は変えないので、部品 → 文 → 元の文の経路は保たれる。値は描く側の範囲の中に収める。
import type { MotionJson } from "./picto/motion";
import { BONE_RANGE, BONES, type Bone } from "./picto/skeleton";

export type Target = { type: "figure" | "prop"; index: number };
export type FigurePatch = { x?: number; angles?: Partial<Record<Bone, number>> };
export type PropPatch = { dx?: number; dy?: number; x?: number; y?: number; size?: number };

export const SIZE_RANGE: [number, number] = [0.04, 0.5];
const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));
const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** 1 つの部品の値だけを変えたキーフレームの並びを返す（元は変えない） */
export function movePart(m: MotionJson, keyIndex: number, target: Target, patch: FigurePatch | PropPatch): MotionJson {
  const k = m.keyframes[keyIndex];
  if (!k) throw new Error("そのキーフレームが無い");
  const key = structuredClone(k);
  if (target.type === "figure") {
    const f = key.figures[target.index];
    if (!f) throw new Error("その人がいない");
    const p = patch as FigurePatch;
    if (ok(p.x)) f.x = clamp(p.x, [0, 1]);
    for (const b of BONES) {
      const v = p.angles?.[b];
      if (ok(v)) f.angles[b] = clamp(v, BONE_RANGE[b]);
    }
  } else {
    const q = key.props[target.index];
    if (!q) throw new Error("その小物が無い");
    const p = patch as PropPatch;
    if (q.figure >= 0) {
      if (ok(p.dx)) q.dx = clamp(p.dx, [-1, 1]);
      if (ok(p.dy)) q.dy = clamp(p.dy, [-1, 1]);
    } else {
      if (ok(p.x)) q.x = clamp(p.x, [0, 1]);
      if (ok(p.y)) q.y = clamp(p.y, [0, 1]);
    }
    if (ok(p.size)) q.size = clamp(p.size, SIZE_RANGE);
  }
  return { keyframes: m.keyframes.map((x, i) => (i === keyIndex ? key : x)) };
}

/** 選んだ部品の今の値（画面の JSON 欄に出す） */
export function partJson(m: MotionJson, keyIndex: number, target: Target) {
  const k = m.keyframes[keyIndex];
  if (target.type === "figure") {
    const f = k.figures[target.index];
    return { role: f.role, x: f.x, angles: f.angles };
  }
  const q = k.props[target.index];
  return q.figure >= 0 ? { kind: q.kind, figure: q.figure, joint: q.joint, dx: q.dx, dy: q.dy, size: q.size } : { kind: q.kind, x: q.x, y: q.y, size: q.size };
}
