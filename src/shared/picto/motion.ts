// 動きを再生してコマを切り出す部品（079a）。
// AI が書くのはキーフレームの JSON（時刻ごとの関節・小物の値と、意味の変わる時刻の印）だけ。
// 間は描く側が線形に補って動かし、印の付いた 3〜4 か所をコマとして切り出す。同じ JSON なら同じコマになる。
// 原則の 1 コマのカード（11/7）は、1 枚の絵（angles の口の答え）をキーフレーム 1 つ・印 1 つの動きにして持つ（principleMotion）。
import { EXPRESSIONS, type Expression } from "./avatar";
import { type ChecklistIcon, INNER_KINDS, INNER_MARKS, type InnerKind, type InnerMark, type PropKind, PROP_KINDS, type PropSpec } from "./props";
import { type Frame, type FrameFigure, renderFrame, type Role, ROLES, validateFrame } from "./scene";
import { BONES, type Bone, type Joint, JOINTS, validateFigure } from "./skeleton";

export const MARKS_MIN = 3;
export const MARKS_MAX = 4;
export const MAX_DURATION = 10;

/** AI が書く形（構造化出力のスキーマと 1 対 1）。小物の figure が -1 ならキャンバスの位置 x・y に置く */
export interface MotionJson {
  keyframes: {
    t: number;
    mark: boolean;
    /**
     * expression は顔の表情、tired は疲れの線、lift は足の下の高さ（11/6。どれも無くてよい。無ければ今までの絵と同じ）。
     * 表情と疲れの線は補わず前のキーフレームのまま、lift は位置と同じく線形に補う
     */
    figures: { role: Role; x: number; height: number; facing: "left" | "right"; angles: Record<Bone, number>; expression?: Expression; tired?: boolean; lift?: number; gaze?: { angle: number; length: number } }[];
    /**
     * inner は吹き出しの中の道具（無ければ "none"）。show が false のコマでは描かない（吹き出しを出し入れする）。
     * inner2 は吹き出しの中の 2 つ目の道具、inner_marks はその 2 つに付ける印（11/6。無くてよい）
     */
    props: { kind: PropKind; show: boolean; figure: number; joint: Joint; dx: number; dy: number; x: number; y: number; size: number; inner: InnerKind | "none"; inner2?: InnerKind | "none"; inner_marks?: [InnerMark, InnerMark]; rows?: number; checks?: number; numbered?: boolean; icons?: ChecklistIcon[] }[];
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
              required: ["role", "x", "height", "facing", "angles"],
              properties: {
                role: { type: "string", enum: [...ROLES] },
                x: num, height: num,
                facing: { type: "string", enum: ["left", "right"] },
                angles: { type: "object", additionalProperties: false, required: [...BONES], properties: Object.fromEntries(BONES.map((b) => [b, num])) },
                expression: { type: "string", enum: [...EXPRESSIONS] },
                tired: { type: "boolean" },
                lift: num,
                gaze: { type: "object", additionalProperties: false, required: ["angle", "length"], properties: { angle: num, length: num } },
              },
            },
          },
          props: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["kind", "show", "figure", "joint", "dx", "dy", "x", "y", "size", "inner"],
              properties: {
                kind: { type: "string", enum: [...PROP_KINDS] },
                show: { type: "boolean" },
                figure: { type: "integer" },
                joint: { type: "string", enum: [...JOINTS] },
                dx: num, dy: num, x: num, y: num, size: num,
                inner: { type: "string", enum: ["none", ...INNER_KINDS] },
                inner2: { type: "string", enum: ["none", ...INNER_KINDS] },
                inner_marks: { type: "array", items: { type: "string", enum: [...INNER_MARKS] } },
                // チェック表（checklist）だけの欄（11/6 昼）。行の数・✓ の数・丸数字・行の頭の絵
                rows: { type: "integer" },
                checks: { type: "integer" },
                numbered: { type: "boolean" },
                icons: { type: "array", items: { type: "string", enum: ["fall", "none", ...INNER_KINDS] } },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** 1 枚の絵の形（キーフレームから時刻と印を除いたもの）。角度だけで 1 枚を決めるときに使う */
export type FrameJson = Pick<MotionJson["keyframes"][number], "figures" | "props">;
type Key = MotionJson["keyframes"][number];

const KEY_ITEMS = MOTION_JSON_SCHEMA.properties.keyframes.items;
export const FRAME_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["figures", "props"],
  properties: { figures: KEY_ITEMS.properties.figures, props: KEY_ITEMS.properties.props },
} as const;

