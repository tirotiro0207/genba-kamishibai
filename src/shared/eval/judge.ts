// 正解と答えを組にする AI の判定（003a）。数えるのは score.ts。
import type Anthropic from "@anthropic-ai/sdk";
import type { Claim, Judgement } from "./score";

export const JUDGE_MODEL = "claude-sonnet-5-5";

const SYSTEM = `あなたは、安全の決まりの取り出しを採点する係です。
「正解」と「答え」は、どちらも「やること(do)・やらないこと(dont)・なぜ(why)」の並びです。
同じことを言っている正解と答えを組にしてください。1 つの正解は 1 つの答えとだけ組にします。
- same: 意味が同じ
- wording: 意味は同じだが、言い方や細かさが違う（条件の一部が落ちている等、危なくないもの）
- dangerous: 組にはなるが、その答えのとおりに動くと危ない（逆の意味・数字の取り違え・条件の取り違えなど）
どの正解とも組にならない答えのうち、そのとおりに動くと危ないものは dangerousExtras に番号を入れてください。
do と dont の向きが逆でも、同じ行動を言っていれば組にしてよい。`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pairs", "dangerousExtras"],
  properties: {
    pairs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["gold", "pred", "verdict"],
        properties: { gold: { type: "integer" }, pred: { type: "integer" }, verdict: { type: "string", enum: ["same", "wording", "dangerous"] } },
      },
    },
    dangerousExtras: { type: "array", items: { type: "integer" } },
  },
} as const;

const list = (cs: Claim[]) => cs.map((c, i) => `${i}. [${c.kind}] ${c.text}`).join("\n") || "（なし）";

export function judgeParams(gold: Claim[], pred: Claim[]): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: JUDGE_MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `正解:\n${list(gold)}\n\n答え:\n${list(pred)}` }],
  } as Anthropic.MessageCreateParamsNonStreaming;
}

export function parseJudgement(msg: Anthropic.Message): Judgement {
  if (msg.stop_reason !== "end_turn") throw new Error(`判定が最後まで返らなかった: ${msg.stop_reason}`);
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return JSON.parse(text) as Judgement;
}
