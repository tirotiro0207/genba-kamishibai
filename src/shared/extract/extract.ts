// 仮の取り出し（004）。元の文から「やること・やらないこと・なぜ」と、それぞれの「どこから」を取り出す。
// 指示は直書き。正式なプロンプトは 021 でゼロから書き直す。
import type Anthropic from "@anthropic-ai/sdk";
import { type CallDeps, guardedCall, type Purpose } from "../claude";
import type { Claim, ClaimKind } from "../eval/score";

/** 取り出しの中身ができたら true にする。false の間は、フックは流さずに通す */
export const EXTRACT_READY = true;

export const EXTRACT_MODEL = "claude-opus-5-5";

const SYSTEM = `あなたは、現場の決まりの文から、作業員が守ることを取り出す係です。
- 渡した文だけを根拠にする。書いていないことを足さない。決まりを広げない
- do: 作業員（または文の主語）がやること。dont: やってはいけないこと。why: 理由（文に書いてあるか、文の条件からはっきり読めるときだけ）
- 1 つの項目は 1 つの行動にする。数字・条件・例外は落とさない
- span: その項目の根拠になった箇所を、渡した文からそのまま抜き出す（言い換えない。60 字まで）
- 何も無ければ空の並びにする`;

const ITEM = {
  type: "object",
  additionalProperties: false,
  required: ["text", "span"],
  properties: { text: { type: "string" }, span: { type: "string" } },
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["do", "dont", "why"],
  properties: { do: { type: "array", items: ITEM }, dont: { type: "array", items: ITEM }, why: { type: "array", items: ITEM } },
} as const;

export function extractParams(text: string, note?: string): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: EXTRACT_MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `元の文:\n${text}${note ? `\n\n注意: ${note}` : ""}` }],
  } as Anthropic.MessageCreateParamsNonStreaming;
}

type Raw = Record<ClaimKind, { text: string; span: string }[]>;

const norm = (s: string) => s.replace(/\s+/g, "");

/** 答えを Claim の並びにする。span が元の文に無い項目は spanFound を false にする */
export function parseExtraction(msg: Anthropic.Message, text: string): Array<Claim & { spanFound: boolean }> {
  if (msg.stop_reason !== "end_turn") throw new Error(`取り出しが最後まで返らなかった: ${msg.stop_reason}`);
  const raw = JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as Raw;
  const src = norm(text);
  return (["do", "dont", "why"] as const).flatMap((kind) =>
    raw[kind].map((c) => ({ kind, text: c.text, span: c.span, spanFound: c.span.length > 0 && src.includes(norm(c.span)) })),
  );
}

export async function extractClaims(deps: CallDeps, purpose: Purpose, text: string, note?: string) {
  const msg = await guardedCall(deps, { purpose, label: "取り出し", params: extractParams(text, note) });
  return parseExtraction(msg, text);
}
