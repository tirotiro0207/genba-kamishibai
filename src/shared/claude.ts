// Claude の API を呼ぶ共通部品。呼ぶたびに、モデル・入出力トークン・費用・時間を 1 行残す。
import type Anthropic from "@anthropic-ai/sdk";

/** どの用途の呼び出しか。費用の上限は用途ごとに持つ */
export type Purpose = "hook" | "night" | "demo" | "mcp" | "measure" | "app";
export const PURPOSES: readonly Purpose[] = ["hook", "night", "demo", "mcp", "measure", "app"];

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

/** SDK の Anthropic のうち、ここで使う形だけ（テストで差し替えやすいように） */
export interface MessagesClient {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): PromiseLike<Anthropic.Message> };
}

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

/** 費用の上限（USD）。1 回・1 日（日本時間）・全体 */
export interface Limits {
  perCallUsd: number;
  perDayUsd: number;
  totalUsd: number;
}

// 大会のクレジット $500 の中に収める。全体の合計は 400 で、残り 100 は予備。
// 1 枚の実測（作り直し込み 0.094 USD、docs/numbers.md）の数十倍を 1 日の上限にしている。
export const DEFAULT_LIMITS: Record<Purpose, Limits> = {
  hook: { perCallUsd: 0.5, perDayUsd: 10, totalUsd: 60 },
  night: { perCallUsd: 1, perDayUsd: 40, totalUsd: 100 },
  demo: { perCallUsd: 0.3, perDayUsd: 5, totalUsd: 40 },
  mcp: { perCallUsd: 0.5, perDayUsd: 5, totalUsd: 30 },
  measure: { perCallUsd: 1, perDayUsd: 20, totalUsd: 70 },
  app: { perCallUsd: 1, perDayUsd: 20, totalUsd: 100 },
};

export class BudgetExceededError extends Error {
  constructor(
    public purpose: Purpose,
    public which: "perCall" | "perDay" | "total" | "allPerDay",
    public estimateUsd: number,
  ) {
    super(`費用の上限を超えるので呼ばない（${purpose}・${which}・見込み ${estimateUsd.toFixed(4)} USD）`);
    this.name = "BudgetExceededError";
  }
}

const IMAGE_TOKENS = 1600;

/** 呼ぶ前の費用の見込み（多めに見る）。文字は 2 文字で 1 トークン、画像は 1 枚 1,600 トークン、出力は max_tokens まで */
export function estimateMaxUsd(params: Anthropic.MessageCreateParamsNonStreaming): number {
  const p = PRICES[params.model];
  if (!p) throw new Error(`単価の無いモデル: ${params.model}`);
  let chars = JSON.stringify(params.system ?? "").length;
  let images = 0;
  for (const m of params.messages) {
    if (typeof m.content === "string") chars += m.content.length;
    else
      for (const b of m.content) {
        if (b.type === "image" || b.type === "document") images += 1;
        else chars += JSON.stringify(b).length;
      }
  }
  const inputTokens = chars / 2 + images * IMAGE_TOKENS;
  return (inputTokens * p.input + params.max_tokens * p.output) / 1e6;
}

/** 日本時間のその日の 0 時（ISO 文字列） */
export function startOfJstDay(ms: number): string {
  const jst = new Date(ms + 9 * 3600_000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 3600_000).toISOString();
}

/**
 * 全部の用途を合わせた 1 日（日本時間）の上限。用途ごとの 1 日の上限を足すと 100 USD になるので、それとは別に持つ。
 * 環境変数 API_BUDGET_USD_PER_DAY から読み、無いか数でなければ 10
 */
export const DEFAULT_DAY_BUDGET_USD = 10;
/** 8 割を超えたら、その日に 1 回だけ警告する */
export const DAY_WARN_RATIO = 0.8;

type ProcessLike = { env?: Record<string, string | undefined>; cwd?: () => string; getBuiltinModule?: (id: string) => unknown };
const proc = () => (globalThis as { process?: ProcessLike }).process;

export function dayBudgetUsd(env: Record<string, string | undefined> | undefined = proc()?.env): number {
  const n = Number(env?.API_BUDGET_USD_PER_DAY);
  return env?.API_BUDGET_USD_PER_DAY && Number.isFinite(n) && n > 0 ? n : DEFAULT_DAY_BUDGET_USD;
}

/** 全部の用途の、since からの費用の合計 */
export async function sumAllUsd(log: CallLog, since?: string): Promise<number> {
  let s = 0;
  for (const p of PURPOSES) s += await log.sumUsd(p, since);
  return s;
}

export interface BudgetEvent {
  kind: "warn" | "stop";
  /** 日本時間のその日の始まり（ISO） */
  day: string;
  spentUsd: number;
  estimateUsd: number;
  budgetUsd: number;
  purpose: Purpose;
  label: string;
}

export const budgetLine = (e: BudgetEvent) =>
  `- ${new Date().toISOString()} 費用の${e.kind === "stop" ? "上限で止めた" : "警告（8 割を超えた）"}: その日の合計 ${e.spentUsd.toFixed(2)} USD＋見込み ${e.estimateUsd.toFixed(2)} USD／上限 ${e.budgetUsd} USD（${e.purpose}・${e.label}）`;

