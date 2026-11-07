// 098: 動画の転に使う場面を、命令 1 つで横長の動画用に撮り直す。絵が決まったら、これをもう一度流すだけで撮り直せる。
// 画面と録画は 1152×648（playwright.config.ts の VIDEO=1）。つなぐときに 1280×720 へ広げる。
// 録画は private/rec/runs-video/（git の外。流すたびに空になる）。手元の D1 を使うので、ほかの録画と口を分ける（E2E_PORT）
//
//   npx tsx scripts/video-rec.ts
import { spawnSync } from "node:child_process";
import { join } from "node:path";

/** 撮る場面（録画のテストの名前の頭）。転の区切りの順 */
export const SCENES = [
  "話した言葉を入れ、送る前に文字を確かめ",
  "練習用テナントで、取り出しから記録アプリまでを 1 本で通す",
  "コマを 1 つずつ送り、絵の面は 0 字",
  "絵の部品をタップすると元の文の該当箇所が光り",
  "帯は 3 色だけで、赤は危険と同じ赤",
  "確認待ちの列は赤が先頭で",
  "マウスで枠を描き、文字を確かめてから送ると",
  "パソコンは電子印鑑。",
  "署名済みのカードだけを 1 枚ずつ送って見る",
  "ページが積み重なってカウンターが上がり",
  "時計 2 つ: 仮の数字で",
];

/** 場面の名前 → playwright の -g に渡す正規表現 */
export const grepOf = (scenes: string[]) => scenes.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

/** playwright の --list の出力のうち、どのテストの題名にも当たらない場面を返す（-g は 0 件でも落ちないので、ここで見る） */
export const missingScenes = (scenes: string[], listOut: string) => {
  const titles = listOut.split(/\r?\n/).filter((l) => l.includes(" › "));
  return scenes.filter((s) => !titles.some((t) => t.includes(s)));
};

function main() {
  const env = { ...process.env, VIDEO: "1", E2E_RUNS: "runs-video", E2E_PORT: process.env.E2E_PORT ?? "5191" };
  // シェルを通すと日本語と | が崩れるので、node で playwright を直に呼ぶ
  const cli = join(import.meta.dirname, "..", "node_modules", "@playwright", "test", "cli.js");
  // 撮る前に、場面の名前が全部どれかのテストに当たるかを確かめる（テストの題名を変えると、その場面だけ黙って抜けるため）
  const list = spawnSync(process.execPath, [cli, "test", "--list", "-g", grepOf(SCENES)], { env, encoding: "utf8" });
  const missing = missingScenes(SCENES, list.stdout ?? "");
  if (list.status !== 0 || missing.length > 0) {
    if (list.status !== 0) console.error(list.stderr ?? "");
    console.error(`当たるテストが無い場面: ${missing.join(" / ") || "（--list が失敗）"}`);
    process.exit(1);
  }
  const r = spawnSync(process.execPath, [cli, "test", "-g", grepOf(SCENES), "--workers=1"], { env, stdio: "inherit" });
  process.exit(r.status ?? 1);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
