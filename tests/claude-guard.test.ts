import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileCallLog } from "../src/node/file-log";
import { type BudgetEvent, BudgetExceededError, DEFAULT_LIMITS, dayBudgetUsd, guardedCall, MemoryCallLog, notifyBudget, resetBudgetWarnings, startOfJstDay } from "../src/shared/claude";

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

describe("全部の用途を合わせた 1 日の上限", () => {
  const rec = { label: "x", model: "claude-opus-5-5", inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, ms: 0, ok: true };
  const at = "2026-11-02T01:00:00.000Z"; // 日本時間 11/2 10:00

  it("上限は環境変数から読み、無いか数でなければ 10", () => {
    expect(dayBudgetUsd({})).toBe(10);
    expect(dayBudgetUsd({ API_BUDGET_USD_PER_DAY: "25" })).toBe(25);
    expect(dayBudgetUsd({ API_BUDGET_USD_PER_DAY: "abc" })).toBe(10);
    expect(dayBudgetUsd({ API_BUDGET_USD_PER_DAY: "0" })).toBe(10);
  });

  it("用途ごとには上限の内でも、全部を足して超えるなら呼ばずに止まり、1 回知らせる", async () => {
    const log = new MemoryCallLog();
    // 絵の試し 7・取り出し 2.4・作成 0.6（どの用途も、用途ごとの 1 日の上限より下）
    log.records.push({ ...rec, at, purpose: "measure", usd: 7 }, { ...rec, at, purpose: "hook", usd: 2.4 }, { ...rec, at, purpose: "app", usd: 0.6 });
    const events: BudgetEvent[] = [];
    const c = client(["ok"]);
    const deps = { client: c, log, now: () => NOW, dayBudgetUsd: 10, onBudget: (e: BudgetEvent) => void events.push(e) };
    await expect(guardedCall(deps, { purpose: "demo", label: "y", params })).rejects.toMatchObject({ which: "allPerDay" });
    expect(c.calls.n).toBe(0);
    expect(events.map((e) => [e.kind, Math.round(e.spentUsd * 10) / 10])).toEqual([["stop", 10]]);
    // 前の日の分は数えない
    expect(await guardedCall({ ...deps, now: () => NOW + 86_400_000 }, { purpose: "demo", label: "y", params })).toBeDefined();
  });

  it("8 割を超えたら、その日に 1 回だけ警告して呼ぶ", async () => {
    resetBudgetWarnings();
    const log = new MemoryCallLog();
    log.records.push({ ...rec, at, purpose: "measure", usd: 8.1 });
    const events: BudgetEvent[] = [];
    const deps = { client: client(["ok"]), log, now: () => NOW, dayBudgetUsd: 10, onBudget: (e: BudgetEvent) => void events.push(e) };
    await guardedCall(deps, { purpose: "app", label: "y", params });
    await guardedCall(deps, { purpose: "app", label: "y", params });
    expect(events.map((e) => e.kind)).toEqual(["warn"]);
  });

  it("知らせは夜のメモに 1 行足される", () => {
    const file = join(mkdtempSync(join(tmpdir(), "budget-")), "notes.md");
    const old = process.env.OVERNIGHT_NOTES;
    process.env.OVERNIGHT_NOTES = file;
    try {
      notifyBudget({ kind: "stop", day: "2026-11-01T15:00:00.000Z", spentUsd: 12.57, estimateUsd: 0.1, budgetUsd: 10, purpose: "measure", label: "絵" });
    } finally {
      if (old === undefined) delete process.env.OVERNIGHT_NOTES;
      else process.env.OVERNIGHT_NOTES = old;
    }
    expect(readFileSync(file, "utf-8")).toMatch(/上限で止めた: その日の合計 12\.57 USD＋見込み 0\.10 USD／上限 10 USD（measure・絵）\n$/);
  });

  // 手元にだけある、今夜の呼び出しの記録の写しで確かめる（API は呼ばない。CI では記録が無いので飛ばす）
  const real = join(import.meta.dirname, "..", "private", "logs", "api-calls.jsonl");
  it.skipIf(!existsSync(real))("今夜の記録の写しでは、10 USD の上限で次の呼び出しが止まる", async () => {
    const copy = join(mkdtempSync(join(tmpdir(), "calls-")), "api-calls.jsonl");
    copyFileSync(real, copy);
    const c = client(["ok"]);
    const events: BudgetEvent[] = [];
    const night = Date.parse("2026-11-02T10:30:00Z");
    await expect(guardedCall({ client: c, log: new FileCallLog(copy), now: () => night, dayBudgetUsd: 10, onBudget: (e) => void events.push(e) }, { purpose: "measure", label: "y", params })).rejects.toMatchObject({ which: "allPerDay" });
    expect(c.calls.n).toBe(0);
    expect(events[0].spentUsd).toBeGreaterThan(10);
  });
});
