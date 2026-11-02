// 小物の部品（017・018a・018b）。どれも角の丸い箱と丸と太い線で描くピクトグラムの部品。
// 置き場所は数字で決める: 人形の関節に付ける（関節と、背の高さに対するずれ）か、キャンバスの上の位置。
import { type Joint, type Posed, PROPORTION, type Pt } from "./skeleton";

export const PROP_KINDS = [
  // 017
  "helmet", "helmet_new", "cap_lead", "harness", "tester", "wire", "panel", "bubble_question", "bubble_check",
  // 018a
  "suspended_load", "arrow_down", "broom", "box", "lock", "tag",
  // 018b
  "clock", "checklist", "prohibit", "circle_mark", "cross_mark",
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
  helmet: "head",
  helmet_new: "head",
  cap_lead: "head",
  harness: "hip",
  tester: "hand_near",
  wire: "hand_near",
  panel: null,
  bubble_question: "head",
  bubble_check: "head",
  suspended_load: null,
  arrow_down: null,
  broom: "hand_near",
  box: "hand_near",
  lock: "hand_near",
  tag: "hand_near",
  clock: null,
  checklist: "hand_near",
  prohibit: null,
  circle_mark: null,
  cross_mark: null,
};

const INK = "#000";
const GRAY = "#8a8a8a";
const LIGHT = "#d0d0d0";
const RED = "#d42a1e";

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
  // かぶり物: 頭の丸の上半分をおおう半円と、向いている側へ出るつば
  const dome = (fill: string, stroke: string, brim: number) => {
    const r = h * 0.86;
    const top = `<path d="M${n(cx - r)} ${n(cy - h * 0.05)}A${n(r)} ${n(r)} 0 0 1 ${n(cx + r)} ${n(cy - h * 0.05)}Z" fill="${fill}" stroke="${stroke}" stroke-width="${n(w)}" stroke-linejoin="round"/>`;
    const bx0 = d > 0 ? cx - r * 1.05 : cx - r * brim;
    return top + rect(bx0, cy - h * 0.12, r * (1.05 + brim), h * 0.2, fill, h * 0.08, stroke, w);
  };
  // 吹き出し: 白い角の丸い箱と、話す人へ向かうしっぽ（中の白は data-part="bubble" の中だけ）
  const bubble = (inner: string) => {
    const bx = cx - h;
    const by = cy - h * 1.6;
    const tail: Pt[] = [[cx - d * h * 0.2, by + h * 1.15], [cx - d * h * 0.55, by + h * 1.15], [cx - d * h * 0.75, cy + h * 0.1]];
    return `<g data-part="bubble">${rect(bx, by, s, h * 1.2, "#fff", s * 0.18, INK, w)}` +
      `<polygon points="${tail.map(([x, y]) => `${n(x)},${n(y)}`).join(" ")}" fill="#fff" stroke="${INK}" stroke-width="${n(w)}" stroke-linejoin="round"/>` +
      rect(cx - d * h * 0.6, by + h * 1.02, h * 0.45, w * 1.6, "#fff", 0) + inner + "</g>";
  };
  switch (kind) {
    case "helmet":
      // 作業の人のヘルメット: 明るいグレーと黒い縁
      return dome(LIGHT, INK, 1.35);
    case "helmet_new":
      // 新人の白いヘルメット（白は data-part="helmet-new" の中だけ）
      return `<g data-part="helmet-new">${dome("#fff", INK, 1.35)}</g>`;
    case "cap_lead":
      // 上の人の黒い帽子: 黒い頭と分かれて見えるよう、明るいグレーの帯を 1 本入れる
      return dome(INK, INK, 1.6) + rect(cx - h * 0.8, cy - h * 0.34, h * 1.6, h * 0.14, LIGHT, 0);
    case "harness": {
      // 安全帯: 腰のベルトと、背中側から出る縄と、先のフック
      const bk = cx - d * h * 0.9;
      const hookX = bk - d * h * 0.5;
      const hookY = cy - h * 1.1;
      return rect(cx - h * 0.75, cy - h * 0.16, h * 1.5, h * 0.32, GRAY, h * 0.08, INK, w * 0.6) +
        `<path d="M${n(bk + d * h * 0.3)} ${n(cy)}Q${n(bk - d * h * 0.4)} ${n(cy - h * 0.2)} ${n(hookX)} ${n(hookY + h * 0.35)}" fill="none" stroke="${INK}" stroke-width="${n(w)}" stroke-linecap="round"/>` +
        `<path d="M${n(hookX)} ${n(hookY + h * 0.35)}V${n(hookY)}A${n(h * 0.2)} ${n(h * 0.2)} 0 0 ${d > 0 ? 0 : 1} ${n(hookX - d * h * 0.4)} ${n(hookY)}V${n(hookY + h * 0.12)}" fill="none" stroke="${INK}" stroke-width="${n(w * 1.2)}" stroke-linecap="round"/>`;
    }
    case "tester": {
      // 検電器: 手に握る柄と、向いている側へのびる先と、先の近くの丸い光るところ
      const tip = cx + d * h * 1.3;
      return rect(cx - h * 0.35, cy - h * 0.16, h * 0.7, h * 0.32, INK, h * 0.12) +
        line(cx + d * h * 0.3, cy, tip, cy, GRAY, h * 0.22) + line(tip, cy, tip + d * h * 0.25, cy, INK, w * 0.8) +
        `<circle cx="${n(cx + d * h * 0.85)}" cy="${n(cy)}" r="${n(h * 0.17)}" fill="${LIGHT}" stroke="${INK}" stroke-width="${n(w * 0.6)}"/>`;
    }
    case "wire": {
      // 電線: 手から向いている側へ垂れる波の線と、先の 2 本の芯
      const ex = cx + d * s;
      const ey = cy + h * 0.4;
      return `<path d="M${n(cx)} ${n(cy)}C${n(cx + d * h * 0.6)} ${n(cy + h * 0.9)} ${n(cx + d * h * 1.2)} ${n(cy - h * 0.5)} ${n(ex)} ${n(ey)}" fill="none" stroke="${INK}" stroke-width="${n(w * 1.4)}" stroke-linecap="round"/>` +
        line(ex, ey, ex + d * h * 0.25, ey - h * 0.15, GRAY, w * 0.7) + line(ex, ey, ex + d * h * 0.25, ey + h * 0.15, GRAY, w * 0.7);
    }
    case "panel": {
      // 盤: 床に立つ箱。扉の合わせ目、ブレーカーの小さな箱 2 列、取っ手。c は盤の下の真ん中
      const pw = s * 0.7;
      const x0 = cx - pw / 2;
      const y0 = cy - s;
      let out = rect(x0, y0, pw, s, LIGHT, s * 0.04, INK, w) + line(cx, y0 + w, cx, cy - w, INK, w * 0.5);
      for (let r = 0; r < 3; r++) for (const side of [-1, 1]) out += rect(cx + side * pw * 0.25 - pw * 0.09, y0 + s * (0.15 + r * 0.17), pw * 0.18, s * 0.1, INK, s * 0.015);
      return out + rect(cx + pw * 0.06, y0 + s * 0.72, pw * 0.06, s * 0.12, INK, s * 0.02);
    }
    case "bubble_question": {
      // 「？」を線と点で描く（014: 絵の面に文字を置かない）
      const qy = cy - h * 1.0;
      return bubble(`<path d="M${n(cx - h * 0.22)} ${n(qy - h * 0.12)}A${n(h * 0.22)} ${n(h * 0.22)} 0 1 1 ${n(cx + h * 0.05)} ${n(qy + h * 0.12)}Q${n(cx)} ${n(qy + h * 0.18)} ${n(cx)} ${n(qy + h * 0.3)}" fill="none" stroke="${INK}" stroke-width="${n(w * 1.1)}" stroke-linecap="round"/>` +
        `<circle cx="${n(cx)}" cy="${n(qy + h * 0.47)}" r="${n(w * 0.75)}" fill="${INK}"/>`);
    }
    case "bubble_check": {
      const qy = cy - h * 1.0;
      return bubble(`<polyline points="${n(cx - h * 0.35)},${n(qy)} ${n(cx - h * 0.08)},${n(qy + h * 0.3)} ${n(cx + h * 0.4)},${n(qy - h * 0.3)}" fill="none" stroke="${INK}" stroke-width="${n(w * 1.3)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
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
    case "clock":
      // 時計: 太い輪と 12 時・3 時・6 時・9 時の目盛りと 2 本の針（短い針は 3 時、長い針は 12 時）
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(h - w)}" fill="${LIGHT}" stroke="${INK}" stroke-width="${n(w * 1.4)}"/>` +
        [0, 1, 2, 3].map((k) => {
          const a = (k * Math.PI) / 2;
          return line(cx + Math.sin(a) * h * 0.62, cy - Math.cos(a) * h * 0.62, cx + Math.sin(a) * h * 0.76, cy - Math.cos(a) * h * 0.76, INK, w * 0.8);
        }).join("") +
        line(cx, cy, cx, cy - h * 0.55, INK, w * 0.9) + line(cx, cy, cx + h * 0.38, cy, INK, w * 1.2) + `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(w)}" fill="${INK}"/>`;
    case "checklist": {
      // 手元のチェックリスト: 板と上の留め具、3 行の欄。上の 2 行に ✓、下の 1 行は空の四角
      const x0 = cx - h * 0.7;
      const y0 = cy - h;
      let out = rect(x0, y0, h * 1.4, s, LIGHT, s * 0.06, INK, w) + rect(cx - h * 0.3, y0 - h * 0.12, h * 0.6, h * 0.24, INK, s * 0.04);
      for (let k = 0; k < 3; k++) {
        const ry = y0 + h * (0.5 + k * 0.5);
        const bx = x0 + h * 0.22;
        out += rect(bx, ry - h * 0.14, h * 0.28, h * 0.28, "none", s * 0.02, INK, w * 0.5) + line(bx + h * 0.45, ry, x0 + h * 1.2, ry, GRAY, w * 0.6);
        if (k < 2) out += `<polyline points="${n(bx + h * 0.04)},${n(ry)} ${n(bx + h * 0.13)},${n(ry + h * 0.1)} ${n(bx + h * 0.34)},${n(ry - h * 0.2)}" fill="none" stroke="${INK}" stroke-width="${n(w * 0.8)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      return out;
    }
    case "prohibit":
      // 禁止: 赤い円と左上から右下への斜線。下のものが透けるよう中は塗らない。赤はこの部品の中だけ（014）
      return `<g data-part="prohibit"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(h - w)}" fill="none" stroke="${RED}" stroke-width="${n(w * 1.8)}"/>` +
        line(cx - (h - w) * 0.7, cy - (h - w) * 0.7, cx + (h - w) * 0.7, cy + (h - w) * 0.7, RED, w * 1.8) + "</g>";
    case "circle_mark":
      // ○: 正しいやり方の印。太い黒の輪
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(h * 0.8)}" fill="none" stroke="${INK}" stroke-width="${n(w * 2.2)}"/>`;
    case "cross_mark":
      // ×: まちがったやり方の印。太い黒の 2 本線（赤は禁止の部品だけに使う）
      return line(cx - h * 0.7, cy - h * 0.7, cx + h * 0.7, cy + h * 0.7, INK, w * 2.2) + line(cx + h * 0.7, cy - h * 0.7, cx - h * 0.7, cy + h * 0.7, INK, w * 2.2);
  }
}

/** かぶり物は頭に付けたとき、size ではなく頭の大きさに合わせる */
const HEADWEAR = new Set<PropKind>(["helmet", "helmet_new", "cap_lead"]);

export function propsSvg(props: PropSpec[], posed: Posed[], size: number): string {
  return props
    .map((p) => {
      const { c, d } = anchorPoint(p.at, posed, size);
      const s = HEADWEAR.has(p.kind) && "figure" in p.at && p.at.joint === "head" ? posed[p.at.figure].h * PROPORTION.head * 2.5 : p.size * size;
      return `<g data-part="prop">${shape(p.kind, c, s, d)}</g>`;
    })
    .join("");
}
