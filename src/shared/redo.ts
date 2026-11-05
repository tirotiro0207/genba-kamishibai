// 枠 → 部品 → その 1 枚だけ作り直す（044b・工程 7）。
// 監修者が枠で囲んだ部分に入る絵の部品（人・小物）を選び、そのコマのキーフレームだけを作り直す。
// 変えてよいのは選んだ部品だけ（人は関節の角度と向き、小物は位置と大きさ。向きは 11/6 から）。人数・役・小物の並び・持ち手は変えないので、
// 部品 → 文 → 元の文の経路はそのまま残る。1 枚につき 5 回まで。
import type Anthropic from "@anthropic-ai/sdk";
import { partBoxes } from "./boxes";
import type { CardBody, CardPart } from "./card";
import { type GuardedDeps, guardedCall, type Purpose } from "./claude";
import type { FixBox } from "./fix";
import { MAKER_MODEL } from "./make/maker";
import { FRAME_JSON_SCHEMA, type FrameJson, type MotionJson, validateMotion } from "./picto/motion";

export const REDO_MAX = 5;
/** 枠と部品の箱がこれだけ重なれば、その部品を選ぶ（部品の箱に対する割合） */
export const REDO_OVERLAP = 0.15;

export interface Targets {
  figures: number[];
  props: number[];
  parts: string[];
}

const area = (b: FixBox) => b.w * b.h;
function overlap(a: FixBox, b: FixBox) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** 枠に入った部品。部品の箱の 15% 以上が枠と重なるものを選ぶ */
export function partsInBox(m: MotionJson, t: number, parts: CardPart[], box: FixBox): Targets {
  const hit = new Set(partBoxes(m, t, parts).filter((b) => overlap(b, box) >= REDO_OVERLAP * area(b)).map((b) => b.part));
  const chosen = parts.filter((p) => hit.has(p.id));
  const pick = (type: "figure" | "prop") => [...new Set(chosen.flatMap((p) => (p.target.type === type ? [p.target.index] : [])))].sort((a, b) => a - b);
  return { figures: pick("figure"), props: pick("prop"), parts: chosen.map((p) => p.id) };
}

/** 作り直すコマのキーフレーム（印の付いた、その時刻のもの） */
export function keyIndexAt(m: MotionJson, t: number): number {
  return m.keyframes.findIndex((k) => k.mark && Math.abs(k.t - t) < 1e-6);
}

const SYSTEM = `あなたは安全の絵カードの直し係です。絵は人形と小物を JSON で描いています。
監修者が絵の一部を枠で囲み、「ここをこうしたい」と頼みました。頼みに合うように、1 枚の絵の JSON を直して返してください。
変えてよいのは、「直してよい部品」に挙げた人の関節の角度と向き（facing の left・right。「〜の方を向いて」と頼まれたら向きを変える）と、挙げた小物の位置（dx・dy・x・y）と大きさ（size）だけです。
ほかの人・小物・役・人数・小物の並び・持ち手（figure・joint）・吹き出しの中身は、受け取ったままの値で返してください。`;

export function redoParams(key: FrameJson, targets: Targets, text: string): Anthropic.MessageCreateParamsNonStreaming {
  const list = [...targets.figures.map((i) => `figures[${i}]（${key.figures[i].role}）の関節の角度と向き`), ...targets.props.map((i) => `props[${i}]（${key.props[i].kind}）の位置と大きさ`)].join("\n");
  return {
    model: MAKER_MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: FRAME_JSON_SCHEMA } },
    messages: [{ role: "user", content: `今の絵の JSON:\n${JSON.stringify(key)}\n\n直してよい部品:\n${list}\n\n監修者の頼み: ${text}` }],
  } as Anthropic.MessageCreateParamsNonStreaming;
}

/** AI の返した絵から、選んだ部品の値だけを取り込む。ほかは元のまま */
export function mergeRedo(m: MotionJson, keyIndex: number, got: FrameJson, targets: Targets): MotionJson {
  const old = m.keyframes[keyIndex];
  const key = {
    ...old,
    figures: old.figures.map((f, j) => {
      const g = got.figures?.[j];
      if (!targets.figures.includes(j) || !g) return f;
      const facing = g.facing === "left" || g.facing === "right" ? g.facing : f.facing;
      return { ...f, facing, angles: g.angles ? { ...f.angles, ...g.angles } : f.angles };
    }),
    props: old.props.map((p, j) => {
      const g = got.props?.[j];
      return targets.props.includes(j) && g ? { ...p, dx: g.dx, dy: g.dy, x: g.x, y: g.y, size: g.size } : p;
    }),
  };
  return { keyframes: m.keyframes.map((k, i) => (i === keyIndex ? key : k)) };
}

export interface Redone {
  body: CardBody;
  targets: Targets;
  keyIndex: number;
}

/** その 1 枚を作り直す。枠に部品が無い・形が壊れたときは投げる（回数は数えない） */
export async function redoCard(deps: GuardedDeps, purpose: Purpose, body: CardBody, frame: number, box: FixBox, text: string): Promise<Redone> {
  if (body.motion.kind !== "keyframes") throw new RedoError("動きの HTML のカードは、部品ごとに作り直せない", 400);
  const m = body.motion.json;
  const t = body.frames[frame]?.t;
  const keyIndex = t === undefined ? -1 : keyIndexAt(m, t);
  if (keyIndex < 0) throw new RedoError("そのコマのキーフレームが無い", 400);
  const targets = partsInBox(m, t!, body.parts, box);
  if (!targets.figures.length && !targets.props.length) throw new RedoError("枠の中に絵の部品が無い。部品を囲んで送り直す", 400);
  const msg = await guardedCall(deps, { purpose, label: "その 1 枚の作り直し", params: redoParams(m.keyframes[keyIndex], targets, text) });
  if (msg.stop_reason !== "end_turn") throw new RedoError(`作り直しが最後まで返らなかった: ${msg.stop_reason}`, 502);
  const got = JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as FrameJson;
  const json = mergeRedo(m, keyIndex, got, targets);
  const errs = validateMotion(json);
  if (errs.length) throw new RedoError(`作り直した絵が範囲の外: ${errs.slice(0, 3).join(" / ")}`, 502);
  return { body: { ...body, motion: { kind: "keyframes", json } }, targets, keyIndex };
}

export class RedoError extends Error {
  constructor(
    message: string,
    public status: 400 | 502,
  ) {
    super(message);
  }
}
