// キャラクターを作る画面の顔と髪の部品を、選べるものごとに 3 つの向きで並べる（API は使わない。製品仕様 §14）。
// 出力: private/picto/lab/avatar/ の A_顔.png・B_目.png・C_眉まつげ口ほか.png・D_髪.png・E_髪とかぶり物.png・G_組み合わせ.png
//
//   npx tsx scripts/picto-avatar-sheet.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_FACE, FACE_OPTIONS, type FaceParts } from "../src/shared/picto/avatar";
import { type CharacterSpec, characterSvg, type Hair, type HeadwearKind, type View } from "../src/shared/picto/character";
import { A_POSE } from "../src/shared/picto/poses";

const out = privateDir();
function privateDir() {
  const d = join(process.cwd(), "private", "picto", "lab", "avatar");
  mkdirSync(d, { recursive: true });
  return d;
}
const png = (s: string, w: number) =>
  new Resvg(s, { fitTo: { mode: "width", value: w }, background: "#ffffff", font: { loadSystemFonts: true, defaultFontFamily: "Yu Gothic" } }).render().asPng();
const VIEWS: View[] = ["front", "quarter", "side"];
const HAIRS: Hair[] = ["bob", "short", "bun", "long", "ponytail", "buzz", "sidePart", "curly"];
const C = 170; // 1 枠（胸から上）
const LBL = 150;
const text = (x: number, y: number, s: string, size = 18) =>
  `<text x="${x}" y="${y}" font-family="Yu Gothic, Meiryo, sans-serif" font-size="${size}" font-weight="bold" fill="#000">${s}</text>`;
const bust = (spec: Partial<CharacterSpec>, view: View, x: number, y: number) =>
  `<svg x="${x}" y="${y}" width="${C}" height="${C}" viewBox="0 0 ${C} ${C}">` +
  characterSvg({ angles: A_POSE[view], x: C * 0.5, groundY: C * 2.25, height: C * 1.95, facing: "right", view, hair: "short", ...spec }) +
  `</svg><rect x="${x + 2}" y="${y + 2}" width="${C - 4}" height="${C - 4}" fill="none" stroke="#ccc" stroke-width="2"/>`;

/** 行ごとに名前と 3 つの向き（cols 組なら横に並べる） */
function sheet(name: string, rows: { label: string; specs: Partial<CharacterSpec>[] }[]) {
  const perRow = Math.max(...rows.map((r) => r.specs.length)) * VIEWS.length;
  const w = LBL + perRow * C, h = rows.length * C;
  const body = rows.map((r, i) =>
    text(8, i * C + C / 2, r.label) + r.specs.flatMap((sp, j) => VIEWS.map((v, k) => bust(sp, v, LBL + (j * VIEWS.length + k) * C, i * C))).join("")).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fff"/>${body}</svg>`;
  writeFileSync(join(out, `${name}.png`), png(svg, w));
}
const f = (p: Partial<FaceParts>) => ({ face: { ...DEFAULT_FACE, ...p } });

// A 顔の輪郭（右にマスク・耳当て・覆いを付けた列）
sheet("A_顔", FACE_OPTIONS.face.map((face) => ({ label: face, specs: [f({ face }), { ...f({ face }), outfit: { mask: true, ears: "muffs" } }, { ...f({ face }), headwear: "helmet", outfit: { visor: "clear" } }] })));
// B 目（形 × 大きさ）
sheet("B_目", FACE_OPTIONS.eyeShape.map((eyeShape) => ({ label: eyeShape, specs: FACE_OPTIONS.eyeSize.map((eyeSize) => f({ eyeShape, eyeSize })) })));
// C 眉・まつげ・口・眼鏡・ひげ・肌（前髪が深い bob で眉を見る）
sheet("C_眉まつげ口ほか", [
  ...FACE_OPTIONS.brows.map((brows) => ({ label: `眉 ${brows}`, specs: [{ ...f({ brows }), hair: "bob" as Hair }, { ...f({ brows, face: "slim" }), hair: "sidePart" as Hair }] })),
  ...FACE_OPTIONS.lashes.map((lashes) => ({ label: `まつげ ${lashes}`, specs: [{ ...f({ lashes }), hair: "long" as Hair }, { ...f({ lashes, eyeSize: "l" }), hair: "ponytail" as Hair }] })),
  ...FACE_OPTIONS.mouth.map((mouth) => ({ label: `口 ${mouth}`, specs: [f({ mouth }), f({ mouth, face: "square", beard: "mustache" })] })),
  ...FACE_OPTIONS.glasses.map((glasses) => ({ label: `眼鏡 ${glasses}`, specs: [f({ glasses }), { ...f({ glasses, face: "round" }), hair: "bob" as Hair }] })),
  ...FACE_OPTIONS.skin.map((skin) => ({ label: `肌 ${skin}`, specs: [f({ skin }), { ...f({ skin }), hair: "buzz" as Hair }] })),
]);
// D 髪（右に細い顔の列）
sheet("D_髪", HAIRS.map((hair) => ({ label: hair, specs: [{ hair }, { hair, ...f({ face: "slim" }) }] })));
// E 髪 × かぶり物
const KINDS: HeadwearKind[] = ["helmet", "cap", "chef", "peaked", "nurse", "hygiene"];
sheet("E_髪とかぶり物", HAIRS.map((hair) => ({ label: hair, specs: KINDS.map((headwear) => ({ hair, headwear })) })));

// G 組み合わせ（種を決めた乱数の 24 人、全身・A ポーズ）
let seed = 2026;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const people = Array.from({ length: 24 }, () => ({
  hair: pick(HAIRS),
  face: { face: pick(FACE_OPTIONS.face), eyeShape: pick(FACE_OPTIONS.eyeShape), eyeSize: pick(FACE_OPTIONS.eyeSize), lashes: pick(FACE_OPTIONS.lashes), brows: pick(FACE_OPTIONS.brows), mouth: pick(FACE_OPTIONS.mouth), glasses: pick(FACE_OPTIONS.glasses), skin: pick(FACE_OPTIONS.skin), beard: pick(FACE_OPTIONS.beard) } as FaceParts,
}));
const FW = 150, FH = 300, PER = 4;
const gw = PER * VIEWS.length * FW, gh = Math.ceil(people.length / PER) * FH;
const g = people.map((p, i) => VIEWS.map((v, k) => {
  const x = ((i % PER) * VIEWS.length + k) * FW + FW / 2, y = Math.floor(i / PER) * FH + FH - 20;
  return characterSvg({ angles: A_POSE[v], x, groundY: y, height: 250, facing: "right", view: v, ...p });
}).join("")).join("");
writeFileSync(join(out, "G_組み合わせ.png"), png(`<svg xmlns="http://www.w3.org/2000/svg" width="${gw}" height="${gh}" viewBox="0 0 ${gw} ${gh}"><rect width="${gw}" height="${gh}" fill="#fff"/>${g}</svg>`, gw));
console.log(`並べた絵 ${out}`);
