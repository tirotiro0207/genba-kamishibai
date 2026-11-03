// 参考絵（<No>_<id>/front・oblique・side の SVG）を 4 倍の PNG に描き戻す。顔の位置を細かく測るため（scripts/picto-hair-trace.py が使う）
// 使い方: npx tsx scripts/picto-hair-render.ts <参考絵の置き場> <描き戻しの置き場>
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const [src, out] = process.argv.slice(2);
for (const dir of readdirSync(src).filter((d) => /^\d\d_/.test(d))) {
  mkdirSync(`${out}/${dir}`, { recursive: true });
  for (const fn of ["front", "oblique", "side"]) {
    const svg = readFileSync(`${src}/${dir}/${fn}.svg`, "utf-8");
    writeFileSync(`${out}/${dir}/${fn}.png`, new Resvg(svg, { fitTo: { mode: "zoom", value: 4 }, background: "#fff" }).render().asPng());
  }
}
console.log("ok");
