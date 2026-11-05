// 冒頭 0:00〜0:13 だけを書き出す（ローカルで書き出すだけ。API は使わない）。
//   node render-intro.mjs --stills [秒,秒,...]  0.5 秒おきの静止画（と、渡した秒の原寸のコマ）を video/out/intro/ へ
//   node render-intro.mjs --video               opening.mp4（1920×1080）を video/out/intro/ へ
// 置き場は英数字だけの video/out/intro/（git の外）。private/material/ へは書き出したあとに写す
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out", "intro");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
fs.mkdirSync(OUT, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.join(here, "src", "intro-entry.ts"), publicDir: path.join(here, "out", "pub") });
const comp = await selectComposition({ serveUrl, id: "intro", browserExecutable: CHROME });
const args = process.argv.slice(2);

if (args[0] === "--stills") {
  const extra = (args[1] ?? "").split(",").filter(Boolean).map(Number);
  const jobs = [];
  for (let i = 0; i * 15 < comp.durationInFrames; i++) jobs.push({ frame: i * 15, file: `s${String(i).padStart(2, "0")}.png`, scale: 0.5 });
  for (const s of extra) jobs.push({ frame: Math.round(s * 30), file: `full-${s.toFixed(2)}.png`, scale: 1.5 });
  for (const j of jobs) {
    await renderStill({ composition: comp, serveUrl, frame: j.frame, output: path.join(OUT, j.file), scale: j.scale, browserExecutable: CHROME });
  }
  console.log(`静止画 ${jobs.length} 枚 → ${OUT}`);
} else if (args[0] === "--video") {
  const t0 = Date.now();
  await renderMedia({ composition: comp, serveUrl, codec: "h264", outputLocation: path.join(OUT, "opening.mp4"), scale: 1.5, browserExecutable: CHROME, crf: 16 });
  console.log(`opening.mp4（${((Date.now() - t0) / 1000).toFixed(0)} 秒）→ ${OUT}`);
}
