// 職場の服と役の印の部品（下絵）。Claude が下絵を描き、作者が Illustrator で直す（製品仕様 §14、docs/picto-style.md 3-1）。
// 体・髪・かぶり物の上に重ねる 4 つ目の層で、どの部品も 3 つの向き（正面・斜め・真横）で描ける。
// 胴の部品は胴の座標（原点＝腰、胴の上の端 −142・下の端 20）、頭の部品は頭の座標（原点＝首の付け根、顔は y −70〜0）で描く。
// 色は使わず、灰色の明るさと形で見分ける。部品ごとに g の id（part_…）を付け、Illustrator で直したあとに取り込めるようにする。
import type { HeadwearKind, View } from "./character";

/** 胴に重ねる服。並べた順に描く（下に着るものから） */
export type Garment =
  | "jacket" // 作業着の上着（襟とファスナー）
  | "polo" // ポロシャツ（襟と前立て）
  | "chefJacket" // コックコート（ボタン 2 列）
  | "coat" // 丈の長い白衣・上っ張り
  | "suit" // 上着（襟とシャツの V）
  | "waiterVest" // 給仕のベスト（V が深い）
  | "hivis" // 反射のベスト（帯 2 本）
  | "harness" // 安全帯の肩と胸のベルト
  | "apronLong" // 腰から下の長い前掛け
  | "apronShort" // 腰から下の短い前掛け
  | "apronBib"; // 胸当てのエプロン

export interface Outfit {
  /** 胴に重ねる服。tone は灰色の明るさ（初めの値は部品ごと） */
  wear?: { kind: Garment; tone?: string }[];
  /** 袖・ズボン・長靴の明るさ。無ければ体の初めの値 */
  sleeve?: string;
  pants?: string;
  boots?: string;
  neck?: "tie" | "scarf";
  tag?: "clip" | "lanyard";
  toolBelt?: boolean;
  /** 腕章（手前の腕の二の腕） */
  armband?: boolean;
  /** かぶり物の線の本数（安全帽・つばの帽子・衛生キャップ） */
  stripes?: 0 | 1 | 2;
  /** 若葉の印（安全帽の前） */
  leaf?: boolean;
  mask?: boolean;
}

const n = (v: number) => String(Math.round(v * 10) / 10);
const S = (w = 5) => `stroke="#000" stroke-width="${w}" stroke-linejoin="round"`;
const part = (name: string, body: string) => (body ? `<g id="part_${name}">${body}</g>` : "");
/** 灰色の明るさ（0〜255）。#rgb と #rrggbb を読む */
const lum = (tone: string) => {
  const h = tone.replace("#", "");
  return parseInt(h.length === 3 ? h[0] + h[0] : h.slice(0, 2), 16);
};
/** 下地の明るさに対して見える線の色 */
const ink = (under: string) => (lum(under) < 0x60 ? "#fff" : "#000");
/** 奥の足のズボン（光はカメラの側から当たるので、奥は暗くする） */
export const farTone = (tone: string) => {
  const v = Math.round(lum(tone) * 0.45).toString(16).padStart(2, "0");
  return `#${v}${v}${v}`;
};

/** 胴の幅（片側）と、襟の V のまん中（胸の向く側へ寄る） */
const W = (view: View) => (view === "side" ? 30 : 46);
const CX: Record<View, number> = { front: 0, quarter: 10, side: 12 };
/** 手前の腰（斜めは画面の左、真横は胴のまん中） */
const NEAR_HIP: Record<View, number> = { front: -26, quarter: -30, side: -4 };

const fullTop = (w: number, tone: string, bottom = 20) =>
  `<rect x="${-w}" y="-142" width="${w * 2}" height="${bottom + 142}" rx="${w === 30 ? 20 : 30}" fill="${tone}" ${S(6)}/>`;

