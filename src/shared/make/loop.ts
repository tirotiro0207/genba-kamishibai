// 直しのループ（034b・工程 5）。作った下書きのコマを、確かめる AI（仮版・007）に絵だけ順に見せて採点し、
// 赤なら、どう読まれたかを渡して作り直す。作り直しの回数の上限は用途ごとに決め、呼ぶ側が変えられる。夜間は 0。
// 正式な確かめる AI（047）に差し替えるまでの仮の採点。
import type Anthropic from "@anthropic-ai/sdk";
import type { CardBody } from "../card";
import { type GuardedDeps, guardedCall, type Purpose } from "../claude";
import type { Frame } from "../picto/scene";
import { cutFrames } from "../picto/motion";
import { type ImageBlock, isRed, type Match, matchParams, type Reading, readerParams } from "../verify/verify";
import { type Locate, makeCard, type OkRule } from "./maker";

/** 作り直しの回数の上限（用途ごと）。夜間は 0（作り直しは監修者の画面で） */
export const MAX_FIXES: Record<Purpose, number> = { night: 0, app: 2, demo: 1, mcp: 1, hook: 0, measure: 2 };

export interface Check {
  card: CardBody;
  reading: Reading;
  match: Match;
  red: boolean;
}

/** コマを順に並べて、絵だけを読ませる依頼（文・決まり・ファイル名は入れない） */
export function framesReaderParams(images: ImageBlock[]): Anthropic.MessageCreateParamsNonStreaming {
  const p = readerParams(images[0]);
  const content: Anthropic.ContentBlockParam[] = [...images, { type: "text", text: `この ${images.length} コマの絵のカード（左から順に起きること）は、何を伝えていますか。` }];
  return { ...p, messages: [{ role: "user", content }] };
}

const json = <T>(msg: Anthropic.Message, what: string): T => {
  if (msg.stop_reason !== "end_turn") throw new Error(`${what}が最後まで返らなかった: ${msg.stop_reason}`);
  return JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as T;
};

export async function checkCard(deps: GuardedDeps, purpose: Purpose, card: CardBody, render: (f: Frame) => ImageBlock): Promise<Check> {
  if (card.motion.kind !== "keyframes") throw new Error("確かめるのはキーフレームの動きだけ（HTML の動きはコマの PNG を渡す形にする）");
  const images = cutFrames(card.motion.json).map(({ frame }) => render(frame));
  const reading = json<Reading>(await guardedCall(deps, { purpose, label: "確かめる AI（コマ）", params: framesReaderParams(images) }), "絵の読み");
  const match = json<Match>(await guardedCall(deps, { purpose, label: "照合", params: matchParams(card.rule, card.why, reading) }), "照合");
  return { card, reading, match, red: isRed(match) };
}

export interface LoopOptions {
  render: (f: Frame) => ImageBlock;
  /** 作り直しの回数の上限。無ければ MAX_FIXES[purpose] */
  maxFixes?: number;
}

/** 作る → 確かめる → 赤なら作り直す。全部の試し（最後が使う下書き）を返す */
export async function makeAndCheck(deps: GuardedDeps, purpose: Purpose, rule: OkRule, locate: Locate, opts: LoopOptions): Promise<Check[]> {
  const max = opts.maxFixes ?? MAX_FIXES[purpose];
  const checks: Check[] = [];
  let feedback: string | undefined;
  for (let i = 0; i <= max; i++) {
    const { card } = await makeCard(deps, purpose, rule, locate, feedback);
    const c = await checkCard(deps, purpose, card, opts.render);
    checks.push(c);
    if (!c.red) break;
    feedback = `絵だけを見た人は「${c.reading.meaning}」と受け取った（${c.match.score} 点${c.match.dangerous ? "・危ない読み違い" : ""}）。採点の理由: ${c.match.reason}`;
  }
  return checks;
}
