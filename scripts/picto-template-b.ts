// 絵柄 b の素の姿（髪なし・立った姿）を、正面・斜め・真横の 3 枚の SVG に書き出す。作者が Illustrator で描き直すための下絵。
// 部位ごとに id の付いた g に分ける（Illustrator ではレイヤーの中のグループの名前になる）。
// guide の g には、回す軸（肩・ひじ・手首・腰・ひざ・足首・首）の印と、地面と頭の上の線を置く。描き直しても軸の位置は動かさない。
// 左向きは右向きを左右に反転して作るので、描くのは右向きだけ。
// 出力はリポジトリの private/picto/illustrator/修正待ち（git に入れない）。
//
//   npx tsx scripts/picto-template-b.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { svgToPng } from "../src/node/png";
import { privatePath } from "../src/node/private-dir";
import { FACE_SHAPE, L, NECK_B, NECK_LEN, SPOT, shoe, torso } from "../src/shared/picto/character";

type TemplateView = "front" | "quarter" | "side";
const out = privatePath("picto", "illustrator", "修正待ち");
mkdirSync(out, { recursive: true });

const W = 500;
const H = 520;
const HIP = { x: 250, y: 280 };
const HEAD_Y = -142 - L.headUp - NECK_LEN.b; // 首の付け根（頭の原点）
const ARM = L.upperArm + L.lowerArm;
const LEG = L.thigh + L.shin;

/** 正面の部位の置き場所。斜め・真横は描画と同じ値 */
const SPOT_FRONT = { arm: [-56, 56] as [number, number], leg: [-20, 20] as [number, number] };
const spot = (v: TemplateView) => (v === "front" ? SPOT_FRONT : SPOT[v]);

const eye = (cx: number, out: number) =>
  `<ellipse cx="${cx}" cy="-37" rx="4.3" ry="5.6"/><path d="M${cx + out * 2.8} -41l${out * 3.6} -1.6M${cx + out * 0.8} -42.4l${out * 1.4} -3.6" stroke="#000" stroke-width="2.2" stroke-linecap="round"/>`;
const FEATURES: Record<TemplateView, { eyes: string; nose: string; mouth: string }> = {
  front: { eyes: eye(-14, -1) + eye(14, 1), nose: `<circle cx="0" cy="-25" r="2.6"/>`, mouth: "M-6 -15Q0 -13 6 -15" },
  quarter: { eyes: eye(8, -1) + eye(30, 1), nose: `<circle cx="21" cy="-25" r="2.6"/>`, mouth: "M14 -15Q20 -13 26 -15" },
  side: { eyes: eye(27, 1), nose: `<circle cx="37" cy="-27" r="2.6"/>`, mouth: "M29 -15Q33 -13.5 37 -15" },
};
/** 正面から見た靴（つま先がこちらを向く）。斜め・真横は描画の靴 */
const SHOE_FRONT =
  `<path d="M-16 -8H16L22 12Q25 25 13 25H-13Q-25 25 -22 12Z" fill="#222" stroke="#000" stroke-width="5" stroke-linejoin="round"/>` +
  `<path d="M-20 25H20" stroke="#000" stroke-width="6" stroke-linecap="round"/>`;

const limb = (len: number, w: number, fill: string) =>
  `<path d="M0 0V${len}" stroke="#000" stroke-width="${w}" stroke-linecap="round"/><path d="M0 0V${len}" stroke="${fill}" stroke-width="${w - 12}" stroke-linecap="round"/>`;
const arm = (id: string, x: number) =>
  `<g id="${id}" transform="translate(${x} ${-142 + L.shoulderDrop})">${limb(ARM, 32, "#fff")}<circle cy="${ARM}" r="15" fill="#fff" stroke="#000" stroke-width="5"/></g>`;
const leg = (id: string, x: number, v: TemplateView) =>
  `<g id="${id}" transform="translate(${x} 0)">${limb(LEG, 40, "#555")}<g transform="translate(0 ${LEG})">${v === "front" ? SHOE_FRONT : shoe(0)}</g></g>`;

/** 回す軸の印（赤い十字）と線。描き直すときの目印で、仕上げでは消す */
const mark = (x: number, y: number) => `<path d="M${x - 7} ${y}H${x + 7}M${x} ${y - 7}V${y + 7}" stroke="#e00" stroke-width="2"/>`;
function guide(v: TemplateView) {
  const s = spot(v);
  const pts: [number, number][] = [];
  for (const x of s.leg) pts.push([x, 0], [x, L.thigh], [x, LEG]);
  for (const x of s.arm) pts.push([x, -142 + L.shoulderDrop], [x, -142 + L.shoulderDrop + L.upperArm], [x, -142 + L.shoulderDrop + ARM]);
  pts.push([0, HEAD_Y], [0, HEAD_Y - 45]);
  const ground = LEG + L.sole;
  return `<g id="guide" fill="none">` +
    `<path d="M-240 ${ground}H240M-240 ${HEAD_Y - 90}H240" stroke="#e00" stroke-width="1.5" stroke-dasharray="6 6"/>` +
    pts.map(([x, y]) => mark(x, y)).join("") + "</g>";
}

function template(v: TemplateView) {
  const s = spot(v);
  const f = FEATURES[v];
  const head =
    `<g id="head" transform="translate(0 ${HEAD_Y})">` +
    `<g id="neck">${NECK_B}</g><g id="face">${FACE_SHAPE}</g>` +
    `<g id="eyes">${f.eyes}</g><g id="nose">${f.nose}</g>` +
    `<g id="mouth"><path d="${f.mouth}" stroke="#000" stroke-width="3.5" fill="none" stroke-linecap="round"/></g></g>`;
  // 描く順（下から）: 奥の腕 → 奥の足 → 手前の足 → 胴 → 頭 → 手前の腕
  const body =
    arm("arm_far", s.arm[0]) + leg("leg_far", s.leg[0], v) + leg("leg_near", s.leg[1], v) +
    `<g id="torso">${torso(v === "front" ? "quarter" : v, "b")}</g>` + head + arm("arm_near", s.arm[1]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect id="background" width="${W}" height="${H}" fill="#fff"/>` +
    `<g id="figure" transform="translate(${HIP.x} ${HIP.y})">${body}${guide(v)}</g></svg>`;
}

const views: TemplateView[] = ["front", "quarter", "side"];
for (const v of views) {
  const svg = template(v);
  writeFileSync(join(out, `b_${v}.svg`), svg, "utf-8");
  writeFileSync(join(out, `b_${v}.png`), svgToPng(svg, W));
}
console.log(`下絵 ${views.map((v) => join(out, `b_${v}.svg`)).join(" ")}`);