const GARMENT: Record<Garment, { tone: string; draw: (view: View, tone: string) => string }> = {
  jacket: {
    tone: "#ccc",
    draw: (v, t) => {
      const w = W(v), c = CX[v], k = ink(t);
      return fullTop(w, t) +
        `<path d="M${c - 24} -142L${c - 6} -122L${c} -136L${c + 6} -122L${c + 24} -142" fill="${t}" ${S(4)}/>` +
        `<path d="M${c} -136V14" stroke="${k}" stroke-width="3"/><rect x="${c - 30}" y="-108" width="18" height="14" fill="none" stroke="${k}" stroke-width="3"/>`;
    },
  },
  polo: {
    tone: "#fff",
    draw: (v, t) => {
      const w = W(v), c = CX[v], k = ink(t);
      return fullTop(w, t) +
        `<path d="M${c - 22} -142L${c - 4} -126L${c - 2} -142ZM${c + 22} -142L${c + 4} -126L${c + 2} -142Z" fill="${t}" ${S(4)}/>` +
        `<path d="M${c} -130V-104" stroke="${k}" stroke-width="3"/><circle cx="${c}" cy="-118" r="2.5" fill="${k}"/><circle cx="${c}" cy="-108" r="2.5" fill="${k}"/>`;
    },
  },
  chefJacket: {
    tone: "#fff",
    draw: (v, t) => {
      const w = W(v), c = CX[v];
      const dots = [-122, -102, -82, -62].flatMap((y) => [c - 12, c + 12].map((x) => `<circle cx="${x}" cy="${y}" r="3.5" fill="${ink(t)}"/>`)).join("");
      return fullTop(w, t) + `<rect x="${c - 20}" y="-142" width="40" height="10" fill="${t}" ${S(4)}/>` + dots;
    },
  },
  coat: {
    tone: "#fff",
    draw: (v, t) => {
      const w = W(v), c = CX[v];
      return `<path d="M${-w} -112Q${-w} -142 ${-w + 30} -142H${w - 30}Q${w} -142 ${w} -112L${w + 6} 104H${-w - 6}Z" fill="${t}" ${S(6)}/>` +
        `<path d="M${c - 18} -142L${c} -112L${c + 18} -142M${c} -112V104" stroke="${ink(t)}" stroke-width="3" fill="none"/>`;
    },
  },
  suit: {
    tone: "#222",
    draw: (v, t) => {
      const w = W(v), c = CX[v];
      return fullTop(w, t, 30) + `<path d="M${c - 16} -142L${c} -96L${c + 16} -142Z" fill="#fff" ${S(4)}/>` +
        `<path d="M${c - 26} -142L${c - 4} -90M${c + 26} -142L${c + 4} -90" stroke="#777" stroke-width="3"/>` +
        `<circle cx="${c}" cy="-60" r="3.5" fill="#777"/><circle cx="${c}" cy="-36" r="3.5" fill="#777"/>`;
    },
  },
  waiterVest: {
    tone: "#222",
    draw: (v, t) => {
      const w = W(v), c = CX[v];
      return `<path d="M${-w} -110Q${-w} -142 ${c - 22} -142L${c} -84L${c + 22} -142Q${w} -142 ${w} -110V14H${-w}Z" fill="${t}" ${S(6)}/>` +
        [-74, -54, -34].map((y) => `<circle cx="${c}" cy="${y}" r="3" fill="${ink(t)}"/>`).join("");
    },
  },
  hivis: {
    tone: "#555",
    draw: (v, t) => {
      const w = W(v), c = CX[v];
      return `<path d="M${-w} -110Q${-w} -142 ${c - 20} -142L${c} -100L${c + 20} -142Q${w} -142 ${w} -110V4H${-w}Z" fill="${t}" ${S(6)}/>` +
        [-70, -30].map((y) => `<rect x="${-w + 3}" y="${y}" width="${w * 2 - 6}" height="9" fill="#fff"/>`).join("");
    },
  },
  harness: {
    tone: "#222",
    draw: (v, t) => {
      const c = CX[v], s = v === "side" ? 0.5 : 1;
      return `<path d="M${c - 26 * s} -140L${c - 12 * s} -40M${c + 26 * s} -140L${c + 12 * s} -40M${c - 22 * s} -94H${c + 22 * s}" stroke="${t}" stroke-width="7" fill="none"/>` +
        `<rect x="${c - 6}" y="-100" width="12" height="12" fill="#999" ${S(3)}/>`;
    },
  },
  apronLong: {
    tone: "#fff",
    draw: (v, t) => {
      const w = W(v) - 2;
      return `<path d="M${-w} -46H${w}L${w + 4} 118H${-w - 4}Z" fill="${t}" ${S(5)}/><path d="M${-w} -46H${w}" stroke="${ink(t)}" stroke-width="7"/>`;
    },
  },
  apronShort: {
    tone: "#999",
    draw: (v, t) => {
      const w = W(v) - 2;
      return `<path d="M${-w} -46H${w}L${w + 2} 56H${-w - 2}Z" fill="${t}" ${S(5)}/><path d="M${-w} -46H${w}" stroke="${ink(t)}" stroke-width="7"/>`;
    },
  },
  apronBib: {
    tone: "#555",
    draw: (v, t) => {
      const w = W(v) - 2, c = CX[v];
      return `<path d="M${c - 20} -112H${c + 20}V-62H${w}V56H${-w}V-62H${c - 20}Z" fill="${t}" ${S(5)}/>` +
        `<path d="M${c - 20} -112L${c - 12} -142M${c + 20} -112L${c + 12} -142" stroke="#000" stroke-width="4"/>`;
    },
  },
};

