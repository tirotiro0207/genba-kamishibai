// 作成（034a）のテスト用の偽の client。動きは tests/fixtures/card の MOTION、経路は部品ごとに s1 を指す
import type Anthropic from "@anthropic-ai/sdk";
import { isScriptCall, MOTION, scriptReply } from "./card";

export function fakeMaker(opts: { dropPart?: boolean; why?: string | null } = {}) {
  const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const scripts: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let n = 0;
  return {
    sent,
    scripts,
    messages: {
      create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
        // 脚本の段（11/5）は先に 1 回。sent には絵の数字の段だけを積む
        if (isScriptCall(p.system)) {
          scripts.push(p);
          return { model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(scriptReply(p.system)) }], usage: { input_tokens: 1000, output_tokens: 800 } } as unknown as Anthropic.Message;
        }
        sent.push(p);
        const parts = [
          { type: "figure", index: 0, statement: "s1", reason: "確かめる人" },
          { type: "prop", index: 0, statement: "s1", reason: "検電器" },
          { type: "prop", index: 1, statement: "s1", reason: "盤" },
        ];
        if (opts.dropPart && n++ === 0) parts.pop();
        const text = JSON.stringify({ motion: MOTION, parts, why: opts.why ?? null });
        return { model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text }], usage: { input_tokens: 3000, output_tokens: 2000 } } as unknown as Anthropic.Message;
      },
    },
  };
}
