// 言葉で直す（11/6）。監修者・作者が口語で「1 コマ目を作業している場面に替えて、への字の顔にして…」と頼むと、
// 今のカードの絵の JSON と文と頼みを作成の係（MAKER_MODEL）に渡し、絵の JSON（motion）と部品の経路（parts）を作り直させる。
// 部品を枠で囲む作り直し（redo.ts）と違い、カード全体なら人数・小物・コマの数も変えてよい。1 コマだけのときは、そのコマのキーフレームだけを取り込む。
// 作り直しの土台は作成と同じ決まり（makerParams。作者の直しの教訓も入る）。脚本は使わない（11/6 に脚本なしの作り方へ戻したため）。1 枚につき 5 回まで。
import type Anthropic from "@anthropic-ai/sdk";
import type { CardBody, CardPart } from "./card";
import { validateCard } from "./card";
import { type GuardedDeps, guardedCall, type Purpose } from "./claude";
import { edgeErrors, makerParams, type OkRule } from "./make/maker";
import type { MotionJson } from "./picto/motion";
import { keyIndexAt } from "./redo";

export const REWORK_MAX = 5;
export const REWORK_TEXT_MAX = 2000;

/** 作り直しの係の答え（作成と同じ形） */
export interface ReworkOut {
  motion: MotionJson;
  parts: { type: "figure" | "prop"; index: number; statement: string; reason: string }[];
  why?: string | null;
}

const RULE_ALL = `
これは新しく描くのではなく、今あるカードの直しです。下の「今の絵」を元に、頼みどおりに直してください。
頼みに無いところは今の絵のまま残す。頼みで人数・小物・コマの数が変わるときは変えてよい（コマは印 mark: true の数）。
部品の経路（parts）は、直したあとの絵の人と小物の 1 つずつについて書き直す。`;

const RULE_FRAME = (n: number, k: number) => `
これは新しく描くのではなく、今あるカードの直しです。下の「今の絵」を元に、頼みどおりに直してください。
直すのは ${n} コマ目（keyframes[${k}]）だけ。ほかのキーフレームは受け取った値のまま返す。時刻 t と印 mark も変えない。
人数と役、今ある小物の並び（kind と、人物に付けるかキャンバスに置くか）は変えない。このコマに小物を足すときは props の最後に足し、
ほかのキーフレームでは同じ小物を show: false にする。parts は今の経路をそのまま返し、足した小物の分だけ足す。`;

/** カードから作成の係に渡す決まりの 1 項目を組み立てる（してはいけないことかは文から分からないので、決まりの文のまま渡す） */
export function ruleOf(body: CardBody): OkRule {
  const keys = body.motion.kind === "keyframes" ? body.motion.json.keyframes : [];
  const checklist = keys.some((k) => k.props.some((p) => p.kind === "checklist"));
  return { kind: "do", text: body.rule, from: { quote: body.rule, line: 0, line_end: 0, found: false }, reasons: [], checklist, reworded: false };
}

/** 作り直しに渡す中身。frame が null ならカード全体、数字ならそのコマだけ。fix は前の答えの形の誤り */
export function reworkParams(body: CardBody, text: string, frame: number | null, fix?: string): Anthropic.MessageCreateParamsNonStreaming {
  if (body.motion.kind !== "keyframes") throw new ReworkError("動きの HTML のカードは、言葉で直せない", 400);
  const m = body.motion.json;
  const base = makerParams(ruleOf(body), body.statements, fix);
  const k = frame === null ? -1 : keyIndexAt(m, body.frames[frame]?.t ?? -1);
  const now = `今の絵（このカードの絵の JSON。コマは ${body.frames.length} 枚）:\n${JSON.stringify({ motion: m, parts: body.parts.map((p) => ({ ...p.target, statement: p.statement, reason: p.reason })) })}`;
  const scope = frame === null ? "直す範囲: カード全体" : `直す範囲: ${frame + 1} コマ目だけ（keyframes[${k}]）`;
  const first = base.messages[0].content as string;
  return {
    ...base,
    system: `${base.system as string}${frame === null ? RULE_ALL : RULE_FRAME(frame + 1, k)}`,
    messages: [{ role: "user", content: `${first}\n\n${now}\n\n${scope}\n\n頼み: ${text}` }],
  } as Anthropic.MessageCreateParamsNonStreaming;
}

const toParts = (got: ReworkOut["parts"], from = 0): CardPart[] => got.map((p, j) => ({ id: `p${from + j + 1}`, target: { type: p.type, index: p.index }, statement: p.statement, reason: p.reason }));

/** カード全体の直し: 絵と経路は答えのまま、文（守ること・なぜ・言葉）は元のまま。脚本は今の絵と合わなくなるので外す */
export function takeAll(body: CardBody, got: ReworkOut): CardBody {
  const { script: _drop, ...rest } = body;
  return { ...rest, motion: { kind: "keyframes", json: got.motion }, frames: (got.motion?.keyframes ?? []).filter((k) => k.mark).map((k) => ({ t: k.t })), parts: toParts(got.parts ?? []) };
}