type KeyProp = Key["props"][number];

/**
 * 吹き出しの中の道具。inner が "none" なら inner2 も、inner2 が "none" なら inner_marks も捨てる
 * （AI が「無し」と一緒に書いた残りの欄で、検査に落ちて作り直しを 1 回使わないように）
 */
function innerOf(p: KeyProp): Pick<PropSpec, "inner" | "inner2" | "inner_marks"> {
  if (!p.inner || p.inner === "none") return {};
  if (!p.inner2 || p.inner2 === "none") return { inner: p.inner };
  return { inner: p.inner, inner2: p.inner2, ...(p.inner_marks ? { inner_marks: p.inner_marks } : {}) };
}

/** チェック表の欄（チェック表のときだけ使う。ほかの小物に書かれた欄は捨てる） */
function listOf(p: KeyProp): Pick<PropSpec, "rows" | "checks" | "numbered" | "icons"> {
  return {
    ...(p.rows !== undefined ? { rows: p.rows } : {}),
    ...(p.checks !== undefined ? { checks: p.checks } : {}),
    ...(p.numbered !== undefined ? { numbered: p.numbered } : {}),
    ...(p.icons ? { icons: [...p.icons] } : {}),
  };
}

export function keyToFrame(k: FrameJson): Frame {
  return {
    figures: k.figures.map((f) => ({
      role: f.role, x: f.x, height: f.height, facing: f.facing, angles: { ...f.angles },
      ...(f.expression ? { expression: f.expression } : {}), ...(f.tired ? { tired: true } : {}), ...(f.lift ? { lift: f.lift } : {}),
      ...(f.gaze ? { gaze: { ...f.gaze } } : {}),
    })),
    props: k.props.filter((p) => p.show !== false).map((p): PropSpec => ({
      kind: p.kind,
      size: p.size,
      at: p.figure < 0 ? { x: p.x, y: p.y } : { figure: p.figure, joint: p.joint, dx: p.dx, dy: p.dy },
      ...innerOf(p),
      ...(p.kind === "checklist" ? listOf(p) : {}),
    })),
  };
}

/** 1 枚の絵の範囲の検査（人形の関節・小物・人数） */
export function validateFrameJson(k: FrameJson): string[] {
  const errs: string[] = [];
  if (!Array.isArray(k?.figures) || !Array.isArray(k?.props)) return ["figures と props が要る"];
  const notObj = (v: unknown) => !v || typeof v !== "object";
  if (k.figures.some(notObj) || k.props.some(notObj)) return ["figures と props の中身は形（オブジェクト）"];
  k.figures.forEach((f, j) => { for (const e of validateFigure(f)) errs.push(`figures[${j}]: ${e}`); });
  for (const e of validateFrame(keyToFrame(k))) errs.push(e);
  return errs;
}

/** 1 枚の絵（angles の口の答え）を、原則の 1 コマのカードの動き（キーフレーム 1 つ・印 1 つ）にする */
export const principleMotion = (k: FrameJson): MotionJson => ({ keyframes: [{ t: 0, mark: true, figures: k.figures, props: k.props }] });

/**
 * 範囲の検査。問題の一覧を返す（空なら通る）。
 * single は原則の 1 コマのカード（11/7）: キーフレームは 1 つから、印はちょうど 1 つ
 */
