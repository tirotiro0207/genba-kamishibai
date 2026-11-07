// 台本 v3（11/7 夜）の通しを書き出す: 1 本の mp4 と、場面ごとの静止画。
// 先に python video/prep-v3.py <素材の置き場> で写真と事例シートを out/pub/v3/ に整え、node render-full.mjs --stills を 1 度流して録画を out/pub に写しておく。
// 書き出すのは git の外（../private/material/<VIDEO_TAG>/。既定は日時つきの新しい置き場で、前の書き出しを上書きしない）。ローカルで書き出すだけで、API は使わない。
// 使い方: node render-v3.mjs [--stills] [秒 …]（--stills は静止画だけ。秒を渡すと、その秒の静止画だけ）
//   VIDEO_FINAL=1 を付けると、仮の札・版の札・括弧の仮の字幕が v3.tsx に残っていたら止まる
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(here, "out", "pub");
const TMP = path.join(here, "out", "v3");
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
const DEST = path.join(here, "..", "private", "material", process.env.VIDEO_TAG ?? `v3-${stamp}`);
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SRC = fs.readFileSync(path.join(here, "src", "v3.tsx"), "utf8");
const args = process.argv.slice(2);
const stillsOnly = args.includes("--stills");
const only = args.filter((a) => /^[\d.]+$/.test(a)).map(Number);

if (process.env.VIDEO_FINAL === "1") {
  const left = [
    ...[...SRC.matchAll(/\{ id: "([^"]+)",[^\n]*kari: "/g)].map((m) => `仮の札: ${m[1]}`),
    ...(SRC.includes("<Draft3 />") ? ["版の札（Draft3）"] : []),
    ...[...SRC.matchAll(/\[[\d.]+, [\d.]+, "（([^"]*)"\]/g)].map((m) => `仮の字幕: （${m[1]}`),
  ];
  if (left.length) throw new Error(`VIDEO_FINAL=1 だが、仮のまま残っている: ${left.join(" / ")}`);
}
for (const f of ["v3/a1.jpg", "v3/a2.jpg", "v3/a3.jpg", "v3/a5.jpg", "v3/a6.jpg", "v3/sheet.png", "v3/fold.png", "v3/demo.mp4", "v3/hearing.mp4", "v3/why.mp4", "v3/notrans.mp4", "v3/trial.mp4", "v3/voice.mp4"]) {
  if (!fs.existsSync(path.join(PUB, f))) throw new Error(`素材が無い: out/pub/${f}（先に python video/prep-v3.py <素材の置き場>）`);
}
for (const d of [TMP, path.join(DEST, "scenes")]) fs.mkdirSync(d, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(here, "src", "index.ts"), publicDir: PUB });
const comp = await selectComposition({ serveUrl, id: "v3", browserExecutable: CHROME });
const t0 = Date.now();
const SEGS = [...SRC.matchAll(/\{ id: "([^"]+)", title: "[^"]*", at: ([\d.]+), len: ([\d.]+)/g)].map((m) => ({ id: m[1], at: +m[2], len: +m[3] }));
if (Math.abs(SEGS.reduce((a, s) => a + s.len, 0) - 180) > 1e-6) throw new Error(`場面の表の長さが 180 秒でない（${SEGS.length} 場面）`);
const shots = only.length ? only.map((s) => ({ name: `t${String(s).replace(".", "_")}.png`, s })) : SEGS.map((g, i) => ({ name: `${String(i + 1).padStart(2, "0")}-${g.id}.png`, s: g.at + g.len / 2 }));
for (const sh of shots) {
  await renderStill({ serveUrl, composition: comp, frame: Math.min(5399, Math.round(sh.s * 30)), output: path.join(TMP, sh.name), browserExecutable: CHROME });
  fs.copyFileSync(path.join(TMP, sh.name), path.join(DEST, "scenes", sh.name));
}
if (!stillsOnly && !only.length) {
  const out = path.join(TMP, "full.mp4");
  await renderMedia({ serveUrl, composition: comp, codec: "h264", pixelFormat: "yuv420p", outputLocation: out, browserExecutable: CHROME, imageFormat: "jpeg", jpegQuality: 92, scale: 1.5 });
  fs.copyFileSync(out, path.join(DEST, "full.mp4"));
  console.log("full", execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height,nb_frames:format=duration", "-of", "json", out]).toString().replace(/\s+/g, " "));
}
console.log("total", ((Date.now() - t0) / 1000).toFixed(1), "s →", DEST);
