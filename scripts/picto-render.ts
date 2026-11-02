// CSS の @keyframes で動く SVG を、API を呼ばずに動画とコマにする（絵の試行錯誤を手元で回すための道具）。
// 5 秒の動きを 1/30 秒ずつ止めて撮り、ffmpeg で動画にし、指定の時刻のコマを動画から切り出し、コマを横に並べた 1 枚も作る。
// --before に前の版のコマ（PNG）を渡すと、上の段に前の版、下の段に今回を並べる。
//
//   npx tsx scripts/picto-render.ts <動く SVG> <出力のフォルダ> --cuts 1.0,3.2,4.4 [--before a.png,b.png,c.png] [--sec 5]
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const [svgPath, out] = args;
const cutsArg = opt("cuts");
if (!svgPath || !out || !cutsArg) {
  console.log("使い方: npx tsx scripts/picto-render.ts <動く SVG> <出力のフォルダ> --cuts 1.0,3.2,4.4 [--before a.png,b.png,c.png] [--sec 5]");
  process.exit(1);
}
const W = 1000;
const H = 750;
const FPS = 30;
const SEC = Number(opt("sec") ?? 5);
const times = cutsArg.split(",").map(Number);
const svg = readFileSync(svgPath, "utf-8");
mkdirSync(out, { recursive: true });

const frames = join(out, "frames");
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0">${svg}</body>`);
for (let i = 0; i < SEC * FPS; i++) {
  await page.evaluate((ms) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = ms;
    }
  }, (i * 1000) / FPS);
  await page.locator("svg").first().screenshot({ path: join(frames, `f${String(i).padStart(5, "0")}.png`) });
}
await browser.close();

const video = join(out, "motion.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "f%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", video]);
const cuts = times.map((t, i) => {
  const at = Math.min(SEC - 1 / FPS, Math.max(0, t));
  const file = join(out, `cut_${i + 1}.png`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", at.toFixed(3), "-i", video, "-frames:v", "1", file]);
  return file;
});
rmSync(frames, { recursive: true, force: true });

// コマを横に並べた 1 枚（--before があれば上の段に前の版）
const before = opt("before")?.split(",") ?? [];
const rows = before.length ? [before, cuts] : [cuts];
const inputs = rows.flat().flatMap((f) => ["-i", f]);
let k = 0;
const scaled = rows.flat().map((_, i) => `[${i}:v]scale=480:-1[s${i}]`).join(";");
const stacked = rows.map((r, ri) => `${r.map(() => `[s${k++}]`).join("")}hstack=${r.length}[r${ri}]`).join(";");
const filter = rows.length > 1 ? `${scaled};${stacked};${rows.map((_, ri) => `[r${ri}]`).join("")}vstack=${rows.length}` : `${scaled};${stacked.replace(/\[r0\]$/, "")}`;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", filter, "-frames:v", "1", join(out, "sheet.png")]);
writeFileSync(join(out, "cuts.json"), JSON.stringify(times), "utf-8");

if (errors.length) console.log(`ページのエラー ${errors.length} 件: ${errors[0]}`);
console.log(`動画 ${video}\nコマ ${cuts.join(" ")}\n並べた 1 枚 ${join(out, "sheet.png")}`);
