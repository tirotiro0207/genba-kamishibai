// 仮の確かめる AI（007）。文を渡さず絵だけを Opus に見せ、日本語の読めない新入社員の役で意味を答えさせる。
// そのあと別の呼び出しで、元の決まりと受け取り方を比べて点を出す。赤なら 1 回だけ作り直す。
import type Anthropic from "@anthropic-ai/sdk";
import { type GuardedDeps, guardedCall, type Purpose } from "../claude";
import { decidePose } from "../pose/angles";
import type { Pose } from "../pose/schema";

export const VERIFY_MODEL = "claude-opus-5-5";
/** 点がこれ未満、または危ない読み違いなら赤 */
export const RED_BELOW = 60;

const READER_SYSTEM = `あなたは外国から日本に来て、日本の電気工事の会社に入ったばかりの新入社員です。日本語の文字は読めません。
現場で 1 枚の絵のカードを見せられました。絵だけを見て、このカードが作業員に何をするように（または、しないように）
伝えているかを答えてください。分からないところは、分からないと書いてください。答えは日本語で。`;

const READER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["meaning", "do", "dont", "why_guess", "confidence"],
  properties: {
    meaning: { type: "string" },
    do: { type: "string" },
    dont: { type: ["string", "null"] },
    why_guess: { type: ["string", "null"] },
    confidence: { type: "integer" },
  },
} as const;

const MATCH_SYSTEM = `あなたは安全の採点係です。決まりと、絵だけを見た新入社員の受け取り方を比べます。
score: 受け取り方が「守ること」（と、あれば「なぜ」）にどれだけ合っているか。0〜100 の整数
dangerous: 受け取り方のとおりに動くと、危ない行為をしてよいと読める（逆の意味に取った等）なら true`;

const MATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "dangerous", "reason"],
  properties: { score: { type: "integer" }, dangerous: { type: "boolean" }, reason: { type: "string" } },
} as const;

export interface Reading {
  meaning: string;
  do: string;
  dont: string | null;
  why_guess: string | null;
  confidence: number;
}
export interface Match {
  score: number;
  dangerous: boolean;
  reason: string;
}
export type ImageBlock = { type: "image"; source: { type: "base64"; media_type: "image/png"; data: string } };

function jsonParams(system: string, schema: object, content: Anthropic.MessageParam["content"], maxTokens: number) {
  return {
    model: VERIFY_MODEL,
    max_tokens: maxTokens,
    system,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  } as Anthropic.MessageCreateParamsNonStreaming;
}

/** 絵だけを渡す依頼。文・決まり・ファイル名は入れない */
export function readerParams(image: ImageBlock) {
  return jsonParams(READER_SYSTEM, READER_SCHEMA, [image, { type: "text", text: "この絵のカードは何を伝えていますか。" }], 16000);
}

export function matchParams(rule: string, why: string | undefined, reading: Reading) {
  const text = `決まり: ${rule}\nなぜ: ${why || "（書いていない）"}\n\n新入社員の受け取り方: ${JSON.stringify(reading)}`;
  return jsonParams(MATCH_SYSTEM, MATCH_SCHEMA, [{ type: "text", text }], 4000);
}

function parseJson<T>(msg: Anthropic.Message, what: string): T {
  if (msg.stop_reason !== "end_turn") throw new Error(`${what}が最後まで返らなかった: ${msg.stop_reason}`);
  return JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as T;
}

export const isRed = (m: Match) => m.score < RED_BELOW || m.dangerous;

export interface Attempt {
  pose: Pose;
  reading: Reading;
  match: Match;
  red: boolean;
}

export interface CardDeps extends GuardedDeps {
  /** 姿勢から確かめる AI に渡す画像を作る（Node では SVG → PNG） */
  draw: (pose: Pose) => ImageBlock;
}

/** 1 枚を通す: 角度 → 絵 → 絵だけで読む → 照合。赤なら前の受け取り方を渡して 1 回だけ作り直す */
export async function runCard(deps: CardDeps, purpose: Purpose, rule: string, why?: string): Promise<Attempt[]> {
  const attempts: Attempt[] = [];
  let pose = await decidePose(deps, purpose, rule, why);
  for (let i = 0; i < 2; i++) {
    const reading = parseJson<Reading>(await guardedCall(deps, { purpose, label: "確かめる AI", params: readerParams(deps.draw(pose)) }), "絵の読み");
    const match = parseJson<Match>(await guardedCall(deps, { purpose, label: "照合", params: matchParams(rule, why, reading) }), "照合");
    attempts.push({ pose, reading, match, red: isRed(match) });
    if (!isRed(match) || i === 1) break;
    pose = await decidePose(deps, purpose, rule, why, `絵だけを見た人は「${reading.meaning}」と受け取った。採点の理由: ${match.reason}`);
  }
  return attempts;
}
