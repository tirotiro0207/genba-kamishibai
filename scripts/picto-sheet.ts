// 姿勢を並べた PNG を作る（015〜016 の確かめ用）。出力はリポジトリの private/picto（git に入れない）。
//
//   npx tsx scripts/picto-sheet.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { svgToPng } from "../src/node/png";
import { renderFrame } from "../src/shared/picto/scene";
import { type Bone, type FigureSpec, STANDING } from "../src/shared/picto/skeleton";
import { privatePath } from "../src/node/private-dir";


const fig = (angles: Partial<Record<Bone, number>>, facing: "left" | "right" = "right"): FigureSpec => ({ x: 0.5, height: 0.62, facing, angles: { ...STANDING, ...angles } });

export const SHEET: [string, FigureSpec][] = [
  ["stand", fig({ arm_near_upper: 14, arm_near_lower: 8, arm_far_upper: -12, leg_near_upper: 5, leg_far_upper: -5 })],
  ["stand-left", fig({ arm_near_upper: 14, arm_near_lower: 8, arm_far_upper: -12, leg_near_upper: 5, leg_far_upper: -5 }, "left")],
  ["lean-arms", fig({ torso: 20, neck: 10, arm_near_upper: 60, arm_near_lower: 30, arm_far_upper: 40, arm_far_lower: 50 })],
  ["knee", fig({ torso: 10, leg_near_upper: 95, leg_near_lower: -95, leg_far_upper: 10, leg_far_lower: -100, arm_near_upper: 45, arm_near_lower: 40 })],
];

function main() {
  const out = privatePath("picto");
  mkdirSync(out, { recursive: true });
  // 4 つを 2×2 に並べた 1 枚
  const cell = 384;
  const parts = SHEET.map(([, f], i) => {
    const inner = renderFrame({ figures: [f] }, cell).svg.replace(/^<svg[^>]*>|<\/svg>$/g, "");
    return `<g transform="translate(${(i % 2) * cell} ${Math.floor(i / 2) * cell})">${inner}<rect width="${cell}" height="${cell}" fill="none" stroke="#bbb" stroke-width="2"/></g>`;
  });
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${cell * 2}" height="${cell * 2}">${parts.join("")}</svg>`;
  const file = join(out, "skeleton-sheet.png");
  writeFileSync(file, svgToPng(sheet, cell * 2));
  console.log(`${SHEET.length} 姿勢を並べた PNG を書いた: ${file}`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
