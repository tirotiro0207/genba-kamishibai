// API の代わりに、サブスクリプションの claude -p で Claude を呼ぶ client（063 の前の通しの確かめ用）。
// messages.create の形はそのまま受けて、claude -p の答えを Anthropic.Message の形にして返す。
// 指示は --system-prompt-file、入力は stream-json（絵の PNG もそのまま渡す）、JSON の形は --json-schema で渡す。
// 返す usage は claude -p が数えたトークンなので、costUsd で API の値段に換算できる（サブスクリプションでは払っていない）。
import type Anthropic from "@anthropic-ai/sdk";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MessagesClient } from "../shared/claude";

export function claudeBin(): string {
  const bin = process.env.CLAUDE_BIN;
  if (!bin || !existsSync(bin)) throw new Error("CLAUDE_BIN に %APPDATA%\\Claude\\claude-code\\<最新の版>\\<ハッシュ>\\claude.exe を入れる");
  return bin;
}

const dir = () => mkdtempSync(join(tmpdir(), "claude-p-"));

type Params = Anthropic.MessageCreateParamsNonStreaming & { output_config?: { effort?: string; format?: { type: string; schema: object } } };

/** 1 回の呼び出し。答え（structured_output か result の文）とトークンの数を返す */
export function claudePMessage(params: Params, cwd = process.cwd()): Promise<Anthropic.Message> {
  const d = dir();
  const sysFile = join(d, "system.txt");
  const system = typeof params.system === "string" ? params.system : (params.system ?? []).map((b) => b.text).join("\n");
  writeFileSync(sysFile, system);
  const schema = params.output_config?.format?.schema;
  const args = [
    "-p",
    "--model",
    params.model,
    "--effort",
    params.output_config?.effort ?? "high",
    "--setting-sources",
    "",
    "--tools",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--system-prompt-file",
    sysFile,
    ...(schema ? ["--json-schema", JSON.stringify(schema)] : []),
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
  ];
  const user = params.messages.at(-1);
  if (params.messages.length !== 1 || user?.role !== "user") throw new Error("claude -p の client は 1 回の user の入力だけを扱う");
  const line = `${JSON.stringify({ type: "user", message: { role: "user", content: user.content } })}\n`;
  return new Promise((resolve, reject) => {
    const p = spawn(claudeBin(), args, { cwd, windowsHide: true });
    let so = "";
    let se = "";
    p.stdout.on("data", (x) => (so += x));
    p.stderr.on("data", (x) => (se += x));
    p.on("error", reject);
    p.on("close", (code) => {
      // 1 回ごとに作った一時のフォルダを中身ごと消す
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {}
      type Line = { type: string; structured_output?: unknown; result?: string; is_error?: boolean; usage?: Anthropic.Usage; total_cost_usd?: number };
      let result: Line | undefined;
      // 壊れた行があってもプロセスごと落とさず、この呼び出しの失敗にする
      try {
        result = so
          .split("\n")
          .filter((l) => l.startsWith("{"))
          .map((l) => JSON.parse(l) as Line)
          .find((j) => j.type === "result");
      } catch (e) {
        return reject(new Error(`claude -p の出力を読めない（${code}）: ${(e as Error).message.slice(0, 200)}`));
      }
      if (!result || code !== 0 || result.is_error) return reject(new Error(`claude -p が失敗した（${code}）: ${(result?.result || se || so).slice(0, 300)}`));
      const text = result.structured_output !== undefined ? JSON.stringify(result.structured_output) : (result.result ?? "");
      const u = result.usage;
      resolve({
        id: "claude-p",
        type: "message",
        role: "assistant",
        model: params.model,
        content: [{ type: "text", text, citations: null }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: {
          input_tokens: u?.input_tokens ?? 0,
          output_tokens: u?.output_tokens ?? 0,
          cache_creation_input_tokens: u?.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: u?.cache_read_input_tokens ?? 0,
        },
      } as Anthropic.Message);
    });
    p.stdin.end(line);
  });
}

export const claudePClient = (cwd?: string): MessagesClient => ({ messages: { create: (params) => claudePMessage(params as Params, cwd) } });
