// 3 分の通しの仮版を書き出す: 1 本の mp4、場面ごとの真ん中のコマの静止画、場面の一覧の 1 枚。
// 冒頭とポータルは書き出した版を、機能の場面は録画（runs-video）を、git の外から写して使う（英数字だけの場所に写し、Remotion の public に渡す）。
// 書き出すのは git の外（../private/material/2026-11-05-通し/）。ローカルで書き出すだけで、API は使わない。
// 使い方: node render-full.mjs [--stills]（--stills は静止画と一覧だけ）
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const priv = path.join(here, "..", "private");
const PUB = path.join(here, "out", "pub");
const OUT_TMP = path.join(here, "out", "full");
const DEST = path.join(priv, "material", process.env.VIDEO_TAG ?? "2026-11-05-通し");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const stillsOnly = process.argv.includes("--stills");
for (const d of [PUB, OUT_TMP, path.join(DEST, "scenes")]) fs.mkdirSync(d, { recursive: true });
const copyOut = (name, sub = "") => fs.writeFileSync(path.join(DEST, sub, name), fs.readFileSync(path.join(OUT_TMP, name)));

// 素材を写す（録画は h264 の mp4 に直して、コマを送りやすくする）
const put = (src, name) => fs.writeFileSync(path.join(PUB, name), fs.readFileSync(src));
put(path.join(priv, "material", "2026-11-05-冒頭-v2", "opening.mp4"), "opening.mp4");
put(path.join(priv, "material", "2026-11-05-ポータル", "p1-portal.mp4"), "portal.mp4");
put(path.join(priv, "material", "029-写真A", "poster.png"), "poster.png");
put(path.join(priv, "material", "029-作業服", "burnt-jacket.png"), "jacket.png");
const runs = path.join(priv, "rec", "runs-video");
for (const dir of fs.readdirSync(runs)) {
  const key = dir.split("-")[0];
  if (!["fold", "card", "danger", "queue", "route", "fix", "sign", "read"].includes(key)) continue;
  const out = path.join(PUB, `${key}.mp4`);
  if (fs.existsSync(out)) continue;
  fs.writeFileSync(path.join(OUT_TMP, "in.webm"), fs.readFileSync(path.join(runs, dir, "video.webm")));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", "in.webm", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30", `${key}.mp4`], { cwd: OUT_TMP });
  fs.renameSync(path.join(OUT_TMP, `${key}.mp4`), out);
}

const t0 = Date.now();
const serveUrl = await bundle({ entryPoint: path.join(here, "src", "index.ts"), publicDir: PUB });
const comp = await selectComposition({ serveUrl, id: "full", browserExecutable: CHROME });
if (!stillsOnly) {
  await renderMedia({ serveUrl, composition: comp, codec: "h264", pixelFormat: "yuv420p", outputLocation: path.join(OUT_TMP, "full.mp4"), browserExecutable: CHROME, imageFormat: "jpeg", jpegQuality: 92 });
  copyOut("full.mp4");
  console.log("full", execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height,r_frame_rate,nb_frames:format=duration", "-of", "json", "full.mp4"], { cwd: OUT_TMP }).toString().replace(/\s+/g, " "));
}
// 場面ごとの真ん中のコマ
// 場面の表は full.tsx の SEGS の id・at・len を読む（書き出しの台本に写さないため）
const SEGS = [...fs.readFileSync(path.join(here, "src", "full.tsx"), "utf8").matchAll(/\{ id: "([^"]+)", title: "[^"]*", at: (\d+), len: (\d+)/g)].map((m) => ({ id: m[1], at: +m[2], len: +m[3] }));
if (SEGS.length === 0 || SEGS.reduce((a, s) => a + s.len, 0) !== 180) throw new Error(`場面の表が読めない（${SEGS.length} 場面）`);
for (const [i, s] of SEGS.entries()) {
  const name = `${String(i + 1).padStart(2, "0")}-${s.id}.png`;
  await renderStill({ serveUrl, composition: comp, frame: Math.round((s.at + s.len / 2) * 30), output: path.join(OUT_TMP, name), browserExecutable: CHROME });
  copyOut(name, "scenes");
  fs.mkdirSync(path.join(PUB, "scenes"), { recursive: true });
  fs.copyFileSync(path.join(OUT_TMP, name), path.join(PUB, "scenes", name));
}
// 一覧は、写した静止画を読めるように束ね直してから描く
const serveIdx = await bundle({ entryPoint: path.join(here, "src", "index.ts"), publicDir: PUB });
const idx = await selectComposition({ serveUrl: serveIdx, id: "full-index", browserExecutable: CHROME });
await renderStill({ serveUrl: serveIdx, composition: idx, frame: 0, output: path.join(OUT_TMP, "index.png"), browserExecutable: CHROME });
copyOut("index.png");
console.log("total", ((Date.now() - t0) / 1000).toFixed(1), "s →", DEST);
