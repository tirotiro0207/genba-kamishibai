// 新しい絵柄の人を、骨格の角度の決まりと名前の付いた姿勢（poses.ts）で動かして、崩れる所を探す（API は使わない）。
// 1 枚目: 8 つの姿勢を斜めと真横で並べた表と、関節を範囲のはしまで回した 10 の姿。
// 2 本目: 8 つの姿勢を順に補間してつないだ動画（左が斜め、右が真横）。
// 出力はリポジトリの private/picto/lab/character（git に入れない）。
//
//   npx tsx scripts/picto-character.ts
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { svgToPng } from "../src/node/png";
import { privatePath } from "../src/node/private-dir";
import { characterSvg, type View } from "../src/shared/picto/character";
import { type Angles, POSE_NAMES, POSES } from "../src/shared/picto/poses";
import { BONES, STANDING } from "../src/shared/picto/skeleton";

const out = privatePath("picto", "lab", "character");
mkdirSync(out, { recursive: true });
const CELL = 300;
const cell = (a: Angles, view: View, i: number, row: number, role: "new" | "lead" = "new") =>
  `<g transform="translate(${i * CELL} ${row * CELL})"><rect x="4" y="4" width="${CELL - 8}" height="${CELL - 8}" fill="#fff" stroke="#000" stroke-width="4"/>` +
  `<path d="M4 ${CELL - 40}H${CELL - 4}" stroke="#000" stroke-width="3"/>${characterSvg({ angles: a, x: CELL * 0.45, groundY: CELL - 40, height: CELL * 0.62, facing: "right", view, role })}</g>`;

// 範囲のはし（ほかは立った姿のまま）
const EXTREMES: [string, Partial<Angles>][] = [
  ["胴 95", { torso: 95 }], ["胴 −30", { torso: -30 }], ["首 50", { neck: 50 }], ["首 −40", { neck: -40 }],
  ["腕 200", { arm_near_upper: 200 }], ["腕 −60", { arm_near_upper: -60 }], ["ひじ 150", { arm_near_upper: 60, arm_near_lower: 150 }],
  ["もも 120", { leg_near_upper: 120 }], ["ひざ −150", { leg_near_upper: 60, leg_near_lower: -150 }], ["もも −45", { leg_near_upper: -45 }],
];
const rows = [
  POSE_NAMES.map((k, i) => cell(POSES[k], "quarter", i, 0)),
  POSE_NAMES.map((k, i) => cell(POSES[k], "side", i, 1, "lead")),
  EXTREMES.map(([, a], i) => cell({ ...STANDING, ...a }, "quarter", i, 2)),
];
const W = CELL * 10;
writeFileSync(join(out, "poses.png"), svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${CELL * 3}" viewBox="0 0 ${W} ${CELL * 3}"><rect width="${W}" height="${CELL * 3}" fill="#fff"/>${rows.flat().join("")}</svg>`, W));
console.log(`表: 1 段目 斜め・2 段目 真横（施工管理）= ${POSE_NAMES.join("・")} / 3 段目 範囲のはし = ${EXTREMES.map((e) => e[0]).join("・")}`);

// 動画: 姿勢を 0.8 秒ずつ、なめらかにつなぐ
const FPS = 30;
const HOLD = 0.3;
const MOVE = 0.5;
const seq = [...POSE_NAMES, POSE_NAMES[0]];
const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: Angles, b: Angles, t: number) => Object.fromEntries(BONES.map((k) => [k, a[k] + (b[k] - a[k]) * t])) as Angles;
const frames = join(out, "frames");
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
let f = 0;
for (let i = 0; i < seq.length - 1; i++) {
  const a = POSES[seq[i]];
  const b = POSES[seq[i + 1]];
  const total = Math.round((HOLD + MOVE) * FPS);
  for (let j = 0; j < total; j++) {
    const t = j / FPS < HOLD ? 0 : ease((j / FPS - HOLD) / MOVE);
    const ang = lerp(a, b, t);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="750" viewBox="0 0 1000 750"><rect width="1000" height="750" fill="#fff"/><rect x="20" y="20" width="960" height="710" fill="none" stroke="#000" stroke-width="8"/><path d="M20 660H980" stroke="#000" stroke-width="6"/>` +
      characterSvg({ angles: ang, x: 300, groundY: 660, height: 440, facing: "right", view: "quarter" }) +
      characterSvg({ angles: ang, x: 720, groundY: 660, height: 440, facing: "left", view: "side", role: "lead" }) + "</svg>";
    writeFileSync(join(frames, `f${String(f++).padStart(5, "0")}.png`), svgToPng(svg, 1000));
  }
}
const video = join(out, "poses.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "f%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", video]);
rmSync(frames, { recursive: true, force: true });
console.log(`動画 ${video}（${(f / FPS).toFixed(1)} 秒）`);

// 足元の拡大: すねの傾きがいろいろな姿で、靴の口がすねに付いているかを見る
const FEET: Partial<Angles>[] = [
  POSES.stand, POSES.walk, POSES.squat, POSES.fall,
  { leg_near_upper: 40, leg_near_lower: -10, leg_far_upper: -30, leg_far_lower: -40 },
  { leg_near_upper: 60, leg_near_lower: -100, leg_far_upper: 0 },
];
const FW = 500;
const feet = FEET.map((a, i) =>
  `<g transform="translate(${i * FW} 0)"><svg x="0" y="0" width="${FW}" height="420" viewBox="0 0 ${FW} 420"><rect width="${FW}" height="420" fill="#fff" stroke="#000" stroke-width="6"/><path d="M0 380H${FW}" stroke="#000" stroke-width="4"/>` +
  characterSvg({ angles: { ...STANDING, ...a }, x: FW * 0.45, groundY: 380, height: 760, facing: "right", view: "side" }) + "</svg></g>");
writeFileSync(join(out, "feet.png"), svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${FW * FEET.length}" height="420"><rect width="100%" height="100%" fill="#fff"/>${feet.join("")}</svg>`, FW * FEET.length));
console.log(`足元 ${join(out, "feet.png")}`);
