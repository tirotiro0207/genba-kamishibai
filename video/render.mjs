// 冒頭の 7 場面を書き出す: 場面ごとの mp4 と、場面の終わりの静止画 1 枚。最後に ffmpeg で 1 本（1280×720）につなぐ。
// 書き出すのは git の外（../private/material/<日付>-冒頭/）。ローカルで書き出すだけで、API は使わない。
// 使い方: node render.mjs [場面の id ...]（無ければ冒頭の全部）。ブラウザは CHROME_PATH（無ければ Chrome の標準の場所）
// ポータル: VIDEO_TAG=2026-11-05-ポータル node render.mjs p1-portal
// ポータルの印は git の外の ../private/brand/portal-mark.svg を読む（無ければ一般的な印。中身はリポジトリに入れない）
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_TMP = path.join(here, "out"); // 英数字だけの場所で書き出してから写す（日本語の場所に直接書かない）
// 前の版の書き出しを上書きしないように、版ごとに置き場を分ける（VIDEO_TAG。前の版は 2026-11-05-冒頭）
const DEST = path.join(here, "..", "private", "material", process.env.VIDEO_TAG ?? "2026-11-05-冒頭-v2");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SCENES = ["s1-clocks", "s2-legs", "s3-body", "s4-join", "s5-name", "s6-pull", "s7-curtain", "s8-title"];
const OPENING = "opening.mp4";
const want = process.argv.slice(2).length ? process.argv.slice(2) : SCENES;

fs.mkdirSync(OUT_TMP, { recursive: true });
fs.mkdirSync(DEST, { recursive: true });
const copy = (name) => fs.writeFileSync(path.join(DEST, name), fs.readFileSync(path.join(OUT_TMP, name)));

const markFile = path.join(here, "..", "private", "brand", "portal-mark.svg");
const inputProps = fs.existsSync(markFile) ? { mark: `data:image/svg+xml;base64,${fs.readFileSync(markFile).toString("base64")}` } : {};
console.log("portal mark:", inputProps.mark ? "private/brand/portal-mark.svg" : "一般的な印");

const t0 = Date.now();
const serveUrl = await bundle({ entryPoint: path.join(here, "src", "index.ts") });
const log = [];
for (const id of want) {
  const comp = await selectComposition({ serveUrl, id, browserExecutable: CHROME, inputProps });
  const s = Date.now();
  await renderMedia({ serveUrl, composition: comp, codec: "h264", pixelFormat: "yuv420p", outputLocation: path.join(OUT_TMP, `${id}.mp4`), browserExecutable: CHROME, imageFormat: "png", inputProps });
  await renderStill({ serveUrl, composition: comp, frame: comp.durationInFrames - 1, output: path.join(OUT_TMP, `${id}.png`), browserExecutable: CHROME, inputProps });
  copy(`${id}.mp4`);
  copy(`${id}.png`);
  log.push({ id, frames: comp.durationInFrames, sec: comp.durationInFrames / comp.fps, renderSec: (Date.now() - s) / 1000 });
  console.log(id, comp.durationInFrames, "frames", ((Date.now() - s) / 1000).toFixed(1), "s");
}

// 全部の場面がそろっていれば、ffmpeg で 1 本につなぐ（再エンコードせず、同じ形の mp4 を並べる）
if (want.length === SCENES.length && SCENES.every((id) => fs.existsSync(path.join(OUT_TMP, `${id}.mp4`)))) {
  const list = path.join(OUT_TMP, "list.txt");
  fs.writeFileSync(list, SCENES.map((id) => `file '${id}.mp4'`).join("\n") + "\n");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "-movflags", "+faststart", OPENING], { cwd: OUT_TMP });
  copy(OPENING);
  const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height,r_frame_rate,nb_frames:format=duration", "-of", "json", OPENING], { cwd: OUT_TMP }).toString();
  console.log("opening", probe.replace(/\s+/g, " "));
}
// 折り紙の手順の一覧（静止画 1 枚。冒頭を全部書き出すときだけ）
if (want.length === SCENES.length) {
  const comp = await selectComposition({ serveUrl, id: "origami-steps", browserExecutable: CHROME });
  await renderStill({ serveUrl, composition: comp, frame: 0, output: path.join(OUT_TMP, "origami-steps.png"), browserExecutable: CHROME });
  copy("origami-steps.png");
}
fs.writeFileSync(path.join(OUT_TMP, "render-log.json"), JSON.stringify({ at: new Date().toISOString(), totalSec: (Date.now() - t0) / 1000, scenes: log }, null, 2));
copy("render-log.json");
console.log("total", ((Date.now() - t0) / 1000).toFixed(1), "s →", DEST);
