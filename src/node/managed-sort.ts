// Managed Agents で 1 ページを仕分ける（022 の試作）。エージェントと環境は 1 回だけ作って番号を private/ に置き、
// 毎回はセッションを 1 つ作る → ページの文を送る → 止まるまで流れを読む → 費用を読む → セッションを消す（§5 L4: 記録はサーバーに残さない）。
// セッションには費用の上限（list cost）を付け、上限に当たると止まる。
import type Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BudgetExceededError, type BudgetEvent, type CallLog, dayBudgetUsd, DEFAULT_LIMITS, notifyBudget, startOfJstDay, sumAllUsd } from "../shared/claude";
import { parseSort, SORT_SYSTEM, type SortResult } from "../shared/sort/page";
import { privatePath } from "./private-dir";

export const MA_MODEL = "claude-opus-5-5";

export interface ManagedIds {
  agent_id: string;
  agent_version: number;
  environment_id: string;
}

const idsPath = () => privatePath("ma", "ids.json");

/** 仕分けの指示のハッシュ。エージェントは作ったときの指示で固定されるので、指示が変わったら作り直す */
export const sortSystemHash = (system = SORT_SYSTEM) => createHash("sha256").update(system).digest("hex").slice(0, 16);

/** エージェントと環境を、まだ無ければ 1 回だけ作る。道具は全部切る（ページの文を読んで答えるだけ）。指示が変わっていればエージェントを作り直す */
export async function ensureAgent(client: Anthropic): Promise<ManagedIds> {
  const saved = existsSync(idsPath()) ? (JSON.parse(readFileSync(idsPath(), "utf-8")) as ManagedIds & { system_sha?: string }) : null;
  if (saved && saved.system_sha === sortSystemHash()) return saved;
  if (saved) console.warn("仕分けの指示が、エージェントを作ったときと違う。エージェントを作り直す");
  const environment = saved
    ? { id: saved.environment_id }
    : await client.beta.environments.create({
        name: "kamishibai-sort",
        config: { type: "cloud", networking: { type: "limited", allow_package_managers: false, allow_mcp_servers: false } },
      });
  const agent = await client.beta.agents.create({
    name: "kamishibai-sort",
    model: MA_MODEL,
    system: SORT_SYSTEM,
    tools: [{ type: "agent_toolset_20260401", default_config: { enabled: false } }],
  });
  const ids = { agent_id: agent.id, agent_version: agent.version, environment_id: environment.id, system_sha: sortSystemHash() };
  mkdirSync(privatePath("ma"), { recursive: true });
  writeFileSync(idsPath(), JSON.stringify(ids, null, 2) + "\n", "utf-8");
  return ids;
}

export interface ManagedSort extends SortResult {
  session_id: string;
  /** セッションの list cost（USD）。読めなければ null */
  usd: number | null;
  ms: number;
  deleted: boolean;
}

/** 1 回のセッションの費用の上限（セント）。1 ページの仕分けは数セントのはず */
export const SESSION_BUDGET_CENTS = 50;

export interface ManagedGuard {
  /** 呼び出しの記録（ほかの呼び出しと同じ台帳。ここに足し、ここの合計を見て呼ぶ） */
  log: CallLog;
  /** 全部の用途を合わせた 1 日の上限。無ければ dayBudgetUsd() */
  dayBudgetUsd?: number;
  /** 1 回のセッションの費用の上限（セント）。無ければ SESSION_BUDGET_CENTS */
  budgetCents?: number;
  onBudget?: (e: BudgetEvent) => void;
  now?: () => number;
}

/**
 * セッションを作る前に、ほかの呼び出しと同じ上限（全体の 1 日・夜間の 1 日と全体）を見る。
 * 1 回のセッションの上限（budgetCents）まで使う見込みで数えるので、上限を超えそうなら作らない
 */
