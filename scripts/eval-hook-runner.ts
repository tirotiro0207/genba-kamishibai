// フックで使う、本物の取り出しと判定（API を呼ぶ）
import { guardedCall } from "../src/shared/claude";
import { judgeParams, parseJudgement } from "../src/shared/eval/judge";
import { extractClaims } from "../src/shared/extract/extract";
import { makeClient } from "../src/node/client";
import { FileCallLog } from "../src/node/file-log";

export async function makeHookRunner() {
  const client = makeClient();
  const log = new FileCallLog();
  const deps = { client, log };
  return {
    extract: (text: string) => extractClaims(deps, "hook", text),
    judge: async (gold: Parameters<typeof judgeParams>[0], pred: Parameters<typeof judgeParams>[1]) =>
      parseJudgement(await guardedCall(deps, { purpose: "hook", label: "採点の判定", params: judgeParams(gold, pred) })),
    usdSince: async (t0: number) => log.sumUsd("hook", new Date(t0).toISOString()),
  };
}
