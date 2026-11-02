// 録画の土台（010）。録画はリポジトリの外に置く。置き場所は環境変数 RECORD_DIR で渡す（無ければ OS の一時フォルダ）
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

export const RECORD_DIR = process.env.RECORD_DIR || join(tmpdir(), "genba-kamishibai-rec");
const PORT = 5179;

export default defineConfig({
  testDir: "e2e",
  outputDir: join(RECORD_DIR, "runs"),
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    video: { mode: "on", size: { width: 1280, height: 720 } },
  },
  // 画面と API と手元の D1 を一緒に動かす
  webServer: {
    command: `npx vite build && npx wrangler d1 migrations apply DB --local && npx wrangler dev --port ${PORT}`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { CI: "1" },
  },
});
