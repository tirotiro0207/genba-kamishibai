// 絵コンテ v6（11/7 夜）の通しを書き出す: 1 本の mp4（音を重ねたもの）と、段ごとの静止画。
// 先に python video/prep-footage-v3.py private/footage-v6.json <素材の置き場> private/rec で out/pub/v6/ を作り、
// python video/sound-v6.py で音（out/v6/sound.wav）を作っておく。v3 の素材（out/pub/v3/）も使う。
// E の段（デモ）の素材は python video/prep-demo-v6.py <録画の置き場> で作る（切る秒は demo-cuts-v6.json）。
// 書き出すのは git の外（../private/material/<VIDEO_TAG>/。既定は日時つきの新しい置き場で、前の書き出しを上書きしない）。API は使わない。
// クレジットの字は CREDITS_FILE（git の外のテキスト。1 行 1 行）から読んで props で渡す（名前と社名を git に入れない）。
// 使い方: node render-v6.mjs [--stills] [秒 …]（--stills は静止画だけ。秒を渡すと、その秒の静止画だけ）
//   VIDEO_FINAL=1 を付けると、仮の画（自撮り・数字の枠）と「通しの仮版」の札が残っていたら止まる
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(here, "out", "pub");
const TMP = path.join(here, "out", "v6");
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
const DEST = path.join(here, "..", "private", "material", process.env.VIDEO_TAG ?? `v6-${stamp}`);
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SRC = fs.readFileSync(path.join(here, "src", "v6.tsx"), "utf8");
const args = process.argv.slice(2);
const stillsOnly = args.includes("--stills");
const only = args.filter((a) => /^[\d.]+$/.test(a)).map(Number);

if (process.env.VIDEO_FINAL === "1") {
  const m = SRC.match(/export const KARI6 = \[([^\]]*)\]/);
  if (!m || m[1].trim()) throw new Error(`VIDEO_FINAL=1 だが、仮のまま残っている: ${m ? m[1] : "KARI6 が見つからない"}`);
}
const CREDITS_FILE = process.env.CREDITS_FILE;
if (!CREDITS_FILE || !fs.existsSync(CREDITS_FILE)) throw new Error("CREDITS_FILE（クレジットの字のファイル）が無い");
const credits = fs.readFileSync(CREDITS_FILE, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
if (credits.length !== 6) throw new Error(`クレジットが 6 行でない: ${credits.length} 行`);
for (const f of ["v6/a7.png", "v6/a6.jpg", "v6/sheet.png", "v6/hand1.mp4", "v6/hand2.mp4", "v6/sign.mp4", "v6/pc1.mp4", "v6/pc2.mp4", "v6/t1.mp4", "v6/t2.mp4", "v6/panels.png", "v6/e9.png", "v6/g_last.png", "v3/fold.png", "v6/demo.mp4", "v6/notrans.mp4", "v3/trial.mp4", "v3/voice.mp4"]) {
  if (!fs.existsSync(path.join(PUB, f))) throw new Error(`素材が無い: out/pub/${f}`);
}
for (const d of [TMP, path.join(DEST, "scenes")]) fs.mkdirSync(d, { recursive: true });
const inputProps = { credits };
const serveUrl = await bundle({ entryPoint: path.join(here, "src", "index.ts"), publicDir: PUB });
const comp = await selectComposition({ serveUrl, id: "v6", inputProps, browserExecutable: CHROME });
const t0 = Date.now();
const SEGS = [...SRC.matchAll(/\{ id: "([^"]+)", title: "[^"]*", at: ([\d.]+), len: ([\d.]+)/g)].map((m) => ({ id: m[1], at: +m[2], len: +m[3] }));
if (Math.abs(SEGS.reduce((a, s) => a + s.len, 0) - 180) > 1e-6) throw new Error(`段の表の長さが 180 秒でない（${SEGS.length} 段）`);
const shots = only.length ? only.map((s) => ({ name: `t${String(s).replace(".", "_")}.png`, s })) : SEGS.map((g, i) => ({ name: `${String(i + 1).padStart(2, "0")}-${g.id}.png`, s: g.at + g.len / 2 }));
for (const sh of shots) {
  await renderStill({ serveUrl, composition: comp, inputProps, frame: Math.min(5399, Math.round(sh.s * 30)), output: path.join(TMP, sh.name), browserExecutable: CHROME });
  fs.copyFileSync(path.join(TMP, sh.name), path.join(DEST, "scenes", sh.name));
}
if (!stillsOnly && !only.length) {
  const silent = path.join(TMP, "full-silent.mp4");
  await renderMedia({ serveUrl, composition: comp, inputProps, codec: "h264", pixelFormat: "yuv420p", outputLocation: silent, browserExecutable: CHROME, imageFormat: "jpeg", jpegQuality: 92, scale: 1.5, muted: true });
  const wav = path.join(TMP, "sound.wav");
  const out = path.join(TMP, "full.mp4");
  if (fs.existsSync(wav)) execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", "180", out]);
  else fs.copyFileSync(silent, out);
  fs.copyFileSync(out, path.join(DEST, "full.mp4"));
  console.log("full", execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,nb_frames,duration:format=duration", "-of", "json", out]).toString().replace(/\s+/g, " "));
}
console.log("total", ((Date.now() - t0) / 1000).toFixed(1), "s →", DEST);
