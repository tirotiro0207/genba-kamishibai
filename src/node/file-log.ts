// 手元のスクリプトの呼び出しの記録。1 回 1 行の JSON をファイルに足す（中身は残さない）
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CallLog, CallRecord, Purpose } from "../shared/claude";
import { privatePath } from "./private-dir";

/** 置き場所は環境変数 CALL_LOG。無ければリポジトリの private/logs（git に入らない） */
export function defaultLogPath(): string {
  return process.env.CALL_LOG ?? privatePath("logs", "api-calls.jsonl");
}

export class FileCallLog implements CallLog {
  constructor(private path = defaultLogPath()) {
    mkdirSync(dirname(path), { recursive: true });
  }

  async append(r: CallRecord) {
    appendFileSync(this.path, JSON.stringify(r) + "\n", "utf-8");
  }

  records(): CallRecord[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as CallRecord);
  }

  async sumUsd(purpose: Purpose, since?: string) {
    return this.records()
      .filter((r) => r.purpose === purpose && (!since || r.at >= since))
      .reduce((s, r) => s + r.usd, 0);
  }
}
