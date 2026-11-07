// 録画の土台（010）。録画は private/rec（git に入らない）。置き場所は環境変数 RECORD_DIR で変えられる
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { privatePath } from "./src/node/private-dir";

export const RECORD_DIR = process.env.RECORD_DIR || privatePath("rec");
// 2 本のスレッドが同時に流すときは、口と録画の置き場を分ける（E2E_PORT・E2E_RUNS）。置き場は流すたびに空になるため
const PORT = Number(process.env.E2E_PORT ?? 5179);
// Playwright は流し始めに置き場を空にする。E2E_RUNS が無ければ日時つきの新しい置き場にして、前の録画を消さない。
// 走り手（worker）も同じ置き場を使うよう、決めた名前を環境変数に入れて引き継ぐ
process.env.E2E_RUNS ||= `runs-${new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-")}`;
// DEMO_URL（本番の公開 URL）を撮るときは、手元の画面と D1 を立てない
const REMOTE_DEMO = !!process.env.DEMO_URL;

export default defineConfig({
  testDir: "e2e",
  outputDir: join(RECORD_DIR, process.env.E2E_RUNS),
  reporter: [["list"]],
  // 手元の D1 は 1 つのファイルなので、録画を並べると「使用中」で落ちる。1 本ずつ流す（総点検の 1）
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    video: { mode: "on", size: { width: 1280, height: 720 } },
    // 動画用（098・VIDEO=1 のときだけ）: 画面を 1152×648（16:9）にし、録画も同じ大きさで撮る。つなぐときに 1280×720 へ広げるので、中身が 1.11 倍に見える。
    // これより狭いと、枠を描く録画で絵の下が画面の外に出て落ちる。撮るのは scripts/video-rec.ts
    ...(process.env.VIDEO ? { viewport: { width: 1152, height: 648 }, video: { mode: "on" as const, size: { width: 1152, height: 648 } } } : {}),
  },
  // 画面と API と手元の D1 を一緒に動かす
  webServer: REMOTE_DEMO
    ? undefined
    : {
        command: `npx vite build && npx wrangler d1 migrations apply DB --local && npx wrangler dev --port ${PORT}`,
        port: PORT,
        reuseExistingServer: true,
        timeout: 120_000,
        // CI=1 は wrangler に、対話の問い（送信の許し・確かめの問い）を出さず進ませるため。テストのコードは読まない
        env: { CI: "1" },
      },
});