/** 首まわり・胸・腰の小物 */
const neckSvg = (view: View, kind: "tie" | "scarf") => {
  const c = CX[view];
  return kind === "tie"
    ? `<path d="M${c - 5} -132H${c + 5}L${c + 7} -74L${c} -64L${c - 7} -74Z" fill="#222" ${S(3)}/><rect x="${c - 6}" y="-140" width="12" height="9" fill="#222" ${S(3)}/>`
    : `<path d="M${c - 24} -142H${c + 24}L${c + 2} -112Z" fill="#222" ${S(4)}/><path d="M${c} -116L${c - 12} -90L${c + 8} -94Z" fill="#222" ${S(4)}/>`;
};
const tagSvg = (view: View, kind: "clip" | "lanyard") => {
  const c = CX[view];
  if (kind === "clip") {
    const x = view === "side" ? c - 4 : c + 14;
    return `<rect x="${x}" y="-114" width="22" height="14" fill="#fff" ${S(3)}/><path d="M${x + 5} -107H${x + 17}" stroke="#000" stroke-width="2.5"/>`;
  }
  return `<path d="M${c - 18} -140L${c} -96L${c + 18} -140" stroke="#444" stroke-width="4" fill="none"/>` +
    `<rect x="${c - 11}" y="-98" width="22" height="16" fill="#fff" ${S(3)}/><path d="M${c - 6} -90H${c + 6}" stroke="#000" stroke-width="2.5"/>`;
};
const toolBeltSvg = (view: View) => {
  const x = NEAR_HIP[view];
  return `<rect x="${x - 12}" y="-44" width="24" height="34" rx="3" fill="#333" ${S(4)}/><path d="M${x - 6} -44V-58M${x + 5} -44V-54" stroke="#000" stroke-width="5" stroke-linecap="round"/>`;
};

/** 胴の部品（胴の上に重ねる。手前の腕より先に描く） */
export function outfitTorso(view: View, o: Outfit): string {
  const wear = (o.wear ?? []).map((g) => part(g.kind, GARMENT[g.kind].draw(view, g.tone ?? GARMENT[g.kind].tone))).join("");
  return wear + part("neck", o.neck ? neckSvg(view, o.neck) : "") + part("tag", o.tag ? tagSvg(view, o.tag) : "") + part("toolbelt", o.toolBelt ? toolBeltSvg(view) : "");
}

/** 腕章（腕の座標。肩から 18〜34 下）。袖が暗いと白、明るいと濃い灰色 */
export const armbandSvg = (sleeve: string) =>
  part("armband", `<rect x="-17" y="18" width="34" height="17" fill="${lum(sleeve) < 0x80 ? "#eee" : "#333"}" ${S(3)}/>`);

/** 長靴の筒（すねの座標。足首から 48 上まで）。靴は同じ明るさで描く */
export const bootSvg = (shin: number, tone: string) =>
  part("boots", `<rect x="-21" y="${shin - 48}" width="42" height="50" rx="4" fill="${tone}" ${S(5)}/>`);

/** マスク（頭の座標。口を覆う） */
const MASK: Record<View, [number, number]> = { front: [0, 48], quarter: [8, 44], side: [22, 30] };
export const maskSvg = (view: View) => {
  const [x, w] = MASK[view];
  return part("mask", `<rect x="${x - w / 2}" y="-30" width="${w}" height="24" rx="9" fill="#fff" ${S(4)}/><path d="M${x - w / 2} -24L${x - w / 2 - 14} -34" stroke="#000" stroke-width="3"/>`);
};

/** かぶり物の線（横に回る帯）。[左の端, 右の端, 高さ] を本数ぶん */
const STRIPE: Partial<Record<HeadwearKind, Record<View, [number, number, number][]>>> = {
  helmet: {
    front: [[-52, 52, -88], [-55, 55, -76]],
    quarter: [[-54, 56, -88], [-57, 58, -76]],
    side: [[-58, 52, -88], [-60, 54, -76]],
  },
  cap: {
    front: [[-55, 55, -76], [-52, 52, -88]],
    quarter: [[-57, 54, -76], [-54, 50, -88]],
    side: [[-59, 52, -76], [-56, 48, -88]],
  },
  // 衛生キャップは丸みが低い（てっぺん −90）ので、線は −64 と −74 に、帽子の幅の内側で引く
  hygiene: {
    front: [[-44, 44, -64], [-38, 38, -74]],
    quarter: [[-46, 40, -64], [-40, 34, -74]],
    side: [[-46, 36, -64], [-40, 30, -74]],
  },
};
const LEAF_X: Record<View, number> = { front: 0, quarter: 18, side: 36 };

/** かぶり物の上の印（線と若葉）。fill はかぶり物の明るさ */
export function headMarks(kind: HeadwearKind, view: View, o: Outfit, fill: string): string {
  const k = ink(fill);
  const lines = (STRIPE[kind]?.[view] ?? []).slice(0, o.stripes ?? 0)
    .map(([a, b, y]) => `<path d="M${a} ${y}Q${n((a + b) / 2)} ${y - 6} ${b} ${y}" stroke="${k}" stroke-width="6" fill="none"/>`).join("");
  const x = LEAF_X[view];
  const leaf = o.leaf && kind === "helmet"
    ? `<path d="M${x} -104L${x - 10} -98V-86L${x} -80Z" fill="#fff" ${S(3)}/><path d="M${x} -104L${x + 10} -98V-86L${x} -80Z" fill="#444" ${S(3)}/>`
    : "";
  return part("stripes", lines) + part("leaf", leaf);
}
