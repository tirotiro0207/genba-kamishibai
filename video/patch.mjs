// 1 つのレイヤーの、決めたコマだけを書き出し直して差し替え、full.mp4 を重ね直す（11/5 夜 作者の指示: 直すたびに全部を書き出し直さない）。
// 使い方: node patch.mjs <レイヤー> <開始コマ> <終わりコマ>（両端を含む。秒 × 30 ＝ コマ。表は video/layers.md）
//   例: node patch.mjs L4-cast 1365 1484（0:45.5〜0:49.5 の放り出し）
// 前・新しい所・後ろを ffmpeg でつなぐ（コピーでつなぎ、作り直さない）。差し替えたら、つなぎ目の前後 1 コマずつを 1 枚に並べる（out/layers/seam-<レイヤー>.png）
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { bundleOnce, compose, frameCount, FRAMES, here, LAYER_IDS, LDIR, movOf, renderLayer } from "./layers-lib.mjs";

const [id, a, b] = process.argv.slice(2);
const s = +a;
const e = +b;
if (!LAYER_IDS.includes(id) || !(s >= 0 && e >= s && e < FRAMES)) {
  console.error("使い方: node patch.mjs <L1-ground|L2-box|L3-paper|L4-cast|L5-sub> <開始コマ> <終わりコマ>");
  process.exit(1);
}
const src = movOf(id);
if (!fs.existsSync(src)) throw new Error(`${src} が無い（先に node render-layers.mjs）`);
const t0 = Date.now();
const serveUrl = await bundleOnce();
const mid = path.join(LDIR, "patch-mid.mov");
const tr = await renderLayer(serveUrl, id, mid, [s, e]);
const ff = (...args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
const head = path.join(LDIR, "patch-head.mov");
const tail = path.join(LDIR, "patch-tail.mov");
const parts = [];
// 前（0〜s-1）と後ろ（e+1〜最後）は、元のレイヤーからコピーで切り出す（ProRes は全部のコマが区切りなので、コマの所で切れる）
if (s > 0) { ff("-i", src, "-frames:v", String(s), "-c", "copy", "-an", head); parts.push(head); }
parts.push(mid);
if (e < FRAMES - 1) { ff("-ss", ((e + 1 + 0.5) / 30).toFixed(4), "-i", src, "-c", "copy", "-an", tail); parts.push(tail); }
const list = path.join(LDIR, "patch-list.txt");
fs.writeFileSync(list, parts.map((p) => `file '${p.replaceAll("\\", "/")}'`).join("\n"));
const joined = path.join(LDIR, "patch-joined.mov");
// つないだあと、コマの時刻を 0, 1/30, 2/30 … に振り直す（つなぎ目でコマの時刻が前のコマとほぼ同じになり、次の差し替えで後ろの頭の 1 コマが落ちていた。11/5 夜）
const raw = path.join(LDIR, "patch-raw.mov");
ff("-f", "concat", "-safe", "0", "-i", list, "-c", "copy", raw);
ff("-i", raw, "-c", "copy", "-an", "-bsf:v", "setts=pts=N/(30*TB):dts=N/(30*TB)", joined);
fs.unlinkSync(raw);
const n = frameCount(joined);
const counts = parts.map(frameCount);
if (n !== FRAMES) throw new Error(`つないだ長さが ${n} コマ（${FRAMES} のはず。前・中・後ろ ${counts.join("・")}）`);
fs.renameSync(joined, src);
for (const p of [head, tail, mid, list]) if (fs.existsSync(p)) fs.unlinkSync(p);
const tj = Date.now();
// full.mp4 を重ね直す
const DEST = path.join(here, "..", "private", "material", process.env.VIDEO_TAG ?? "2026-11-05-通し-v4");
const tmp = path.join(here, "out", "full", "full.mp4");
// 新しい VIDEO_TAG で最初に流しても落ちないように、置き場を作っておく
for (const d of [DEST, path.dirname(tmp)]) fs.mkdirSync(d, { recursive: true });
const tc = compose(tmp);
fs.writeFileSync(path.join(DEST, "full.mp4"), fs.readFileSync(tmp));
// つなぎ目の前後 1 コマずつ（s-1, s, e, e+1）を 1 枚に並べる
const seam = [s - 1, s, e, e + 1].filter((f) => f >= 0 && f < FRAMES);
const sel = seam.map((f) => `eq(n\\,${f})`).join("+");
ff("-i", src, "-vf", `select='${sel}',scale=480:-1,tile=${seam.length}x1:color=0x33aa33`, "-vsync", "0", "-frames:v", "1", path.join(LDIR, `seam-${id}.png`));
console.log(JSON.stringify({ id, frames: [s, e], render: +tr.toFixed(1), join: +((tj - t0) / 1000 - tr).toFixed(1), compose: +tc.toFixed(1), total: +((Date.now() - t0) / 1000).toFixed(1), parts: counts }));
