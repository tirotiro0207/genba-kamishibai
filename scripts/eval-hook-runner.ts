// フックで使う、本物の取り出しと判定（API を呼ぶ）
import { guardedCall } from "../src/shared/claude";
import { judgeParams, parseJudgement } from "../src/shared/eval/judge";
import { extractRules, rulesToClaims } from "../src/shared/extract/rules";
import { makeClient } from "../src/node/client";
import { FileCallLog } from "../src/node/file-log";

export async function makeHookRunner() {
  const client = makeClient();
  const log = new FileCallLog();
  const deps = { client, log };
  return {
    // 021 から正式な取り出しで測る（仮版は extract.ts に残す）
    extract: async (text: string) => rulesToClaims(await extractRules(deps, "hook", text)),
    judge: async (gold: Parameters<typeof judgeParams>[0], pred: Parameters<typeof judgeParams>[1]) =>
      parseJudgement(await guardedCall(deps, { purpose: "hook", label: "採点の判定", params: judgeParams(gold, pred) })),
    usdSince: async (t0: number) => log.sumUsd("hook", new Date(t0).toISOString()),
  };
}
