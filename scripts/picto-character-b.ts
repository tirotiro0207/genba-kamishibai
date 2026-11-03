// 別の道（b: 作者の手描きのスケッチから起こした髪・まつ毛の目・点の鼻の顔）の試し（API は使わない）。
// 1 枚目 heads.png: 頭を大きく。髪形 3 つ × かぶり物あり・なし、正面・斜め・真横。
// 2 枚目 poses.png: 名前の付いた 8 つの姿勢を、正面と斜め（おかっぱ）と真横（短い髪・かぶり物）で。
// 3 本目 poses.mp4: 8 つの姿勢を順につないだ動画。
// 出力はリポジトリの private/picto/lab/route-b（git に入れない）。
//
//   npx tsx scripts/picto-character-b.ts
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { svgToPng } from "../src/node/png";
import { privatePath } from "../src/node/private-dir";
import { type CharacterSpec, characterSvg, type Hair } from "../src/shared/picto/character";
import { type Angles, POSE_NAMES, POSES } from "../src/shared/picto/poses";
import { BONES, STANDING } from "../src/shared/picto/skeleton";

const out = privatePath("picto", "lab", "route-b");
mkdirSync(out, { recursive: true });
const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fff"/>${body}</svg>`;
const frame = (x: number, y: number, w: number, h: number) => `<rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" fill="none" stroke="#000" stroke-width="4"/>`;

// 頭を大きく: 胸から上だけ見えるよう、背を大きくして枠で切る
const HEADS: { hair: Hair; hat: boolean; role: CharacterSpec["role"] }[] = [
  { hair: "bob", hat: false, role: "new" }, { hair: "short", hat: false, role: "new" }, { hair: "bun", hat: false, role: "new" },
  { hair: "bob", hat: true, role: "new" }, { hair: "short", hat: true, role: "lead" }, { hair: "bun", hat: true, role: "worker" },
];
const HW = 360;
const head = (spec: (typeof HEADS)[number], view: "front" | "quarter" | "side", i: number, row: number) =>
  `<svg x="${i * HW}" y="${row * HW}" width="${HW}" height="${HW}" viewBox="0 0 ${HW} ${HW}">` +
  characterSvg({ angles: STANDING, x: HW * 0.5, groundY: HW * 2.3, height: HW * 2.1, facing: "right", view, look: "b", ...spec }) +
  `</svg>${frame(i * HW, row * HW, HW, HW)}`;
const hw = HW * HEADS.length;
writeFileSync(join(out, "heads.png"), svgToPng(svg(hw, HW * 3, (["front", "quarter", "side"] as const).flatMap((v, row) => HEADS.map((h, i) => head(h, v, i, row))).join("")), hw));

// スケッチと並べる（スケッチの絵のところを切り出して、同じ高さにそろえる）
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(out, "sketch.jpg"), "-i", join(out, "heads.png"),
  "-filter_complex", "[0:v]crop=360:460:130:360,scale=-1:360[a];[1:v]crop=360:360:0:0[b];[a][b]hstack=2", "-frames:v", "1", join(out, "sketch_vs.png")]);

// 8 つの姿勢
const CELL = 300;
const cell = (a: Angles, i: number, row: number, extra: Partial<CharacterSpec>) =>
  `<g transform="translate(${i * CELL} ${row * CELL})">${frame(0, 0, CELL, CELL)}<path d="M4 ${CELL - 40}H${CELL - 4}" stroke="#000" stroke-width="3"/>` +
  characterSvg({ angles: a, x: CELL * 0.45, groundY: CELL - 40, height: CELL * 0.62, facing: "right", look: "b", ...extra }) + "</g>";
const pw = CELL * POSE_NAMES.length;
writeFileSync(join(out, "poses.png"), svgToPng(svg(pw, CELL * 3, [
  ...POSE_NAMES.map((k, i) => cell(POSES[k], i, 0, { view: "front", hair: "bob" })),
  ...POSE_NAMES.map((k, i) => cell(POSES[k], i, 1, { view: "quarter", hair: "bob" })),
  ...POSE_NAMES.map((k, i) => cell(POSES[k], i, 2, { view: "side", hair: "short", hat: true, role: "lead" })),
].join("")), pw));

// 動画
const FPS = 30;
const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: Angles, b: Angles, t: number) => Object.fromEntries(BONES.map((k) => [k, a[k] + (b[k] - a[k]) * t])) as Angles;
const frames = join(out, "frames");
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
const seq = [...POSE_NAMES, POSE_NAMES[0]];
let f = 0;
for (let i = 0; i < seq.length - 1; i++) {
  for (let j = 0; j < 24; j++) {
    const t = j < 9 ? 0 : ease((j - 9) / 15);
    const ang = lerp(POSES[seq[i]], POSES[seq[i + 1]], t);
    const body = `<rect x="20" y="20" width="960" height="710" fill="none" stroke="#000" stroke-width="8"/><path d="M20 660H980" stroke="#000" stroke-width="6"/>` +
      characterSvg({ angles: ang, x: 300, groundY: 660, height: 440, facing: "right", view: "quarter", look: "b", hair: "bob" }) +
      characterSvg({ angles: ang, x: 720, groundY: 660, height: 440, facing: "left", view: "side", look: "b", hair: "short", hat: true, role: "lead" });
    writeFileSync(join(frames, `f${String(f++).padStart(5, "0")}.png`), svgToPng(svg(1000, 750, body), 1000));
  }
}
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "f%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", join(out, "poses.mp4")]);
rmSync(frames, { recursive: true, force: true });
console.log(`頭 ${join(out, "heads.png")}\nスケッチと並べた ${join(out, "sketch_vs.png")}\n姿勢 ${join(out, "poses.png")}\n動画 ${join(out, "poses.mp4")}（${(f / FPS).toFixed(1)} 秒）`);
