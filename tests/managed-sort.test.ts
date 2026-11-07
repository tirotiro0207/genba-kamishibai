import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { sortPageManaged } from "../src/node/managed-sort";
import { MemoryCallLog } from "../src/shared/claude";
import { parseSort } from "../src/shared/sort/page";

// 022 の試作: Managed Agents で 1 ページを仕分け、「カードにする／しない」と理由が返る。セッションは答えのあとに消す
const IDS = { agent_id: "agent_x", agent_version: 1, environment_id: "env_x" };

function fakeClient(reply: string, stop = "end_turn") {
  const calls: string[] = [];
  const events = [
    { type: "agent.message", content: [{ type: "text", text: reply }] },
    { type: "session.status_idle", stop_reason: { type: stop } },
  ];
  const client = {
    beta: {
      sessions: {
        create: async (p: { budget?: { max_list_cost: { amount: string } } }) => (calls.push(`create:${p.budget?.max_list_cost.amount}`), { id: "sesn_1" }),
        retrieve: async () => ({ usage: { list_cost: { amount: "1", currency: "USD" } } }),
        delete: async (id: string) => (calls.push(`delete:${id}`), { id }),
        events: {
          stream: async () => (calls.push("stream"), (async function* () { yield* events; })()),
          send: async (_id: string, p: { events: { content: { text: string }[] }[] }) => (calls.push(`send:${p.events[0].content[0].text.includes("目次")}`), {}),
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, calls };
}

describe("1 ページの仕分け（022）", () => {
  it("答えの JSON を読む。前後に文が付いていても読み、形が違えば断る", () => {
    expect(parseSort('はい。\n```json\n{"card": false, "reason": "目次だけ"}\n```')).toEqual({ card: false, reason: "目次だけ" });
    expect(() => parseSort('{"card": "yes", "reason": "x"}')).toThrow();
    expect(() => parseSort("カードにします")).toThrow();
  });

  it("流れを開いてからページを送り、答えと費用を返して、セッションを消す。費用の上限を付けて作る", async () => {
    const { client, calls } = fakeClient('{"card": false, "reason": "目次だけで決まりが無い"}');
    const log = new MemoryCallLog();
    const r = await sortPageManaged(client, IDS, "目次\n1. はじめに", { log });
    expect(r).toMatchObject({ card: false, reason: "目次だけで決まりが無い", session_id: "sesn_1", usd: 0.01, deleted: true });
    expect(calls).toEqual(["create:50", "stream", "send:true", "delete:sesn_1"]);
    // 使った分は、ほかの呼び出しと同じ台帳（夜間の用途）に残る
    expect(log.records).toMatchObject([{ purpose: "night", usd: 0.01, ok: true }]);
  });

  it("答えの前に止まったら（上限に当たったなど）断り、それでもセッションは消す", async () => {
    const { client, calls } = fakeClient("", "budget_reached");
    const log = new MemoryCallLog();
    await expect(sortPageManaged(client, IDS, "目次", { log })).rejects.toThrow("budget_reached");
    expect(calls).toContain("delete:sesn_1");
    expect(log.records).toMatchObject([{ purpose: "night", ok: false }]);
  });

  it("全体の 1 日の上限を、ほかの用途の分も合わせて見る。超えそうならセッションを作らない", async () => {
    const { client, calls } = fakeClient('{"card": false, "reason": "x"}');
    const log = new MemoryCallLog();
    // 別の用途（app）で 9.8 USD 使った日。上限 10 USD に、セッションの上限 0.5 USD を足すと超える
    await log.append({ at: new Date().toISOString(), purpose: "app", label: "x", model: "claude-opus-5-5", inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, usd: 9.8, ms: 0, ok: true });
    const seen: string[] = [];
    await expect(sortPageManaged(client, IDS, "目次", { log, dayBudgetUsd: 10, onBudget: (e) => seen.push(e.kind) })).rejects.toThrow("費用の上限を超える");
    expect(calls).toEqual([]);
    expect(seen).toEqual(["stop"]);
    expect(log.records).toHaveLength(1);
  });
});