/**
 * 1 コマだけの直しの取り込み方:
 * - 取り込むのは、そのコマのキーフレーム 1 つだけ（時刻と印は元のまま）。ほかのキーフレームは元の値を 1 つも変えない
 * - 人数・役・今ある小物の並びが変わっていたら取り込まない（投げて直させる）
 * - そのコマに足した小物（props の最後に足したもの）は、ほかのキーフレームでは答えの値にかかわらず show: false で足す（ほかのコマの絵を変えない）
 * - 経路は元のまま、足した小物の分だけ答えから足す
 */
export function takeFrame(body: CardBody, keyIndex: number, got: ReworkOut): CardBody {
  if (body.motion.kind !== "keyframes") throw new ReworkError("動きの HTML のカードは、言葉で直せない", 400);
  const m = body.motion.json;
  const old = m.keyframes[keyIndex];
  const gk = got.motion?.keyframes ?? [];
  const key = gk.length === m.keyframes.length ? gk[keyIndex] : gk.find((k) => k.mark && Math.abs(k.t - old.t) < 1e-6);
  if (!key) throw new ShapeError([`${keyIndex} 番目のキーフレーム（直すコマ）が答えに無い`]);
  const errs: string[] = [];
  if (key.figures.length !== old.figures.length || key.figures.some((f, j) => f.role !== old.figures[j].role)) errs.push("1 コマだけ直すときは、人数と役を変えない");
  if (key.props.length < old.props.length || old.props.some((p, j) => key.props[j].kind !== p.kind || key.props[j].figure < 0 !== p.figure < 0))
    errs.push("1 コマだけ直すときは、今ある小物の並び（kind と置き場）を変えない。足す小物は props の最後に足す");
  if (errs.length) throw new ShapeError(errs);
  const added = key.props.slice(old.props.length);
  const keyframes = m.keyframes.map((k, i) => {
    if (i === keyIndex) return { ...key, t: old.t, mark: old.mark };
    return { ...k, props: [...k.props, ...added.map((p) => ({ ...p, show: false }))] };
  });
  const newParts = (got.parts ?? []).filter((p) => p.type === "prop" && p.index >= old.props.length);
  return { ...body, motion: { kind: "keyframes", json: { keyframes } }, parts: [...body.parts, ...toParts(newParts, body.parts.length)] };
}

/** 形の検査。1 コマだけのときは、端で切れる人はそのコマだけを見る（ほかのコマは元のまま残すので） */
export function reworkErrors(card: CardBody, frame: number | null): string[] {
  const errs = validateCard(card);
  if (errs.length || card.motion.kind !== "keyframes") return errs;
  const edge = edgeErrors(card.motion.json);
  return frame === null ? edge : edge.filter((e) => e.startsWith(`${frame + 1} コマ目`));
}

export interface Reworked {
  body: CardBody;
  /** 作り直しの係を呼んだ回数（1 か 2） */
  calls: number;
}

/** 言葉で直す。形が壊れていたら中身を渡して 1 回だけ直させ、2 回とも駄目なら 502 で投げる（回数は呼ぶ側が数える） */
export async function reworkCard(deps: GuardedDeps, purpose: Purpose, body: CardBody, text: string, frame: number | null): Promise<Reworked> {
  if (body.motion.kind !== "keyframes") throw new ReworkError("動きの HTML のカードは、言葉で直せない", 400);
  const req = text.trim();
  if (!req) throw new ReworkError("頼みが空", 400);
  let keyIndex = -1;
  if (frame !== null) {
    keyIndex = Number.isInteger(frame) && frame >= 0 && frame < body.frames.length ? keyIndexAt(body.motion.json, body.frames[frame].t) : -1;
    if (keyIndex < 0) throw new ReworkError("そのコマが無い", 400);
  }
  let fix: string | undefined;
  for (let i = 0; i < 2; i++) {
    const msg = await guardedCall(deps, { purpose, label: frame === null ? "言葉で直す（カード全体）" : "言葉で直す（1 コマ）", params: reworkParams(body, req, frame, fix) });
    let errs: string[];
    try {
      if (msg.stop_reason !== "end_turn") throw new ShapeError([`最後まで返らなかった: ${msg.stop_reason}`]);
      const got = JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as ReworkOut;
      const card = frame === null ? takeAll(body, got) : takeFrame(body, keyIndex, got);
      errs = reworkErrors(card, frame);
      if (!errs.length) return { body: card, calls: i + 1 };
    } catch (e) {
      if (e instanceof ShapeError) errs = e.errors;
      else if (e instanceof SyntaxError) errs = ["答えが JSON ではない"];
      else throw e;
    }
    fix = errs.slice(0, 6).join(" / ");
  }
  throw new ReworkError(`作り直した絵が 2 回とも形か経路が足りない: ${fix}`, 502);
}

class ShapeError extends Error {
  constructor(public errors: string[]) {
    super(errors.join(" / "));
  }
}

export class ReworkError extends Error {
  constructor(
    message: string,
    public status: 400 | 502,
  ) {
    super(message);
  }
}
