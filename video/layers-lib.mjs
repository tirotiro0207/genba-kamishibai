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
export async function bundleOnce() {
  for (const f of ["fold.mp4", "card.mp4", "danger.mp4", "queue.mp4", "route.mp4", "fix.mp4", "sign.mp4", "read.mp4"]) {
    if (!fs.existsSync(path.join(PUB, f))) throw new Error(`素材が無い: ${f}（先に node render-full.mjs --stills を 1 度流す）`);
  }
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
