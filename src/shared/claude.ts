// Claude の API を呼ぶ共通部品。呼ぶたびに、モデル・入出力トークン・費用・時間を 1 行残す。
import type Anthropic from "@anthropic-ai/sdk";

/** どの用途の呼び出しか。費用の上限は用途ごとに持つ */
export type Purpose = "hook" | "night" | "demo" | "mcp" | "measure" | "app";

/** USD / 100 万トークン。出どころ: https://platform.claude.com/docs/en/about-claude/pricing（2026-11-02 に取得） */
export const PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  "claude-fable-5-1": { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 },
};

export interface CallRecord {
  at: string;
  purpose: Purpose;
  label: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  usd: number;
  ms: number;
  ok: boolean;
  error?: string;
}

/** 呼び出しの記録の置き場（D1・ファイル・テスト用のメモリ） */
export interface CallLog {
  append(record: CallRecord): Promise<void>;
  /** 用途ごとの費用の合計。since があればその時刻から */
  sumUsd(purpose: Purpose, since?: string): Promise<number>;
}

export type MessagesClient = Pick<Anthropic, "messages">;

export function costUsd(model: string, usage: Anthropic.Usage): number {
  const p = PRICES[model];
  if (!p) throw new Error(`単価の無いモデル: ${model}`);
  return (
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead) /
    1e6
  );
}

export interface CallDeps {
  client: MessagesClient;
  log: CallLog;
  now?: () => number;
}

export interface CallRequest {
  purpose: Purpose;
  label: string;
  params: Anthropic.MessageCreateParamsNonStreaming;
}

export async function callClaude(deps: CallDeps, req: CallRequest): Promise<Anthropic.Message> {
  const now = deps.now ?? Date.now;
  const t0 = now();
  const base = { at: new Date(t0).toISOString(), purpose: req.purpose, label: req.label, model: req.params.model };
  try {
    const msg = await deps.client.messages.create(req.params);
    await deps.log.append({
      ...base,
      model: msg.model,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
      usd: costUsd(req.params.model, msg.usage),
      ms: now() - t0,
      ok: true,
    });
    return msg;
  } catch (e) {
    await deps.log.append({
      ...base,
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      usd: 0,
      ms: now() - t0,
      ok: false,
      error: e instanceof Error ? e.name : "unknown",
    });
    throw e;
  }
}

/** テストと手元の試しに使う、メモリの中の記録 */
export class MemoryCallLog implements CallLog {
  records: CallRecord[] = [];
  async append(r: CallRecord) {
    this.records.push(r);
  }
  async sumUsd(purpose: Purpose, since?: string) {
    return this.records.filter((r) => r.purpose === purpose && (!since || r.at >= since)).reduce((s, r) => s + r.usd, 0);
  }
}
