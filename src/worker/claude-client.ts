// Worker から Claude を呼ぶ client。テストは setClientFactory で差し替える
import Anthropic from "@anthropic-ai/sdk";
import { dayBudgetUsd, type MessagesClient } from "../shared/claude";
import type { Env } from "./env";

type Factory = (env: Env) => MessagesClient | null;

const real: Factory = (env) => (env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0 }) : null);
let factory: Factory = real;

/** テストだけで使う。null を渡すと本物に戻す */
export function setClientFactory(f: Factory | null) {
  factory = f ?? real;
}

export const claudeClient = (env: Env) => factory(env);

/**
 * 1 日の費用の上限（全部の用途の合計）。Workers では process.env が無いことがあるので、Worker の環境変数 API_BUDGET_USD_PER_DAY から読む
 * （無ければ dayBudgetUsd の既定）。上限の値そのものは作者が決める
 */
export const dayBudget = (env: Env) => dayBudgetUsd(env as unknown as Record<string, string | undefined>);
