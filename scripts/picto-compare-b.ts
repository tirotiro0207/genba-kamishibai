// 作者が Illustrator で描き直した素の姿（private/picto/illustrator/描き終わり の b_front・b_quarter・b_side）と、
// character.ts が同じ大きさ・同じ位置で描いた立った姿を並べ、違う所を色で示す（API は使わない）。
// 1 段に 1 つの向き: 左が描いた絵、まん中が描画、右が重ねた絵（描いた絵だけの線は赤、描画だけの線は水色、同じ所は黒）。
// 出力はリポジトリの private/picto/illustrator/取り込み（git に入れない）。
//
//   npx tsx scripts/picto-compare-b.ts
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { svgToPng } from "../src/node/png";
import { privatePath } from "../src/node/private-dir";
import { characterSvg, type View } from "../src/shared/picto/character";
import type { Angles } from "../src/shared/picto/poses";
import { BONES } from "../src/shared/picto/skeleton";

const src = privatePath("picto", "illustrator", "描き終わり");
const out = privatePath("picto", "illustrator", "取り込み");
mkdirSync(out, { recursive: true });
const W = 500;
const H = 520;
const HIP = { x: 250, y: 280 };
const ZERO = Object.fromEntries(BONES.map((k) => [k, 0])) as Angles;
const GROUND = 187; // 下絵の地面（腰から下へ。足 162 と靴底 25）

const views: View[] = ["front", "quarter", "side"];
const rows = views.map((v) => {
  // 描いた絵は目印（guide）を外して描く
  const drawn = readFileSync(join(src, `b_${v}.svg`), "utf-8").replace(/<g id="guide"[\s\S]*?<\/g>/, "");
  const mine = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>` +
    characterSvg({ angles: ZERO, x: HIP.x, groundY: HIP.y + GROUND, height: 434, facing: "right", view: v, hair: "bob" }) + "</svg>";
  const a = join(out, `drawn_${v}.png`);
  const b = join(out, `mine_${v}.png`);
  writeFileSync(a, svgToPng(drawn, W));
  writeFileSync(b, svgToPng(mine, W));
  writeFileSync(join(out, `b_${v}.svg`), mine, "utf-8");
  return [a, b];
});

// 重ねた絵: 描いた絵の暗さを赤の抜け、描画の暗さを青の抜けにする（両方暗い所は黒）
const inputs = rows.flat().flatMap((f) => ["-i", f]);
const parts = views.map((_, i) => {
  const [a, b] = [i * 2, i * 2 + 1];
  // gbrp の面の順は G・B・R。G と B に描いた絵、R に描画を入れる（描いた絵だけ暗い所は赤、描画だけ暗い所は水色）
  return `[${a}:v]format=gray,split=3[a${i}][g${i}][k${i}];[${b}:v]format=gray,split[b${i}][h${i}];` +
    `[g${i}][k${i}][h${i}]mergeplanes=0x001020:gbrp,format=rgb24[o${i}];` +
    `[a${i}]format=rgb24[x${i}];[b${i}]format=rgb24[y${i}];[x${i}][y${i}][o${i}]hstack=3[r${i}]`;
});
const filter = `${parts.join(";")};${views.map((_, i) => `[r${i}]`).join("")}vstack=${views.length}`;
const sheet = join(out, "比較_描いた絵_描画.png");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", filter, "-frames:v", "1", sheet]);
console.log(`比べた 1 枚 ${sheet}`);