async function checkBudget(guard: ManagedGuard, label: string, budgetCents: number) {
  const est = budgetCents / 100;
  const now = (guard.now ?? Date.now)();
  const day = startOfJstDay(now);
  const budget = guard.dayBudgetUsd ?? dayBudgetUsd();
  const spent = await sumAllUsd(guard.log, day);
  const limits = DEFAULT_LIMITS.night;
  const stop = (which: "perCall" | "perDay" | "total" | "allPerDay") => {
    (guard.onBudget ?? notifyBudget)({ kind: "stop", day, spentUsd: spent, estimateUsd: est, budgetUsd: budget, purpose: "night", label });
    throw new BudgetExceededError("night", which, est);
  };
  if (est > limits.perCallUsd) stop("perCall");
  if (spent + est > budget) stop("allPerDay");
  if ((await guard.log.sumUsd("night", day)) + est > limits.perDayUsd) stop("perDay");
  if ((await guard.log.sumUsd("night")) + est > limits.totalUsd) stop("total");
}

const LABEL = "Managed Agents の仕分け";

export async function sortPageManaged(client: Anthropic, ids: ManagedIds, pageText: string, guard: ManagedGuard): Promise<ManagedSort> {
  const t0 = Date.now();
  const budgetCents = guard.budgetCents ?? SESSION_BUDGET_CENTS;
  await checkBudget(guard, LABEL, budgetCents);
  const session = await client.beta.sessions.create({
    agent: { type: "agent", id: ids.agent_id, version: ids.agent_version },
    environment_id: ids.environment_id,
    title: "1 ページの仕分け",
    budget: { type: "limit", max_list_cost: { amount: String(budgetCents), currency: "USD" } },
  });
  let text = "";
  let stop = "";
  try {
    // 流れを先に開いてから送る（送ったあとに開くと、早い出来事がまとめて届く）
    const stream = await client.beta.sessions.events.stream(session.id);
    await client.beta.sessions.events.send(session.id, { events: [{ type: "user.message", content: [{ type: "text", text: `次のページを仕分けてください。\n\n${pageText}` }] }] });
    for await (const ev of stream) {
      if (ev.type === "agent.message") for (const b of ev.content) if (b.type === "text") text += b.text;
      if (ev.type === "session.status_idle") {
        stop = ev.stop_reason.type;
        break;
      }
      if (ev.type === "session.status_terminated") {
        stop = "terminated";
        break;
      }
    }
    if (stop !== "end_turn") throw new Error(`セッションが答えの前に止まった（${stop}）`);
    const r = parseSort(text);
    const usd = await readUsd(client, session.id);
    await record(guard, usd, Date.now() - t0, true);
    return { ...r, session_id: session.id, usd, ms: Date.now() - t0, deleted: await remove(client, session.id) };
  } catch (e) {
    // 止まったり読めなかったりしても、使った分は台帳に残す（読めなければ上限いっぱい使ったものとして数える）
    await record(guard, await readUsd(client, session.id), Date.now() - t0, false, e instanceof Error ? e.message : String(e));
    await remove(client, session.id);
    throw e;
  }
}

/** セッションの list cost（USD）。読めなければ null */
async function readUsd(client: Anthropic, id: string): Promise<number | null> {
  try {
    const cost = (await client.beta.sessions.retrieve(id)).usage?.list_cost;
    return cost ? Number(cost.amount) / 100 : null;
  } catch {
    return null;
  }
}

/** 呼び出しの台帳に 1 行足す。費用が読めないときは、セッションの上限（budgetCents）を使った見込みで残す */
async function record(guard: ManagedGuard, usd: number | null, ms: number, ok: boolean, error?: string) {
  await guard.log.append({
    at: new Date((guard.now ?? Date.now)()).toISOString(),
    purpose: "night",
    label: LABEL,
    model: MA_MODEL,
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    usd: usd ?? (guard.budgetCents ?? SESSION_BUDGET_CENTS) / 100,
    ms,
    ok,
    ...(error ? { error } : {}),
  });
}

async function remove(client: Anthropic, id: string): Promise<boolean> {
  try {
    await client.beta.sessions.delete(id);
    return true;
  } catch {
    return false;
  }
}
