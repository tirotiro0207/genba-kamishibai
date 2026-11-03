// 職場の服と役の印の下絵を並べる（API は使わない）。業種ごとに 1 段、役ごとに 正面・斜め・真横 の全身。
// 出力 1: private/picto/lab/outfit/outfit.png（全業種を並べた 1 枚）と、業種ごとの PNG。
// 出力 2: private/picto/illustrator/修正待ち/部品/部品_<番号>_<業種>.svg（作者が Illustrator で直す下絵。部品は g の id「part_…」）。
//
//   npx tsx scripts/picto-outfit.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { privatePath } from "../src/node/private-dir";
import { characterSvg, type View } from "../src/shared/picto/character";
import { INDUSTRY_DRAFTS } from "../src/shared/picto/industry-drafts";
import { POSES } from "../src/shared/picto/poses";

/** 名前の文字を出すので、本番の PNG（svgToPng。字体を読まない）とは別に、システムの字体を読んで描く */
const svgToPng = (s: string, w: number) =>
  new Resvg(s, { fitTo: { mode: "width", value: w }, background: "#ffffff", font: { loadSystemFonts: true, defaultFontFamily: "Yu Gothic" } }).render().asPng();

const lab = privatePath("picto", "lab", "outfit");
const todo = privatePath("picto", "illustrator", "修正待ち", "部品");
mkdirSync(lab, { recursive: true });
mkdirSync(todo, { recursive: true });

const VIEWS: View[] = ["front", "quarter", "side"];
const CW = 200;
const CH = 330;
const TITLE = 34;
const LABEL = 34;
const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fff"/>${body}</svg>`;
const text = (x: number, y: number, s: string, size = 20) =>
  `<text x="${x}" y="${y}" font-family="Yu Gothic, Meiryo, sans-serif" font-size="${size}" font-weight="bold" fill="#000">${s}</text>`;

const rows = INDUSTRY_DRAFTS.map((ind) => {
  const cells = ind.roles.flatMap((r, ri) => VIEWS.map((view, vi) => {
    const x = (ri * VIEWS.length + vi) * CW;
    const fig = characterSvg({ angles: POSES.stand, x: x + CW / 2, groundY: LABEL + CH - 24, height: 270, facing: "right", view, role: r.role, hair: "short", headwear: r.headwear, outfit: r.outfit });
    const head = vi === 0 ? text(x + 8, LABEL - 8, r.name) : "";
    return `<g id="${ind.id}_${r.name}_${view}">${head}<path d="M${x + 6} ${LABEL + CH - 24}H${x + CW - 6}" stroke="#bbb" stroke-width="2"/>${fig}</g>`;
  }));
  const w = ind.roles.length * VIEWS.length * CW;
  return { ind, w: Math.max(w, 400), body: `${text(8, 26, `${ind.id} ${ind.name}`, 24)}<g transform="translate(0 ${TITLE})">${cells.join("")}</g>` };
});

for (const r of rows) {
  const s = svg(r.w, TITLE + LABEL + CH + 10, r.body);
  writeFileSync(join(lab, `outfit_${r.ind.id}.png`), svgToPng(s, r.w));
  writeFileSync(join(todo, `部品_${r.ind.id}_${r.ind.name.replace(/[・/]/g, "_")}.svg`), s, "utf-8");
}
const W = Math.max(...rows.map((r) => r.w));
const RH = TITLE + LABEL + CH + 20;
const all = svg(W, RH * rows.length, rows.map((r, i) => `<g transform="translate(0 ${i * RH})">${r.body}</g>`).join(""));
writeFileSync(join(lab, "outfit.png"), svgToPng(all, W));
console.log(`並べた絵 ${join(lab, "outfit.png")}\n下絵の SVG ${todo}`);