export function validateMotion(m: MotionJson, opts: { single?: boolean } = {}): string[] {
  const errs: string[] = [];
  const ks = m?.keyframes;
  if (!Array.isArray(ks) || ks.length < (opts.single ? 1 : 2)) return [opts.single ? "キーフレームは 1 つ以上" : "キーフレームは 2 つ以上"];
  // 形の壊れたキーフレーム（figures・props が並びでない）は、先に文字で返す（中を読むと例外になる）
  const broken = ks.findIndex((k) => !k || typeof k !== "object" || !Array.isArray(k.figures) || !Array.isArray(k.props) || [...k.figures, ...k.props].some((v) => !v || typeof v !== "object"));
  if (broken >= 0) return [`keyframes[${broken}] に figures と props の並び（中身はオブジェクト）が要る`];
  if (ks[0].t !== 0) errs.push("最初のキーフレームの時刻は 0");
  ks.forEach((k, i) => {
    if (!(typeof k.t === "number" && k.t >= 0 && k.t <= MAX_DURATION)) errs.push(`keyframes[${i}].t が範囲の外（0〜${MAX_DURATION} 秒）`);
    if (i > 0 && !(k.t > ks[i - 1].t)) errs.push(`keyframes[${i}].t が前より後ではない`);
    if (k.figures.length !== ks[0].figures.length) errs.push(`keyframes[${i}] の人数が最初と違う`);
    else if (k.figures.some((f, j) => f.role !== ks[0].figures[j].role)) errs.push(`keyframes[${i}] の役が最初と違う`);
    if (k.props.length !== ks[0].props.length || k.props.some((p, j) => p.kind !== ks[0].props[j].kind || p.figure < 0 !== ks[0].props[j].figure < 0))
      errs.push(`keyframes[${i}] の小物の並びが最初と違う`);
    for (const e of validateFrameJson(k)) errs.push(`keyframes[${i}].${e}`);
  });
  const marks = ks.filter((k) => k.mark).length;
  if (opts.single) {
    if (marks !== 1) errs.push(`原則の 1 コマは印 1 か所: ${marks}`);
  } else if (marks < MARKS_MIN || marks > MARKS_MAX) errs.push(`印は ${MARKS_MIN}〜${MARKS_MAX} か所: ${marks}`);
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
      role: f.role,
      x: lerp(f.x, g.x, u),
      height: lerp(f.height, g.height, u),
      facing: f.facing,
      angles: Object.fromEntries(BONES.map((bn) => [bn, lerp(f.angles[bn], g.angles[bn], u)])) as Record<Bone, number>,
      ...(f.expression ? { expression: f.expression } : {}),
      ...(f.tired ? { tired: true } : {}),
      ...(f.lift || g.lift ? { lift: lerp(f.lift ?? 0, g.lift ?? 0, u) } : {}),
      ...(f.gaze ? { gaze: { ...f.gaze } } : {}),
    };
  });
  const props = a.props.map((p, j) => {
    const q = b.props[j];
    return { ...p, dx: lerp(p.dx, q.dx, u), dy: lerp(p.dy, q.dy, u), x: lerp(p.x, q.x, u), y: lerp(p.y, q.y, u), size: lerp(p.size, q.size, u) };
  });
  return keyToFrame({ figures: figures as Key["figures"], props });
}

/** 印の付いた時刻のコマ（時刻の順） */
export function cutFrames(m: MotionJson): { t: number; frame: Frame }[] {
  return m.keyframes.filter((k) => k.mark).map((k) => ({ t: k.t, frame: frameAt(m, k.t) }));
}

/** 再生用: fps で刻んだ各時刻の SVG（本体の画面からは呼ばない。テストで動きを確かめる道具） */
export function playSvgs(m: MotionJson, fps = 12): string[] {
  const end = m.keyframes[m.keyframes.length - 1].t;
  // 原則の 1 コマ（キーフレーム 1 つ）は、その 1 枚だけ
  const out: string[] = [];
  for (let i = 0; i <= Math.round(end * fps); i++) out.push(renderFrame(frameAt(m, i / fps)).svg);
  return out;
}
