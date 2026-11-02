// 手元のスクリプトから Claude を呼ぶための client。鍵は .env から読むだけで、表に出さない。
// .env を読むのは Node のスクリプトだけ。手元の Worker（画面と API）は .dev.vars を読む（役割の名前もそちら）
import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function loadEnv(): void {
  const p = join(import.meta.dirname, "..", "..", ".env");
  if (existsSync(p)) process.loadEnvFile(p);
}

/** SDK の自動の呼び直しは切る（呼び直しは guardedCall が 1 回ずつ記録しながら行う） */
export function makeClient(): Anthropic {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY が無い（.env に置く）");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
}
