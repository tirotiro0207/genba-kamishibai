// 職場の服と役の印の部品（下絵）。Claude が下絵を描き、作者が Illustrator で直す（製品仕様 §14、docs/picto-style.md 3-1）。
// 体・髪・かぶり物の上に重ねる 4 つ目の層で、どの部品も 3 つの向き（正面・斜め・真横）で描ける。
// 胴の部品は胴の座標（原点＝腰、胴の上の端 −142・下の端 20）、頭の部品は頭の座標（原点＝首の付け根、顔は y −70〜0）で描く。
// 色は使わず、灰色の明るさと形で見分ける。部品ごとに g の id（part_…）を付け、Illustrator で直したあとに取り込めるようにする。
import { EAR_BOTTOM, EAR_MARK, EAR_TOP } from "./avatar";
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
  | "apronBib" // 胸当てのエプロン
  | "uniform" // 制服の上着（ボタン 1 列と胸のポケット。警備・鉄道・運転）
  | "coverall" // つなぎ（上着とズボンを同じ明るさに。腰に帯）
  | "tunic" // 襟の無い上衣（看護・リネン）
  | "lifeJacket" // 救命胴衣
  | "checked"; // チェックのシャツ

export interface Outfit {
  /** 胴に重ねる服。tone は灰色の明るさ（初めの値は部品ごと） */
  wear?: { kind: Garment; tone?: string }[];
  /** 袖・ズボン・長靴の明るさ。無ければ体の初めの値 */
  sleeve?: string;
  pants?: string;
  boots?: string;
  neck?: "tie" | "scarf" | "towel";
  tag?: "clip" | "lanyard";
  toolBelt?: boolean;
  /** 腕章（手前の腕の二の腕） */
  armband?: boolean;
  /** かぶり物の線の本数（安全帽・つばの帽子・衛生キャップ） */
  stripes?: 0 | 1 | 2 | 3;
  /** 若葉の印（安全帽の前） */
  leaf?: boolean;
  mask?: boolean;
  /** 耳当て・ヘッドセット（マイクつき） */
  ears?: "muffs" | "headset";
  /** 顔の前の覆い（透明の面・林業の網の面） */
  visor?: "clear" | "mesh";
  /** 肩章の線の本数（警備） */
  rank?: 1 | 2 | 3;
  /** 袖口の線の本数（鉄道） */
  cuffs?: 1 | 2 | 3;
  /** 手袋の明るさ */
  gloves?: string;
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
// 白や明るい灰色の服は、0.45 だと奥の足が黒く沈んで明暗が強すぎるので、ほんのり灰色にとどめる
export const farTone = (tone: string) => {
  const l = lum(tone);
  const v = Math.round(l * (l >= 0xc0 ? 0.85 : 0.45)).toString(16).padStart(2, "0");
  return `#${v}${v}${v}`;
};

/** 胴の幅（片側）と、襟の V のまん中（胸の向く側へ寄る） */
const W = (view: View) => (view === "side" ? 30 : 46);
// 真横の 6 は首の位置（character.ts の NECK_X.side）と下地のベストの V のまん中に合わせる。12 だと襟の開きが首の前へずれて浮く
const CX: Record<View, number> = { front: 0, quarter: 10, side: 6 };
/** 襟まわりの横の広がり。真横は胸の前の端が近いので半分に縮め（首の幅 22 と同じ広がり）、胴の幅（片側 30）からはみ出さないようにする */
const SPAN: Record<View, number> = { front: 1, quarter: 1, side: 0.5 };
/** 手前の腰（斜めは画面の左、真横は胴のまん中） */
const NEAR_HIP: Record<View, number> = { front: -26, quarter: -30, side: -4 };

/**
 * 胴に重ねる服の裾（右の脇の V から、裾、左の脇まで）。胴は角の丸い四角（半径 30、真横は 20。下の端は y 20）なので、
 * 裾の角も胴の丸みに合わせて丸める。四角いままだと、胴の丸い角の外へ服の角がはみ出して箱に見える
 */
export const hem = (w: number, b: number, view: View) => {
  const r = Math.max(0, (view === "side" ? 20 : 30) - (20 - b));
  return r ? `V${n(b - r)}A${r} ${r} 0 0 1 ${n(w - r)} ${b}H${n(-w + r)}A${r} ${r} 0 0 1 ${-w} ${n(b - r)}Z` : `V${b}H${-w}Z`;
};
/**
 * 真横は襟の V・前立て・紐を首の下に描かない。胴の上の端のまん中は首の真下なので、そこから下へ伸びる線は
 * 首の枠の続きに見えた（胴の直しと同じ考え。character.ts の torso）。ベスト類は上の縁を胴の角の丸み（rx 20）に重ねて両肩をひと続きにする
 */
const sideTop = (w: number) => `M${-w} -110V-122A20 20 0 0 1 -10 -142H10A20 20 0 0 1 ${w} -122V-110`;
/** 真横の縦の線（ファスナー・前立て）の上の端。手前の腕の付け根（−136 から下を覆う）より下から始め、首の下に線を出さない */
const lineTop = (v: View, y: number) => (v === "side" ? Math.max(y, -120) : y);
const fullTop = (w: number, tone: string, bottom = 20) =>
  `<rect x="${-w}" y="-142" width="${w * 2}" height="${bottom + 142}" rx="${w === 30 ? 20 : 30}" fill="${tone}" ${S(6)}/>`;

const GARMENT: Record<Garment, { tone: string; draw: (view: View, tone: string) => string }> = {
  uniform: {
    tone: "#333",
    draw: (v, t) => {
      const w = W(v), c = CX[v], k = ink(t);
      const x = (d: number) => n(c + d * SPAN[v]);
      return fullTop(w, t, 26) + (v === "side" ? "" : `<path d="M${x(-16)} -142L${x(0)} -118L${x(16)} -142Z" fill="#fff" ${S(4)}/>` +
        `<path d="M${x(-5)} -136H${x(5)}L${x(6)} -112L${x(0)} -106L${x(-6)} -112Z" fill="#222" ${S(3)}/>`) +
        [-96, -72, -48, -24].map((y) => `<circle cx="${x(0)}" cy="${y}" r="3.5" fill="${k === "#fff" ? "#ccc" : "#555"}"/>`).join("") +
        `<rect x="${x(-34)}" y="-106" width="20" height="14" fill="none" stroke="${k}" stroke-width="3"/>`;
    },
  },
  coverall: {
    tone: "#777",
    draw: (v, t) => {
      const w = W(v), c = CX[v], k = ink(t);
      const x = (d: number) => n(c + d * SPAN[v]);
      return fullTop(w, t) + (v === "side" ? "" : `<path d="M${x(-20)} -142L${x(-4)} -124L${x(0)} -136L${x(4)} -124L${x(20)} -142" fill="${t}" ${S(4)}/>`) +
        `<path d="M${x(0)} ${lineTop(v, -136)}V20" stroke="${k}" stroke-width="3"/><path d="M${-w + 3} -40H${w - 3}" stroke="${k}" stroke-width="5"/>`;
    },
  },
  tunic: {
    tone: "#fff",
    draw: (v, t) => {
      const w = W(v), c = CX[v], k = ink(t);
      const x = (d: number) => n(c + d * SPAN[v]);
      return fullTop(w, t, 30) + (v === "side" ? "" : `<path d="M${x(-18)} -142Q${x(0)} -122 ${x(18)} -142" fill="none" stroke="${k}" stroke-width="3"/>`) + `<path d="M${x(-4)} ${lineTop(v, -130)}V-80" stroke="${k}" stroke-width="3"/>`;
    },
  },
  lifeJacket: {
    tone: "#777",
    draw: (v, t) => {
      const w = W(v), c = CX[v];
      const x = (d: number) => n(c + d * SPAN[v]);
      // 真横は前と後ろの身頃を 1 枚にし、上の縁を胴の角の丸みに重ねる（V の合わせ目が首の続きに見えた）
      return (v === "side" ? `<path d="${sideTop(w)}V-20H${-w}Z" fill="${t}" ${S(5)}/>` :
        `<path d="M${-w} -108Q${-w} -142 ${x(-18)} -142L${x(-6)} -100V-20H${-w}Z" fill="${t}" ${S(5)}/>` +
        `<path d="M${w} -108Q${w} -142 ${x(18)} -142L${x(6)} -100V-20H${w}Z" fill="${t}" ${S(5)}/>`) +
        `<path d="M${-w + 2} -60H${w - 2}" stroke="#000" stroke-width="6"/>`;
    },
  },
  checked: {
    tone: "#bbb",
    draw: (v, t) => {
      const w = W(v), c = CX[v];
      const x = (d: number) => n(c + d * SPAN[v]);
      const grid = [-110, -80, -50, -20].map((y) => `<path d="M${-w + 4} ${y}H${w - 4}" stroke="#666" stroke-width="3"/>`).join("") +
        [-24, 0, 24].filter((x) => Math.abs(x) < w - 6).map((x) => `<path d="M${x} ${lineTop(v, -132)}V16" stroke="#666" stroke-width="3"/>`).join("");
      return fullTop(w, t) + grid + (v === "side" ? "" : `<path d="M${x(-20)} -142L${x(-4)} -126L${x(-2)} -142ZM${x(20)} -142L${x(4)} -126L${x(2)} -142Z" fill="${t}" ${S(4)}/>`);
    },
  },
  jacket: {
    tone: "#ccc",
    draw: (v, t) => {
      const w = W(v), c = CX[v], k = ink(t);
      const x = (d: number) => n(c + d * SPAN[v]);
      return fullTop(w, t) +
        (v === "side" ? "" : `<path d="M${x(-24)} -142L${x(-6)} -122L${x(0)} -136L${x(6)} -122L${x(24)} -142" fill="${t}" ${S(4)}/>`) +
        `<path d="M${x(0)} ${lineTop(v, -136)}V14" stroke="${k}" stroke-width="3"/><rect x="${x(-30)}" y="-108" width="18" height="14" fill="none" stroke="${k}" stroke-width="3"/>`;
    },
  },
  polo: {
    tone: "#fff",
    draw: (v, t) => {
      const w = W(v), c = CX[v], k = ink(t);
      const x = (d: number) => n(c + d * SPAN[v]);
      return fullTop(w, t) +
        (v === "side" ? "" : `<path d="M${x(-22)} -142L${x(-4)} -126L${x(-2)} -142ZM${x(22)} -142L${x(4)} -126L${x(2)} -142Z" fill="${t}" ${S(4)}/>`) +
        `<path d="M${x(0)} ${lineTop(v, -130)}V-104" stroke="${k}" stroke-width="3"/><circle cx="${x(0)}" cy="-118" r="2.5" fill="${k}"/><circle cx="${x(0)}" cy="-108" r="2.5" fill="${k}"/>`;
    },
  },
  chefJacket: {
    tone: "#fff",
    draw: (v, t) => {
      const w = W(v), c = CX[v];
      const x = (d: number) => n(c + d * SPAN[v]);
      const dots = [-122, -102, -82, -62].flatMap((y) => [x(-12), x(12)].map((cx) => `<circle cx="${cx}" cy="${y}" r="3.5" fill="${ink(t)}"/>`)).join("");
      // 立ち襟の帯は、真横では首と同じ幅になって首の続きに見えたので描かない
      return fullTop(w, t) + (v === "side" ? "" : `<rect x="${x(-20)}" y="-142" width="${40 * SPAN[v]}" height="10" fill="${t}" ${S(4)}/>`) + dots;
    },
  },
  coat: {
    tone: "#fff",
    draw: (v, t) => {
      const w = W(v), c = CX[v];
      const x = (d: number) => n(c + d * SPAN[v]);
      return `<path d="M${-w} -112Q${-w} -142 ${-w + 30} -142H${w - 30}Q${w} -142 ${w} -112L${w + 6} 104H${-w - 6}Z" fill="${t}" ${S(6)}/>` +
        `<path d="${v === "side" ? "" : `M${x(-18)} -142L${x(0)} -112L${x(18)} -142`}M${x(0)} -112V104" stroke="${ink(t)}" stroke-width="3" fill="none"/>`;
    },
  },
  suit: {
    tone: "#222",
    draw: (v, t) => {
      const w = W(v), c = CX[v];
      const x = (d: number) => n(c + d * SPAN[v]);
      return fullTop(w, t, 30) + (v === "side" ? "" : `<path d="M${x(-16)} -142L${x(0)} -96L${x(16)} -142Z" fill="#fff" ${S(4)}/>` +
        `<path d="M${x(-26)} -142L${x(-4)} -90M${x(26)} -142L${x(4)} -90" stroke="#777" stroke-width="3"/>`) +
        `<circle cx="${x(0)}" cy="-60" r="3.5" fill="#777"/><circle cx="${x(0)}" cy="-36" r="3.5" fill="#777"/>`;
    },
  },
  waiterVest: {
    tone: "#222",
    draw: (v, t) => {
      const w = W(v), c = CX[v];
      const x = (d: number) => n(c + d * SPAN[v]);
      return `<path d="${v === "side" ? sideTop(w) : `M${-w} -110Q${-w} -142 ${x(-22)} -142L${x(0)} -84L${x(22)} -142Q${w} -142 ${w} -110`}${hem(w, 14, v)}" fill="${t}" ${S(6)}/>` +
        [-74, -54, -34].map((y) => `<circle cx="${x(0)}" cy="${y}" r="3" fill="${ink(t)}"/>`).join("");
    },
  },
  hivis: {
    tone: "#555",
    draw: (v, t) => {
      const w = W(v), c = CX[v];
      const x = (d: number) => n(c + d * SPAN[v]);
      return `<path d="${v === "side" ? sideTop(w) : `M${-w} -110Q${-w} -142 ${x(-20)} -142L${x(0)} -100L${x(20)} -142Q${w} -142 ${w} -110`}${hem(w, 4, v)}" fill="${t}" ${S(6)}/>` +
        [-70, -30].map((y) => `<rect x="${-w + 3}" y="${y}" width="${w * 2 - 6}" height="9" fill="#fff"/>`).join("");
    },
  },
  harness: {
    tone: "#222",
    draw: (v, t) => {
      const c = CX[v], s = v === "side" ? 0.5 : 1;
      // 真横は肩の帯を胴の前と後ろの端の近く（首の幅の外）に立てる。首の下で寄せると、首の枠が胴へ続いて見えた
      if (v === "side")
        return `<path d="M22 -138V-40M-22 -138V-40M-22 -94H22" stroke="${t}" stroke-width="7" fill="none"/><rect x="${c - 6}" y="-100" width="12" height="12" fill="#999" ${S(3)}/>`;
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
      const x = (d: number) => n(c + d * SPAN[v]);
      // 真横は胸当てを胴の前の側に寄せ、肩紐は前の端の近くに 1 本だけ立てる（首の下で寄る 2 本の紐が首の続きに見えた）
      if (v === "side")
        return `<path d="M${c} -112H${w}V56H${-w}V-62H${c}Z" fill="${t}" ${S(5)}/><path d="M${w - 6} -112V-138" stroke="#000" stroke-width="4"/>`;
      return `<path d="M${x(-20)} -112H${x(20)}V-62H${w}V56H${-w}V-62H${x(-20)}Z" fill="${t}" ${S(5)}/>` +
        `<path d="M${x(-20)} -112L${x(-12)} -142M${x(20)} -112L${x(12)} -142" stroke="#000" stroke-width="4"/>`;
    },
  },
};

/** 首まわり・胸・腰の小物 */
const neckSvg = (view: View, kind: "tie" | "scarf" | "towel") => {
  const c = CX[view], w = W(view);
  const x = (d: number) => n(c + d * SPAN[view]);
  // 真横は首の真下に縦の線を出さない: 手ぬぐいの垂れは前の端に 1 本、ネクタイは胸の前の端、スカーフは首を巻く帯と前の結び目。
  // 結び目は手前の腕（肩の付け根から下、x 20 まで）より前に置く（腕にかぶさって見えないように）
  if (view === "side") {
    if (kind === "towel")
      return `<path d="M${-w + 6} -142Q${c} -124 ${w - 6} -142V-130Q${c} -112 ${-w + 6} -130Z" fill="#fff" ${S(4)}/><path d="M${w - 12} -130V-86H${w - 2}V-134Z" fill="#fff" ${S(4)}/>`;
    if (kind === "tie") return `<path d="M${w - 12} -134H${w - 6}L${w - 5} -74L${w - 9} -64L${w - 13} -74Z" fill="#222" ${S(3)}/>`;
    return `<path d="M-8 -145H20Q23 -139 20 -133H-8Q-11 -139 -8 -145Z" fill="#222" ${S(4)}/><path d="M21 -140L24 -118L31 -135Z" fill="#222" ${S(4)}/>`;
  }
  if (kind === "towel")
    return `<path d="M${-w + 6} -142Q${x(0)} -124 ${w - 6} -142V-130Q${x(0)} -112 ${-w + 6} -130Z" fill="#fff" ${S(4)}/>` +
      `<path d="M${x(-22)} -132V-86H${x(-10)}V-128ZM${x(10)} -128V-86H${x(22)}V-132Z" fill="#fff" ${S(4)}/>`;
  return kind === "tie"
    ? `<path d="M${x(-5)} -132H${x(5)}L${x(7)} -74L${x(0)} -64L${x(-7)} -74Z" fill="#222" ${S(3)}/><rect x="${x(-6)}" y="-140" width="12" height="9" fill="#222" ${S(3)}/>`
    : `<path d="M${x(-24)} -142H${x(24)}L${x(2)} -112Z" fill="#222" ${S(4)}/><path d="M${x(0)} -116L${x(-12)} -90L${x(8)} -94Z" fill="#222" ${S(4)}/>`;
};
const tagSvg = (view: View, kind: "clip" | "lanyard") => {
  const c = CX[view];
  const x = (d: number) => n(c + d * SPAN[view]);
  if (kind === "clip") {
    const x = view === "side" ? c - 4 : c + 14;
    return `<rect x="${x}" y="-114" width="22" height="14" fill="#fff" ${S(3)}/><path d="M${x + 5} -107H${x + 17}" stroke="#000" stroke-width="2.5"/>`;
  }
  // 真横の紐は首の後ろから胸の名札へ斜めに 1 本（V に寄る 2 本は首の枠の続きに見えた）。
  // 始まりは首の幅（x −5〜17）より後ろの肩の上に置く（首の幅の内から始めると、首の線の続きに見えた）
  const cord = view === "side" ? `M-18 -137L${x(0)} -96` : `M${x(-18)} -140L${x(0)} -96L${x(18)} -140`;
  return `<path d="${cord}" stroke="#444" stroke-width="4" fill="none"/>` +
    `<rect x="${x(-11)}" y="-98" width="22" height="16" fill="#fff" ${S(3)}/><path d="M${x(-6)} -90H${x(6)}" stroke="#000" stroke-width="2.5"/>`;
};
const toolBeltSvg = (view: View) => {
  const x = NEAR_HIP[view];
  return `<rect x="${x - 12}" y="-44" width="24" height="34" rx="3" fill="#333" ${S(4)}/><path d="M${x - 6} -44V-58M${x + 5} -44V-54" stroke="#000" stroke-width="5" stroke-linecap="round"/>`;
};

/** 肩章（肩の上の板と線） */
const rankSvg = (view: View, bars: number) => {
  const w = W(view);
  const xs = view === "side" ? [-14] : [-w + 4, w - 28];
  return xs.map((x) => `<rect x="${x}" y="-146" width="24" height="10" fill="#555" ${S(3)}/>` +
    Array.from({ length: bars }, (_, i) => `<path d="M${x + 5 + i * 7} -144V-138" stroke="#fff" stroke-width="3"/>`).join("")).join("");
};

/** 胴の部品（胴の上に重ねる。手前の腕より先に描く） */
export function outfitTorso(view: View, o: Outfit): string {
  const wear = (o.wear ?? []).map((g) => part(g.kind, GARMENT[g.kind].draw(view, g.tone ?? GARMENT[g.kind].tone))).join("");
  return wear + part("neck", o.neck ? neckSvg(view, o.neck) : "") + part("tag", o.tag ? tagSvg(view, o.tag) : "") +
    part("toolbelt", o.toolBelt ? toolBeltSvg(view) : "") + part("rank", o.rank ? rankSvg(view, o.rank) : "");
}

/** 袖口の線（前腕の座標。手首の少し上） */
export const cuffSvg = (count: number, lower: number, sleeve: string) =>
  part("cuffs", Array.from({ length: count }, (_, i) => `<path d="M-10 ${lower - 16 - i * 7}H10" stroke="${ink(sleeve)}" stroke-width="4"/>`).join(""));

/** 耳当て・ヘッドセット（頭の座標）。斜めと真横は見える耳 1 つ */
const EAR: Record<View, number[]> = { front: [-50, 50], quarter: [-44], side: [-10] };
export const earSvg = (view: View, kind: "muffs" | "headset", k = 1) => {
  const xs = EAR[view].map((x) => Number(n(x * k)));
  const cups = xs.map((x) => `<rect x="${n(x - 11)}" y="-54" width="22" height="30" rx="9" fill="#333" ${S(4)}/>`).join("");
  const e = xs[0];
  const mic = kind === "headset" ? `<path d="M${e} -26Q${e + 6} -8 ${e + 34} -12" stroke="#000" stroke-width="4" fill="none"/><circle cx="${e + 36}" cy="-12" r="5" fill="#333" stroke="#000" stroke-width="3"/>` : "";
  return part("ears", cups + mic);
};

/** 顔の前の覆い（頭の座標）。透明の面は縁と光の線だけ、網の面は格子 */
const VISOR: Record<View, [number, number]> = { front: [-44, 44], quarter: [-32, 52], side: [4, 60] };
export const visorSvg = (view: View, kind: "clear" | "mesh", k = 1) => {
  const [a, b] = VISOR[view].map((v) => Number(n(v * k)));
  const frame = `<path d="M${a} -64H${b}V-4Q${(a + b) / 2} 4 ${a} -4Z" fill="none" ${S(4)}/>`;
  const inner = kind === "mesh"
    ? [-50, -36, -22].map((y) => `<path d="M${a + 2} ${y}H${b - 2}" stroke="#444" stroke-width="2"/>`).join("") +
      [0.25, 0.5, 0.75].map((f) => `<path d="M${n(a + (b - a) * f)} -62V-4" stroke="#444" stroke-width="2"/>`).join("")
    : `<path d="M${b - 14} -58L${b - 26} -40" stroke="#999" stroke-width="3"/>`;
  return part("visor", frame + inner);
};

/** 腕章（腕の座標。肩から 18〜34 下）。袖が暗いと白、明るいと濃い灰色 */
export const armbandSvg = (sleeve: string) =>
  part("armband", `<rect x="-17" y="18" width="34" height="17" fill="${lum(sleeve) < 0x80 ? "#eee" : "#333"}" ${S(3)}/>`);

/** 長靴の筒（すねの座標。足首から 48 上まで）。靴は同じ明るさで描く */
export const bootSvg = (shin: number, tone: string) =>
  part("boots", `<rect x="-21" y="${shin - 48}" width="42" height="50" rx="4" fill="${tone}" ${S(5)}/>`);

/**
 * マスク（頭の座標。口を覆う）。[左の端, 右の端, 上, 下]。目の下・鼻の上から口までを覆う。
 * 斜めは顔のまん中（目と目の間、x 19）へ寄せて少し小さく、真横は顔の前の端に寄せる。
 * 紐は上と下の 2 本で、耳へ向かう。正面は両側、斜めは見える耳と奥の顔の縁、真横は見える耳へ
 */
// 横の位置は standard の顔（半幅 45）の値。顔の幅が違うときは k（半幅 / 45）を掛ける
const MASK: Record<View, [number, number, number, number]> = {
  front: [-24, 24, -30, -6],
  quarter: [1, 37, -29, -8],
  // 真横は前の端を顔の輪郭（x 45）より外へ出し、鼻と口ごと横顔の線を覆う（布が顔の前を回って裏へ行く）
  side: [17, 45, -31, -5],
};
export const maskSvg = (view: View, k = 1) => {
  const [l, r, t, b] = MASK[view].map((v, i) => (i < 2 ? Number(n(v * k)) : v));
  const strap = (ear0: number) => {
    const ear = Number(n(ear0 * k));
    const edge = ear < l ? l : r;
    // 紐は耳の上と下の端の少し内側へ（耳を後から描くので、紐の先は耳の裏に入って掛かって見える）
    return `<path d="M${edge} ${t + 5}L${ear} ${EAR_TOP + 4}M${edge} ${b - 4}L${ear} ${EAR_BOTTOM - 4}" stroke="#000" stroke-width="3"/>`;
  };
  const body = view === "side"
    // 前の端は横顔の線（あごへ回り込む曲線）から 4.5 外を沿わせる
    ? `<path d="M${n(l + 9)} ${t}H${n(r + 1.5)}Q${n(r + 4.5)} ${t} ${n(r + 4.5)} -28Q${n(r + 4.5)} -9 ${n(r - 6)} ${b}H${n(l + 9)}Q${l} ${b} ${l} ${b - 9}V${t + 9}Q${l} ${t} ${n(l + 9)} ${t}Z" fill="#fff" ${S(4)}/>`
    : `<rect x="${l}" y="${t}" width="${r - l}" height="${b - t}" rx="9" fill="#fff" ${S(4)}/>`;
  return part("mask", EAR_MARK[view].map(strap).join("") + body);
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
  peaked: {
    front: [[-60, 60, -80], [-62, 62, -90], [-63, 63, -98]],
    quarter: [[-62, 58, -80], [-64, 60, -90], [-65, 61, -98]],
    side: [[-66, 54, -80], [-68, 56, -90], [-69, 57, -98]],
  },
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
