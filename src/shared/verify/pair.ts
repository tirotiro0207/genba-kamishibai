// 新人役の試しの「○× の 2 枚の組」（11/6）。同じ決まりの × のカード（してはいけないこと）と ○ のカード（すること）を、
// 続けて 1 回で読ませる。1 枚だけでは見えにくい「早く」「誰に」のような比べて分かる中身を、2 枚の違いから読めるかを見る。
// 読む段は 1 回（2 枚のコマを通しの番号で渡す。どちらが ○ かは言わない）、照らす段はカードごとに 1 回ずつ（それぞれのカードの文と照らす）。
// 合格は 2 枚とも伝わる率 85 以上・危ない取り違え無し（drop.ts と同じ目安）。
import type Anthropic from "@anthropic-ai/sdk";
import type { CardBody } from "../card";
import { type GuardedDeps, guardedCall, type Purpose } from "../claude";
import { passes } from "./drop";
import { type Evidence, evidenceOf, type FormalReading, judgeParams, readParams } from "./formal";
import type { ImageBlock } from "./verify";

export interface PairSide {
  card: CardBody;
  images: ImageBlock[];
}

export interface PairCheck {
  /** 2 枚を続けて読んだ 1 回の受け取り方 */
  reading: FormalReading;
  /** 見せた順のカードごとの証拠。コマの番号は 2 枚の通しの番号 */
  evidence: Evidence[];
  pass: boolean;
}

/** ① 2 枚のコマを通しの番号で渡す。カードの文・○× の別は入れない（絵の中の印は見える） */
export function pairReadParams(sides: ImageBlock[][]): Anthropic.MessageCreateParamsNonStreaming {
  const p = readParams(sides.flat());
  let n = 0;
  const content: Anthropic.ContentBlockParam[] = sides.flatMap((imgs, c) =>
    imgs.flatMap((img, i) => [{ type: "text" as const, text: `${c + 1} 枚目のカード・${i + 1} コマ目（通しの ${++n} コマ目）` }, img]),
  );
  content.push({
    type: "text",
    text: `${sides.length} 枚のカードを続けて見せました（全部で ${n} コマ）。同じ現場の、違う場合を描いた組です。frames の frame は通しの番号で答えてください。2 枚を比べて、作業員に何をするように（または、しないように）伝えているか、なぜかを答えてください。`,
  });
  return { ...p, messages: [{ role: "user", content }] };
}

const json = <T>(msg: Anthropic.Message, what: string): T => {
  if (msg.stop_reason !== "end_turn") throw new Error(`${what}が最後まで返らなかった: ${msg.stop_reason}`);
  return JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as T;
};

/** 2 枚を続けて 1 回読ませ、カードごとにその文と照らす */
export async function verifyPair(deps: GuardedDeps, purpose: Purpose, sides: PairSide[]): Promise<PairCheck> {
  if (sides.length !== 2 || sides.some((s) => s.images.length < 1)) throw new Error("○× の組は 2 枚で、どちらにもコマが要る");
  const total = sides.reduce((a, s) => a + s.images.length, 0);
  const reading = json<FormalReading>(
    await guardedCall(deps, { purpose, label: "確かめる AI（○× の組・読む）", params: pairReadParams(sides.map((s) => s.images)) }),
    "組の絵の読み",
  );
  const evidence: Evidence[] = [];
  for (const s of sides) {
    const j = json<Parameters<typeof evidenceOf>[3]>(
      await guardedCall(deps, { purpose, label: "確かめる AI（○× の組・照らす）", params: judgeParams(s.card.statements, reading) }),
      "照らし合わせ",
    );
    evidence.push(evidenceOf(s.card, total, reading, j));
  }
  return { reading, evidence, pass: evidence.every(passes) };
}
