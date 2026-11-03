// かぶり物の試し（API は使わない）。髪はその人のもので、かぶり物は職場と場面で付け外しする、という分け方が絵で成り立つかを見る。
// 1 枚目 headwear.png: 段が向き（正面・斜め・真横）、列が髪形 3 つ × かぶり物 4 つ（なし・安全帽・コック帽・衛生キャップ）。
// 2 枚目 roles.png: 安全帽とつばの帽子を、役の明るさ（新人・上の人・ほかの作業の人）で。
// 3 枚目 on_off.png: 同じ人の「かぶっていない」と「かぶった」を並べる（「かぶらないのはダメ」のカードの 2 コマの形）。
// 出力はリポジトリの private/picto/lab/headwear（git に入れない）。
//
//   npx tsx scripts/picto-headwear.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { svgToPng } from "../src/node/png";
import { privatePath } from "../src/node/private-dir";
import { type CharacterSpec, characterSvg, type Hair, type View } from "../src/shared/picto/character";
import { POSES } from "../src/shared/picto/poses";

const out = privatePath("picto", "lab", "headwear");
mkdirSync(out, { recursive: true });
const C = 240;
const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fff"/>${body}</svg>`;
const frame = (x: number, y: number, w: number, h: number) => `<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" fill="none" stroke="#000" stroke-width="3"/>`;
/** 胸から上を大きく */
const bust = (spec: Partial<CharacterSpec>, view: View, col: number, row: number) =>
  `<svg x="${col * C}" y="${row * C}" width="${C}" height="${C}" viewBox="0 0 ${C} ${C}">` +
  characterSvg({ angles: POSES.stand, x: C * 0.5, groundY: C * 2.4, height: C * 2.1, facing: "right", view, ...spec }) +
  `</svg>${frame(col * C, row * C, C, C)}`;

const VIEWS: View[] = ["front", "quarter", "side"];
const HAIRS: Hair[] = ["bob", "short", "bun"];
const KINDS = ["none", "helmet", "chef", "hygiene"] as const;
const cols = HAIRS.flatMap((hair) => KINDS.map((headwear) => ({ hair, headwear })));
writeFileSync(join(out, "headwear.png"), svgToPng(svg(C * cols.length, C * 3, VIEWS.flatMap((v, row) => cols.map((s, col) => bust(s, v, col, row))).join("")), C * cols.length));

const ROLES = ["new", "lead", "worker"] as const;
const roleCols = (["helmet", "cap"] as const).flatMap((headwear) => ROLES.map((role) => ({ headwear, role, hair: "short" as Hair })));
writeFileSync(join(out, "roles.png"), svgToPng(svg(C * roleCols.length, C * 2, (["quarter", "side"] as View[]).flatMap((v, row) => roleCols.map((s, col) => bust(s, v, col, row))).join("")), C * roleCols.length));

// かぶっていない → かぶった（全身・斜め）
const W = 300;
const pairs = (["helmet", "chef", "hygiene"] as const).flatMap((kind, i) => (["none", kind] as const).map((headwear, j) => {
  const x = (i * 2 + j) * W;
  return `<g transform="translate(${x} 0)">${frame(0, 0, W, 360)}<path d="M3 320H${W - 3}" stroke="#000" stroke-width="3"/>` +
    characterSvg({ angles: POSES.stand, x: W * 0.45, groundY: 320, height: 270, facing: "right", view: "quarter", hair: "bob", headwear }) + "</g>";
}));
writeFileSync(join(out, "on_off.png"), svgToPng(svg(W * 6, 360, pairs.join("")), W * 6));
console.log(`かぶり物 ${join(out, "headwear.png")}\n役 ${join(out, "roles.png")}\nかぶる前と後 ${join(out, "on_off.png")}`);
