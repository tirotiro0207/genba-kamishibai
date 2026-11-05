// 小物を 1 つずつ SVG に書き出す（11/5）。assets/props/<名前>.svg に、人と同じ縁の太さで、小物だけを真ん中に描く。
// 使い方: npx tsx scripts/export-props.ts [書き出す先のフォルダ]
// 床に置く物は下の真ん中、ほかは真ん中に置く。吹き出し・天井まで届く綱・床の端のような、場面の中でしか形にならない物は書き出さない
import { mkdirSync, writeFileSync } from "node:fs";
import { BUBBLES, PROP_KINDS, type PropKind, propsSvg } from "../src/shared/picto/props";
import { checkStyle } from "../src/shared/picto/style";

const OUT = process.argv[2] ?? "assets/props";
const SIZE = 256;
/** 場面の中でしか形にならない物 */
const SKIP = new Set<PropKind>(["anchor_line", "edge"]);
/** 床に置く物（props.ts の ON_FLOOR と同じ。c が下の真ん中） */
const FLOOR = new Set<PropKind>([
  "toolbox", "trash_bin", "cone", "barrier", "ladder", "stepladder", "fire_extinguisher", "hot_pot", "cart", "forklift", "bucket", "chemical", "gas_cylinder",
  "cubicle", "work_platform", "rolling_scaffold", "safety_shoes", "step_stool", "crane", "insulated_boots", "aerial_platform",
]);
/** 背の高い物は小さめに（枠からはみ出さない） */
const TALL = new Set<PropKind>(["crane", "rolling_scaffold", "aerial_platform", "suspended_load", "stepladder", "ladder", "work_platform", "insulated_boots", "harness", "broom", "mop"]);

mkdirSync(OUT, { recursive: true });
const bad: string[] = [];
let count = 0;
for (const kind of PROP_KINDS) {
  if (BUBBLES.has(kind) || SKIP.has(kind)) continue;
  const size = TALL.has(kind) ? 0.36 : 0.5;
  const at = FLOOR.has(kind) ? { x: 0.5, y: 0.94 } : { x: 0.5, y: kind === "harness" ? 0.62 : 0.5 };
  const body = propsSvg([{ kind, at, size }], [], SIZE);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${body}</svg>`;
  const errs = checkStyle(svg);
  if (errs.length) bad.push(`${kind}: ${errs.join(" / ")}`);
  writeFileSync(`${OUT}/${kind}.svg`, svg + "\n");
  count++;
}
console.log(`${count} 個を ${OUT} に書き出した`);
if (bad.length) {
  console.error(bad.join("\n"));
  process.exit(1);
}
