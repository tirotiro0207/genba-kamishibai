// Worker から Claude を呼ぶ client。テストは setClientFactory で差し替える
import Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "../shared/claude";
import type { Env } from "./env";

type Factory = (env: Env) => MessagesClient | null;

const real: Factory = (env) => (env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0 }) : null);
let factory: Factory = real;

/** テストだけで使う。null を渡すと本物に戻す */
export function setClientFactory(f: Factory | null) {
  factory = f ?? real;
}

export const claudeClient = (env: Env) => factory(env);
