// 通しの動画のレイヤー（L1〜L5）を書き出し、重ねるための共通の手（render-layers.mjs と patch.mjs が使う）。
// レイヤーは 1920×1080・30 コマ・5400 コマの ProRes 4444（.mov・透明あり）。ProRes は 1 コマずつ独立した形なので、コマの途中で切ってつないでも画が崩れない。
// 書き出しの置き場は英数字だけの video/out/layers/（git の外）。ローカルで書き出すだけで、API は使わない。
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const here = path.dirname(fileURLToPath(import.meta.url));
export const PUB = path.join(here, "out", "pub");
export const LDIR = path.join(here, "out", "layers");
export const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
export const LAYER_IDS = ["L1-ground", "L2-box", "L3-paper", "L4-cast", "L5-sub"];
export const FRAMES = 5400;
fs.mkdirSync(LDIR, { recursive: true });

export const movOf = (id) => path.join(LDIR, `${id}.mov`);
const FULL_SRC = path.join(here, "src", "full.tsx");
/**
 * 録画の使う長さ（full.tsx の CLIPS の from + dur）が、out/pub の mp4 の長さに収まるかを確かめる。
 * 撮り直しで録画が短くなると、最後のコマが範囲の外になって黙って崩れるため。
 * 11/7 の out/pub の録画は、使う所が終わりを 1 コマ未満はみ出す物がある（書き出しは最後のコマに寄って通る）。1 コマ未満は知らせるだけ、1 コマを超えたら止める
 */
export function checkClips(src = fs.readFileSync(FULL_SRC, "utf8")) {
  const clips = [...src.matchAll(/\{ src: "([\w-]+\.mp4)", dur: ([\d.]+)(?:, from: ([\d.]+))?, slot: [\d.]+ \}/g)].map((m) => ({ file: m[1], end: +(m[3] ?? 0) + +m[2] }));
  if (clips.length === 0) throw new Error("full.tsx の CLIPS が読めない");
  const bad = [];
  for (const c of clips) {
    const file = path.join(PUB, c.file);
    if (!fs.existsSync(file)) { bad.push(`${c.file} が無い`); continue; }
    const len = +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim();
    const over = c.end - len;
    const say = `${c.file} は ${len.toFixed(3)} 秒で、使う所は ${c.end.toFixed(3)} 秒まで`;
    if (!(over <= 1 / 30)) bad.push(`${say}（1 コマを超えてはみ出す）`);
    else if (over > 1e-6) console.warn(`録画の長さ: ${say}（1 コマ未満はみ出す。撮り直したら dur を確かめる）`);
  }
  if (bad.length) throw new Error(`録画の長さが足りない。撮り直したら full.tsx の CLIPS の dur を直す: ${bad.join(" / ")}`);
  return clips.length;
}
/**
 * VIDEO_FINAL=1 のとき、仮のまま残っている所（場面の「仮」の札・版の札・括弧で書いた仮の字幕）があれば止める。
 * 仕上げの書き出しに仮の札を焼き込まないため
 */
export function assertFinal(src = fs.readFileSync(FULL_SRC, "utf8")) {
  if (process.env.VIDEO_FINAL !== "1") return;
  const left = [
    ...[...src.matchAll(/\{ id: "([^"]+)",[^\n]*kari: "/g)].map((m) => `仮の札: ${m[1]}`),
    ...(src.includes("<Draft />") ? ["版の札（Draft）"] : []),
    ...[...src.matchAll(/\[[\d.]+, [\d.]+, "（([^"]*)"\]/g)].map((m) => `仮の字幕: （${m[1]}`),
  ];
  if (left.length) throw new Error(`VIDEO_FINAL=1 だが、仮のまま残っている: ${left.join(" / ")}`);
}
export async function bundleOnce() {
  assertFinal();
  for (const f of ["fold.mp4", "card.mp4", "danger.mp4", "queue.mp4", "route.mp4", "fix.mp4", "sign.mp4", "read.mp4"]) {
    if (!fs.existsSync(path.join(PUB, f))) throw new Error(`素材が無い: ${f}（先に node render-full.mjs --stills を 1 度流す）`);
  }
  checkClips();
  return bundle({ entryPoint: path.join(here, "src", "index.ts"), publicDir: PUB });
}
/** id のレイヤーを書き出す。range を渡すと、そのコマだけ（両端を含む） */
export async function renderLayer(serveUrl, id, out, range) {
  const comp = await selectComposition({ serveUrl, id, browserExecutable: CHROME });
  const t0 = Date.now();
  await renderMedia({
    serveUrl, composition: comp, codec: "prores", proResProfile: "4444", imageFormat: "png", pixelFormat: "yuva444p10le",
    muted: true, outputLocation: out, browserExecutable: CHROME, scale: 1.5, frameRange: range ?? null,
  });
  return (Date.now() - t0) / 1000;
}
export const frameCount = (file) => +execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", file]).toString().trim();
/** 5 本を下から重ねて h264 の mp4 にする（重ねるだけで、絵は描き直さない） */
export function compose(out) {
  const t0 = Date.now();
  const ins = LAYER_IDS.flatMap((id) => ["-i", movOf(id)]);
  const chain = "[0][1]overlay[a];[a][2]overlay[b];[b][3]overlay[c];[c][4]overlay,format=yuv420p[v]";
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...ins, "-filter_complex", chain, "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", "30", out]);
  return (Date.now() - t0) / 1000;
}
