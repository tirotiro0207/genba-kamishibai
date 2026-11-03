// 録画の土台（010）。録画は private/rec（git に入らない）。置き場所は環境変数 RECORD_DIR で変えられる
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { privatePath } from "./src/node/private-dir";

export const RECORD_DIR = process.env.RECORD_DIR || privatePath("rec");
// 2 本のスレッドが同時に流すときは、口と録画の置き場を分ける（E2E_PORT・E2E_RUNS）。置き場は流すたびに空になるため
const PORT = Number(process.env.E2E_PORT ?? 5179);

export default defineConfig({
  testDir: "e2e",
  outputDir: join(RECORD_DIR, process.env.E2E_RUNS ?? "runs"),
  reporter: [["list"]],
  // 手元の D1 は 1 つのファイルなので、録画を並べると「使用中」で落ちる。1 本ずつ流す（総点検の 1）
  workers: 1,
  fullyParallel: false,
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
