// 通しの動画を 5 つのレイヤーに分けて全部書き出し、重ねて full.mp4 にする（最初の 1 回と、全部を作り直すときだけ使う。直すときは patch.mjs）。
// 使い方: node render-layers.mjs [L1-ground L2-box ...]（名前を渡すと、そのレイヤーだけ書き出してから重ね直す）
// 出たものは video/out/layers/（.mov）と、private/material/<VIDEO_TAG>/full.mp4（git の外。前の版の置き場は上書きしない）
import fs from "node:fs";
import path from "node:path";
import { bundleOnce, compose, frameCount, FRAMES, here, LAYER_IDS, movOf, renderLayer } from "./layers-lib.mjs";

const DEST = path.join(here, "..", "private", "material", process.env.VIDEO_TAG ?? "2026-11-05-通し-v4");
fs.mkdirSync(DEST, { recursive: true });
const want = process.argv.slice(2).filter((a) => LAYER_IDS.includes(a));
const ids = want.length ? want : LAYER_IDS;
const serveUrl = await bundleOnce();
const times = {};
for (const id of ids) {
  times[id] = await renderLayer(serveUrl, id, movOf(id));
  const n = frameCount(movOf(id));
  if (n !== FRAMES) throw new Error(`${id} のコマ数が ${n}（${FRAMES} のはず）`);
  console.log(id, "書き出し", times[id].toFixed(1), "s", (fs.statSync(movOf(id)).size / 1e9).toFixed(2), "GB");
}
const tmp = path.join(here, "out", "full", "full.mp4");
fs.mkdirSync(path.dirname(tmp), { recursive: true });
times.compose = compose(tmp);
fs.writeFileSync(path.join(DEST, "full.mp4"), fs.readFileSync(tmp));
console.log("重ねる", times.compose.toFixed(1), "s →", DEST);
fs.writeFileSync(path.join(here, "out", "layers", "times.json"), JSON.stringify(times, null, 2));