/**
 * 既定の知らせ方。手元の Node では、リポジトリの private/overnight-notes.md（環境変数 OVERNIGHT_NOTES で変えられる）に 1 行足す。
 * private/ が無いところ（Worker・まっさらな写し）では console.warn だけ
 */
export function notifyBudget(e: BudgetEvent): void {
  const line = budgetLine(e);
  console.warn(line);
  try {
    const p = proc();
    const fs = p?.getBuiltinModule?.("node:fs") as typeof import("node:fs") | undefined;
    if (!fs || !p?.cwd) return;
    const file = p.env?.OVERNIGHT_NOTES ?? `${p.cwd()}/private/overnight-notes.md`;
    if (!p.env?.OVERNIGHT_NOTES && !fs.existsSync(`${p.cwd()}/private`)) return;
    fs.appendFileSync(file, `${line}\n`, "utf-8");
  } catch {
    // 知らせが書けなくても、止めることは変えない
  }
}

/** 警告を出した日（同じプロセスの中で 1 日 1 回） */
const warnedDays = new Set<string>();
export const resetBudgetWarnings = () => warnedDays.clear();

export interface GuardedDeps extends CallDeps {
  limits?: Record<Purpose, Limits>;
  /** 全部の用途を合わせた 1 日の上限。無ければ dayBudgetUsd() */
  dayBudgetUsd?: number;
  /** 警告と止めたときの知らせ。無ければ notifyBudget */
  onBudget?: (e: BudgetEvent) => void;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}

/** 呼び直してよい失敗: 429（混んでいる）・408・5xx（529 を含む）と、答えが返らなかった通信の切れ（夜間に何時間も流すとき、1 回の切れで止めないため） */
export function retryable(e: unknown): boolean {
  const x = e as { status?: number; name?: string; code?: string; cause?: { code?: string } } | null;
  const status = x?.status;
  if (status === 429 || status === 408 || (typeof status === "number" && status >= 500)) return true;
  if (status !== undefined) return false;
  return x?.name === "APIConnectionError" || x?.name === "APIConnectionTimeoutError" || /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|UND_ERR/.test(`${x?.code ?? ""} ${x?.cause?.code ?? ""}`);
}

/** Retry-After（秒か日時）を ms で。無ければ null。待ちすぎないよう 60 秒まで */
export function retryAfterMs(e: unknown, now = Date.now()): number | null {
  const h = (e as { headers?: { get?: (k: string) => string | null } | Record<string, string> })?.headers;
  const v = h ? (typeof (h as { get?: unknown }).get === "function" ? (h as { get: (k: string) => string | null }).get("retry-after") : (h as Record<string, string>)["retry-after"]) : null;
  if (!v) return null;
  const ms = /^\d+(\.\d+)?$/.test(v) ? Number(v) * 1000 : Date.parse(v) - now;
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, 60_000) : null;
}

/**
 * 上限を確かめてから呼び、429・5xx・通信の切れは待ち時間を延ばしながら呼び直す（Retry-After があればそれより短くは待たない）。
 * client は SDK の自動の呼び直しを切って（maxRetries: 0）渡す。呼び直しも 1 回ずつ記録に残すため。
 */
export async function guardedCall(deps: GuardedDeps, req: CallRequest): Promise<Anthropic.Message> {
  const limits = (deps.limits ?? DEFAULT_LIMITS)[req.purpose];
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const est = estimateMaxUsd(req.params);
  if (est > limits.perCallUsd) throw new BudgetExceededError(req.purpose, "perCall", est);
  const day = startOfJstDay(now());
  const budget = deps.dayBudgetUsd ?? dayBudgetUsd();
  const spent = await sumAllUsd(deps.log, day);
  const event = (kind: BudgetEvent["kind"]): BudgetEvent => ({ kind, day, spentUsd: spent, estimateUsd: est, budgetUsd: budget, purpose: req.purpose, label: req.label });
  if (spent + est > budget) {
    (deps.onBudget ?? notifyBudget)(event("stop"));
    throw new BudgetExceededError(req.purpose, "allPerDay", est);
  }
  if (spent + est > budget * DAY_WARN_RATIO && !warnedDays.has(day)) {
    warnedDays.add(day);
    (deps.onBudget ?? notifyBudget)(event("warn"));
  }
  if ((await deps.log.sumUsd(req.purpose, startOfJstDay(now()))) + est > limits.perDayUsd)
    throw new BudgetExceededError(req.purpose, "perDay", est);
  if ((await deps.log.sumUsd(req.purpose)) + est > limits.totalUsd) throw new BudgetExceededError(req.purpose, "total", est);

  const maxAttempts = deps.maxAttempts ?? 5;
  for (let attempt = 1; ; attempt++) {
    try {
      return await callClaude(deps, req);
    } catch (e) {
      if (!retryable(e) || attempt >= maxAttempts) throw e;
      await sleep(Math.max(1000 * 2 ** (attempt - 1), retryAfterMs(e) ?? 0));
    }
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
