// 小物の部品（017・018a・018b）。どれも角の丸い箱と丸と太い線で描くピクトグラムの部品。
// 置き場所は数字で決める: 人形の関節に付ける（関節と、背の高さに対するずれ）か、キャンバスの上の位置。
import type { Joint, Posed, Pt } from "./skeleton";

export const PROP_KINDS = [
  // 018a
  "suspended_load", "arrow_down", "broom", "box", "lock", "tag",
] as const;
export type PropKind = (typeof PROP_KINDS)[number];

export type PropAnchor =
  | { figure: number; joint: Joint; dx?: number; dy?: number }
  | { x: number; y: number };

export interface PropSpec {
  kind: PropKind;
  at: PropAnchor;
  /** 大きさ（キャンバスの幅に対する割合。0.04〜0.5） */
  size: number;
}

/** 人形の関節に付けるとき、どの関節が自然か（角度の係やキーフレームへの手がかり） */
export const DEFAULT_JOINT: Record<PropKind, Joint | null> = {
  suspended_load: null,
  arrow_down: null,
  broom: "hand_near",
  box: "hand_near",
  lock: "hand_near",
  tag: "hand_near",
};

const INK = "#000";
const GRAY = "#8a8a8a";
const LIGHT = "#d0d0d0";

const n = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};

export function validateProps(props: PropSpec[], figures: number): string[] {
  const errs: string[] = [];
  props.forEach((p, i) => {
    if (!(PROP_KINDS as readonly string[]).includes(p.kind)) errs.push(`props[${i}].kind: ${p.kind}`);
    if (!(p.size >= 0.04 && p.size <= 0.5)) errs.push(`props[${i}].size が範囲の外: ${p.size}`);
    if ("figure" in p.at) {
      if (p.at.figure < 0 || p.at.figure >= figures) errs.push(`props[${i}].at.figure が人物の番号の外`);
      if (Math.abs(p.at.dx ?? 0) > 1 || Math.abs(p.at.dy ?? 0) > 1) errs.push(`props[${i}].at のずれが範囲の外`);
    } else if (!(p.at.x >= 0 && p.at.x <= 1 && p.at.y >= 0 && p.at.y <= 1)) errs.push(`props[${i}].at が範囲の外`);
  });
  return errs;
}

/** 置き場所の点（px）と、付けた人の向き */
export function anchorPoint(at: PropAnchor, posed: Posed[], size: number): { c: Pt; d: 1 | -1 } {
  if ("figure" in at) {
    const p = posed[at.figure];
    const j = p.joints[at.joint];
    return { c: [j[0] + p.d * (at.dx ?? 0) * p.h, j[1] + (at.dy ?? 0) * p.h], d: p.d };
  }
  return { c: [at.x * size, at.y * size], d: 1 };
}

/** 部品の形。c は部品の「持つところ」（手に付けるときは手の位置） */
function shape(kind: PropKind, [cx, cy]: Pt, s: number, d: number): string {
  const h = s / 2;
  const w = Math.max(3, s * 0.07);
  const line = (x1: number, y1: number, x2: number, y2: number, c = INK, ww = w) =>
    `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${c}" stroke-width="${n(ww)}" stroke-linecap="round"/>`;
  const rect = (x: number, y: number, ww: number, hh: number, fill: string, r = s * 0.08, stroke = "none", sw = 0) =>
    `<rect x="${n(x)}" y="${n(y)}" width="${n(ww)}" height="${n(hh)}" rx="${n(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${n(sw)}"/>`;
  const poly = (pts: Pt[], fill: string) => `<polygon points="${pts.map(([x, y]) => `${n(x)},${n(y)}`).join(" ")}" fill="${fill}"/>`;
  switch (kind) {
    case "suspended_load": {
      // 上の端から吊った荷: ワイヤーと、フックの丸と、荷の箱
      const top = Math.max(0, cy - h * 2.2);
      return line(cx, top, cx, cy - h * 0.75) + line(cx - h * 0.6, cy - h * 0.15, cx, cy - h * 0.75) + line(cx + h * 0.6, cy - h * 0.15, cx, cy - h * 0.75) +
        `<circle cx="${n(cx)}" cy="${n(cy - h * 0.78)}" r="${n(w * 1.1)}" fill="${INK}"/>` + rect(cx - h, cy - h * 0.15, s, h * 1.15, INK);
    }
    case "arrow_down":
      return line(cx, cy - h, cx, cy + h * 0.25, INK, w * 1.6) + poly([[cx - h * 0.5, cy + h * 0.1], [cx + h * 0.5, cy + h * 0.1], [cx, cy + h]], INK);
    case "broom": {
      // 柄の上を手に持ち、穂先は向いている側の下へ
      const bx = cx + d * h * 0.5;
      const by = cy + h * 1.6;
      return line(cx, cy, bx, by, INK, w) + poly([[bx - h * 0.45, by], [bx + h * 0.45, by], [bx + h * 0.6, by + h * 0.45], [bx - h * 0.6, by + h * 0.45]], GRAY);
    }
    case "box":
      // 両手で前に抱える箱。手の位置を箱の手前の上の角あたりにする
      return rect(cx - (d > 0 ? h * 0.3 : h * 1.7), cy - h * 0.55, s, h * 1.1, LIGHT, s * 0.06, INK, w);
    case "lock":
      // 錠前: 掛け金の弧と本体の角の丸い箱と鍵穴
      return `<path d="M${n(cx - h * 0.38)} ${n(cy - h * 0.1)}V${n(cy - h * 0.45)}A${n(h * 0.38)} ${n(h * 0.38)} 0 0 1 ${n(cx + h * 0.38)} ${n(cy - h * 0.45)}V${n(cy - h * 0.1)}" fill="none" stroke="${INK}" stroke-width="${n(w * 1.3)}"/>` +
        rect(cx - h * 0.62, cy - h * 0.15, h * 1.24, h * 1.0, INK, s * 0.1) + `<circle cx="${n(cx)}" cy="${n(cy + h * 0.25)}" r="${n(h * 0.13)}" fill="${LIGHT}"/>`;
    case "tag":
      // 札: ひもで下げた角の丸い板。中は × の印（触るな）を図形で描く
      return line(cx, cy - h * 0.9, cx, cy - h * 0.45, INK, w * 0.7) + rect(cx - h * 0.7, cy - h * 0.45, h * 1.4, h * 1.25, "#bdbdbd", s * 0.08, INK, w * 0.8) +
        line(cx - h * 0.35, cy - h * 0.1, cx + h * 0.35, cy + h * 0.5) + line(cx + h * 0.35, cy - h * 0.1, cx - h * 0.35, cy + h * 0.5);
  }
}

export function propsSvg(props: PropSpec[], posed: Posed[], size: number): string {
  return props
    .map((p) => {
      const { c, d } = anchorPoint(p.at, posed, size);
      return `<g data-part="prop">${shape(p.kind, c, p.size * size, d)}</g>`;
    })
    .join("");
}
