import type Anthropic from "@anthropic-ai/sdk";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { callClaude } from "../shared/claude";
import { D1CallLog } from "./api-log";

const fakeClient = (usage: Partial<Anthropic.Usage>) => ({
  messages: {
    create: async (p: Anthropic.MessageCreateParamsNonStreaming) =>
      ({ model: p.model, content: [], usage: { input_tokens: 0, output_tokens: 0, ...usage } }) as unknown as Anthropic.Message,
  },
});

describe("呼び出しの記録を D1 に残す（002）", () => {
  it("1 回呼ぶと api_calls に 1 行増え、費用の合計が出る", async () => {
    const log = new D1CallLog(env.DB);
    await callClaude(
      { client: fakeClient({ input_tokens: 1000, output_tokens: 500 }) as never, log },
      { purpose: "hook", label: "t", params: { model: "claude-sonnet-5-5", max_tokens: 10, messages: [] } },
    );
    const n = await env.DB.prepare("SELECT count(*) AS n FROM api_calls").first<{ n: number }>();
    expect(n?.n).toBe(1);
    expect(await log.sumUsd("hook")).toBeCloseTo((1000 * 2 + 500 * 10) / 1e6, 9);
    expect(await log.sumUsd("night")).toBe(0);
  });
});
