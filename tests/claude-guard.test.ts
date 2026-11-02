import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { BudgetExceededError, DEFAULT_LIMITS, guardedCall, MemoryCallLog, startOfJstDay } from "../src/shared/claude";

function client(script: Array<number | "ok">) {
  let i = 0;
  const calls = { n: 0 };
  return {
    calls,
    messages: {
      create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
        calls.n++;
        const step = script[Math.min(i++, script.length - 1)];
        if (step !== "ok") throw Object.assign(new Error(`status ${step}`), { status: step });
        return { model: p.model, content: [], usage: { input_tokens: 100, output_tokens: 10 } } as unknown as Anthropic.Message;
      },
    },
  };
}

const params = { model: "claude-sonnet-5-5", max_tokens: 1000, messages: [{ role: "user" as const, content: "テスト" }] };
const NOW = Date.parse("2026-11-02T06:00:00Z"); // 日本時間 15:00

describe("費用の上限と呼び直し（002b）", () => {
  it("1 回の上限を超える見込みなら、呼ぶ前に止まる", async () => {
    const c = client(["ok"]);
    const log = new MemoryCallLog();
    const big = { ...params, max_tokens: 100_000 }; // 出力だけで 1 USD
    await expect(guardedCall({ client: c, log, now: () => NOW }, { purpose: "demo", label: "x", params: big })).rejects.toBeInstanceOf(BudgetExceededError);
    expect(c.calls.n).toBe(0);
    expect(log.records).toHaveLength(0);
  });

  it("その日の合計が上限に届いていたら止まり、前の日の分は数えない", async () => {
    const log = new MemoryCallLog();
    const rec = { purpose: "demo" as const, label: "x", model: "claude-sonnet-5-5", inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, ms: 0, ok: true };
    log.records.push({ ...rec, at: "2026-11-01T14:00:00.000Z", usd: 4.99 }); // 日本時間 11/1 23:00
    const c = client(["ok"]);
    await guardedCall({ client: c, log, now: () => NOW }, { purpose: "demo", label: "x", params });
    expect(c.calls.n).toBe(1);
    log.records.push({ ...rec, at: "2026-11-02T01:00:00.000Z", usd: DEFAULT_LIMITS.demo.perDayUsd });
    await expect(guardedCall({ client: c, log, now: () => NOW }, { purpose: "demo", label: "x", params })).rejects.toMatchObject({ which: "perDay" });
  });

  it("全体の上限は用途ごとに別に数える", async () => {
    const log = new MemoryCallLog();
    log.records.push({ at: "2026-10-30T00:00:00.000Z", purpose: "mcp", label: "x", model: "claude-sonnet-5-5", inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, usd: 30, ms: 0, ok: true });
    await expect(guardedCall({ client: client(["ok"]), log, now: () => NOW }, { purpose: "mcp", label: "x", params })).rejects.toMatchObject({ which: "total" });
    await expect(guardedCall({ client: client(["ok"]), log, now: () => NOW }, { purpose: "hook", label: "x", params })).resolves.toBeDefined();
  });

  it("429 と 529 は待ち時間を延ばしながら呼び直し、呼び直しも 1 回ずつ記録に残る", async () => {
    const waits: number[] = [];
    const log = new MemoryCallLog();
    const c = client([429, 529, "ok"]);
    await guardedCall({ client: c, log, now: () => NOW, sleep: async (ms) => void waits.push(ms) }, { purpose: "night", label: "x", params });
    expect(waits).toEqual([1000, 2000]);
    expect(log.records.map((r) => r.ok)).toEqual([false, false, true]);
  });

  it("400 は呼び直さない。呼び直しは回数の上限で止まる", async () => {
    const log = new MemoryCallLog();
    await expect(guardedCall({ client: client([400]), log, now: () => NOW, sleep: async () => {} }, { purpose: "night", label: "x", params })).rejects.toMatchObject({ status: 400 });
    expect(log.records).toHaveLength(1);
    const c = client([429]);
    await expect(guardedCall({ client: c, log, now: () => NOW, sleep: async () => {}, maxAttempts: 3 }, { purpose: "night", label: "x", params })).rejects.toMatchObject({ status: 429 });
    expect(c.calls.n).toBe(3);
  });

  it("日本時間の日の始まり", () => {
    expect(startOfJstDay(NOW)).toBe("2026-11-01T15:00:00.000Z");
  });
});
