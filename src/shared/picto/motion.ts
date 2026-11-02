// 動きを再生してコマを切り出す部品（079a）。
// AI が書くのはキーフレームの JSON（時刻ごとの関節・小物の値と、意味の変わる時刻の印）だけ。
// 間は描く側が線形に補って動かし、印の付いた 3〜4 か所をコマとして切り出す。同じ JSON なら同じコマになる。
import { type PropKind, PROP_KINDS, type PropSpec } from "./props";
import { type Frame, type FrameFigure, renderFrame, validateFrame } from "./scene";
import { BONES, type Bone, type Joint, validateFigure } from "./skeleton";

export const MARKS_MIN = 3;
export const MARKS_MAX = 4;
export const MAX_DURATION = 10;
const JOINTS: Joint[] = ["hip", "shoulder", "neck", "head", "elbow_near", "elbow_far", "hand_near", "hand_far", "knee_near", "knee_far", "foot_near", "foot_far"];

/** AI が書く形（構造化出力のスキーマと 1 対 1）。小物の figure が -1 ならキャンバスの位置 x・y に置く */
export interface MotionJson {
  keyframes: {
    t: number;
    mark: boolean;
    figures: { x: number; height: number; facing: "left" | "right"; angles: Record<Bone, number> }[];
    props: { kind: PropKind; figure: number; joint: Joint; dx: number; dy: number; x: number; y: number; size: number }[];
  }[];
}

const num = { type: "number" } as const;

export const MOTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["keyframes"],
  properties: {
    keyframes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["t", "mark", "figures", "props"],
        properties: {
          t: num,
          mark: { type: "boolean" },
          figures: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["x", "height", "facing", "angles"],
              properties: {
                x: num, height: num,
                facing: { type: "string", enum: ["left", "right"] },
                angles: { type: "object", additionalProperties: false, required: [...BONES], properties: Object.fromEntries(BONES.map((b) => [b, num])) },
              },
            },
          },
          props: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["kind", "figure", "joint", "dx", "dy", "x", "y", "size"],
              properties: {
                kind: { type: "string", enum: [...PROP_KINDS] },
                figure: { type: "integer" },
                joint: { type: "string", enum: JOINTS },
                dx: num, dy: num, x: num, y: num, size: num,
              },
            },
          },
        },
      },
    },
  },
} as const;

type Key = MotionJson["keyframes"][number];

function keyToFrame(k: Key): Frame {
  return {
    figures: k.figures.map((f) => ({ x: f.x, height: f.height, facing: f.facing, angles: { ...f.angles } })),
    props: k.props.map((p): PropSpec => ({
      kind: p.kind,
      size: p.size,
      at: p.figure < 0 ? { x: p.x, y: p.y } : { figure: p.figure, joint: p.joint, dx: p.dx, dy: p.dy },
    })),
  };
}

/** 範囲の検査。問題の一覧を返す（空なら通る） */
export function validateMotion(m: MotionJson): string[] {
  const errs: string[] = [];
  const ks = m?.keyframes;
  if (!Array.isArray(ks) || ks.length < 2) return ["キーフレームは 2 つ以上"];
  if (ks[0].t !== 0) errs.push("最初のキーフレームの時刻は 0");
  ks.forEach((k, i) => {
    if (!(typeof k.t === "number" && k.t >= 0 && k.t <= MAX_DURATION)) errs.push(`keyframes[${i}].t が範囲の外（0〜${MAX_DURATION} 秒）`);
    if (i > 0 && !(k.t > ks[i - 1].t)) errs.push(`keyframes[${i}].t が前より後ではない`);
    if (k.figures.length !== ks[0].figures.length) errs.push(`keyframes[${i}] の人数が最初と違う`);
    if (k.props.length !== ks[0].props.length || k.props.some((p, j) => p.kind !== ks[0].props[j].kind || p.figure < 0 !== ks[0].props[j].figure < 0))
      errs.push(`keyframes[${i}] の小物の並びが最初と違う`);
    k.figures.forEach((f, j) => { for (const e of validateFigure(f)) errs.push(`keyframes[${i}].figures[${j}]: ${e}`); });
    for (const e of validateFrame(keyToFrame(k))) errs.push(`keyframes[${i}]: ${e}`);
  });
  const marks = ks.filter((k) => k.mark).length;
  if (marks < MARKS_MIN || marks > MARKS_MAX) errs.push(`印は ${MARKS_MIN}〜${MARKS_MAX} か所: ${marks}`);
  return errs;
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** 時刻 t の絵。前後のキーフレームの間を線形に補う（向きは前のキーフレームのまま） */
export function frameAt(m: MotionJson, t: number): Frame {
  const ks = m.keyframes;
  if (t <= ks[0].t) return keyToFrame(ks[0]);
  const last = ks[ks.length - 1];
  if (t >= last.t) return keyToFrame(last);
  const i = ks.findIndex((k) => k.t > t) - 1;
  const [a, b] = [ks[i], ks[i + 1]];
  const u = (t - a.t) / (b.t - a.t);
  const figures: FrameFigure[] = a.figures.map((f, j) => {
    const g = b.figures[j];
    return {
      x: lerp(f.x, g.x, u),
      height: lerp(f.height, g.height, u),
      facing: f.facing,
      angles: Object.fromEntries(BONES.map((bn) => [bn, lerp(f.angles[bn], g.angles[bn], u)])) as Record<Bone, number>,
    };
  });
  const props = a.props.map((p, j) => {
    const q = b.props[j];
    return { ...p, dx: lerp(p.dx, q.dx, u), dy: lerp(p.dy, q.dy, u), x: lerp(p.x, q.x, u), y: lerp(p.y, q.y, u), size: lerp(p.size, q.size, u) };
  });
  return keyToFrame({ t, mark: false, figures: figures as Key["figures"], props });
}

/** 印の付いた時刻のコマ（時刻の順） */
export function cutFrames(m: MotionJson): { t: number; frame: Frame }[] {
  return m.keyframes.filter((k) => k.mark).map((k) => ({ t: k.t, frame: frameAt(m, k.t) }));
}

/** 再生用: fps で刻んだ各時刻の SVG */
export function playSvgs(m: MotionJson, fps = 12): string[] {
  const end = m.keyframes[m.keyframes.length - 1].t;
  const out: string[] = [];
  for (let i = 0; i <= Math.round(end * fps); i++) out.push(renderFrame(frameAt(m, i / fps)).svg);
  return out;
}
