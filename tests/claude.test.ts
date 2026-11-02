import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { callClaude, costUsd, MemoryCallLog } from "../src/shared/claude";

function fake(usage: Partial<Anthropic.Usage>, fail?: Error) {
  return {
    messages: {
      create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
        if (fail) throw fail;
        return { model: p.model, content: [], usage: { input_tokens: 0, output_tokens: 0, ...usage } } as unknown as Anthropic.Message;
      },
    },
  } as never;
}

const params = { model: "claude-opus-5-5", max_tokens: 100, messages: [] };

describe("API を呼ぶ共通部品（002）", () => {
  it("呼ぶたびに、モデル・入出力トークン・費用・時間を 1 行残す", async () => {
    const log = new MemoryCallLog();
    let t = 1_000;
    const deps = { client: fake({ input_tokens: 2000, output_tokens: 300, cache_read_input_tokens: 1000 }), log, now: () => (t += 250) };
    await callClaude(deps, { purpose: "measure", label: "取り出し", params });
    await callClaude(deps, { purpose: "measure", label: "取り出し", params });
    expect(log.records).toHaveLength(2);
    const r = log.records[0];
    expect(r).toMatchObject({ model: "claude-opus-5-5", inputTokens: 2000, outputTokens: 300, cacheReadTokens: 1000, ms: 250, ok: true });
    expect(r.usd).toBeCloseTo((2000 * 4 + 300 * 20 + 1000 * 0.2) / 1e6, 12);
  });

  it("失敗しても 1 行残し、エラーはそのまま投げる", async () => {
    const log = new MemoryCallLog();
    await expect(callClaude({ client: fake({}, new Error("boom")), log }, { purpose: "hook", label: "x", params })).rejects.toThrow("boom");
    expect(log.records).toHaveLength(1);
    expect(log.records[0]).toMatchObject({ ok: false, usd: 0 });
  });

  it("単価の無いモデルは費用を出せず止まる", () => {
    expect(() => costUsd("unknown-model", { input_tokens: 1, output_tokens: 1 } as Anthropic.Usage)).toThrow();
  });
});
