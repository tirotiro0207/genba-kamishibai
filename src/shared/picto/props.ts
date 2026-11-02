// 小物の部品（017・018a・018b。11/2 に作者のスケッチに合わせて見た目を直した）。
// どれも黒い縁取りの角の丸い箱と丸と太い線で描くピクトグラムの部品。道具は何か分かる形にする
// （盤と検電器は角の丸い箱に表示の丸 2 つ、コンセントは穴 2 つずつ）。
// 置き場所は数字で決める: 人形の関節に付ける（関節と、背の高さに対するずれ）か、キャンバスの上の位置。
// 吹き出しは、考える（点線と小さい丸）と話す（しっぽ）の 2 つ。中に道具の絵と「？」か「✓」を描く。
import { type Joint, type Posed, PROPORTION, type Pt } from "./skeleton";

export const PROP_KINDS = [
  // 017
  "helmet", "helmet_new", "cap_lead", "harness", "tester", "wire", "panel", "bubble_question", "bubble_check",
  // 018a
  "suspended_load", "arrow_down", "broom", "box", "lock", "tag",
  // 018b
  "clock", "checklist", "prohibit", "circle_mark", "cross_mark",
  // 11/2 スケッチに合わせて足した
  "outlet", "toolbox", "check_mark", "think_question", "think_check",
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
  /** 吹き出しの中に描く道具（吹き出しだけ） */
  inner?: InnerKind;
}

/** 吹き出し。人に付けると、しっぽ（話す）か小さい丸（考える）がその人の頭へ向かう */
export const BUBBLES = new Set<PropKind>(["bubble_question", "bubble_check", "think_question", "think_check"]);
/** 吹き出しの中に描ける道具 */
export const INNER_KINDS = ["panel", "tester", "outlet", "wire", "harness", "lock", "tag", "box", "toolbox", "checklist", "suspended_load", "broom", "clock"] as const;
export type InnerKind = (typeof INNER_KINDS)[number];

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
  outlet: null,
  toolbox: null,
  check_mark: null,
  think_question: "head",
  think_check: "head",
};

const INK = "#000";
const GRAY = "#8a8a8a";
const LIGHT = "#d6d6d6";
const PALE = "#ececec";
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
    if (p.inner !== undefined && !(BUBBLES.has(p.kind) && (INNER_KINDS as readonly string[]).includes(p.inner))) errs.push(`props[${i}].inner は吹き出しの中の道具だけ: ${p.inner}`);
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
function shape(kind: PropKind, [cx, cy]: Pt, s: number, d: number, icon = false): string {
  const h = s / 2;
  const w = Math.max(3, s * 0.07);
  const line = (x1: number, y1: number, x2: number, y2: number, c = INK, ww = w) =>
    `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${c}" stroke-width="${n(ww)}" stroke-linecap="round"/>`;
  const rect = (x: number, y: number, ww: number, hh: number, fill: string, r = s * 0.08, stroke = "none", sw = 0) =>
    `<rect x="${n(x)}" y="${n(y)}" width="${n(ww)}" height="${n(hh)}" rx="${n(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${n(sw)}"/>`;
  const poly = (pts: Pt[], fill: string) => `<polygon points="${pts.map(([x, y]) => `${n(x)},${n(y)}`).join(" ")}" fill="${fill}"/>`;
  // かぶり物: 頭の上の半分より少し上をおおう丸い形と、向いている側へ出るつば（目と口は出したまま）
  const dome = (fill: string, brim: number) => {
    const r = h * 0.88;
    const base = cy - h * 0.22;
    const top = `<path d="M${n(cx - r)} ${n(base)}A${n(r)} ${n(r * 0.95)} 0 0 1 ${n(cx + r)} ${n(base)}Z" fill="${fill}" stroke="${INK}" stroke-width="${n(w)}" stroke-linejoin="round"/>`;
    const bx0 = d > 0 ? cx - r * 1.02 : cx - r * brim;
    return top + rect(bx0, base - h * 0.06, r * (1.02 + brim), h * 0.16, fill, h * 0.08, INK, w);
  };
  // 表示の丸 2 つ（左は抜き、右は塗り）を入れた暗い窓。盤と検電器の印
  const display = (x: number, y: number, ww: number, hh: number) =>
    rect(x, y, ww, hh, "#3a3a3a", hh * 0.3, INK, w * 0.5) +
    `<circle cx="${n(x + ww * 0.3)}" cy="${n(y + hh / 2)}" r="${n(hh * 0.28)}" fill="#3a3a3a" stroke="${PALE}" stroke-width="${n(Math.max(1.5, hh * 0.1))}"/>` +
    `<circle cx="${n(x + ww * 0.7)}" cy="${n(y + hh / 2)}" r="${n(hh * 0.3)}" fill="${PALE}"/>`;
  switch (kind) {
    case "helmet":
      // ほかの作業の人のグレーのヘルメット
      return dome("#9a9a9a", 0.45);
    case "helmet_new":
      // 新人の白いヘルメット（白は data-part="helmet-new" の中だけ）
      return `<g data-part="helmet-new">${dome("#fff", 0.45)}</g>`;
    case "cap_lead":
      // 上の人の黒い帽子: 長いつば
      return dome(INK, 0.85);
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
      // 検電器: 手に持つ角の丸い箱と表示の丸 2 つ、向いている側へのびる先
      const bw = h * 1.0;
      const bh = h * 0.7;
      const x0 = d > 0 ? cx - bw * 0.35 : cx - bw * 0.65;
      const tip = cx + d * (bw * 0.65 + h * 0.6);
      return line(cx + d * bw * 0.6, cy, tip, cy, INK, w * 1.1) +
        rect(x0, cy - bh / 2, bw, bh, LIGHT, bh * 0.25, INK, w) + display(x0 + bw * 0.12, cy - bh * 0.27, bw * 0.76, bh * 0.54);
    }
    case "wire": {
      // 電線: 手から向いている側へ垂れる波の線と、先の 2 本の芯
      const ex = cx + d * s;
      const ey = cy + h * 0.4;
      return `<path d="M${n(cx)} ${n(cy)}C${n(cx + d * h * 0.6)} ${n(cy + h * 0.9)} ${n(cx + d * h * 1.2)} ${n(cy - h * 0.5)} ${n(ex)} ${n(ey)}" fill="none" stroke="${INK}" stroke-width="${n(w * 1.4)}" stroke-linecap="round"/>` +
        line(ex, ey, ex + d * h * 0.25, ey - h * 0.15, GRAY, w * 0.7) + line(ex, ey, ex + d * h * 0.25, ey + h * 0.15, GRAY, w * 0.7);
    }
    case "panel": {
      // 盤: 壁に付いた角の丸い箱と、表示の窓（丸 2 つ）と、下へ垂れるコードと差し込み。c は箱の真ん中
      const pw = s * 0.95;
      const ph = s * 0.72;
      const x0 = cx - pw / 2;
      const y0 = cy - ph / 2;
      let out = rect(x0, y0, pw, ph, LIGHT, s * 0.14, INK, w) + display(x0 + pw * 0.14, y0 + ph * 0.22, pw * 0.72, ph * 0.4);
      if (!icon) {
        const ty = y0 + ph + s * 0.32;
        out += `<path d="M${n(cx)} ${n(y0 + ph)}C${n(cx)} ${n(ty - s * 0.1)} ${n(cx - s * 0.12)} ${n(ty - s * 0.12)} ${n(cx - s * 0.08)} ${n(ty)}" fill="none" stroke="${INK}" stroke-width="${n(w * 0.8)}" stroke-linecap="round"/>` +
          rect(cx - s * 0.13, ty, s * 0.1, s * 0.09, INK, s * 0.02);
      }
      return out;
    }
    case "outlet": {
      // コンセント: 角の丸い板に、差し込み口 2 つ。どの口にも縦の穴が 2 つずつ。c は板の真ん中
      const pw = s * 0.62;
      const x0 = cx - pw / 2;
      const y0 = cy - h;
      let out = rect(x0, y0, pw, s, PALE, s * 0.12, INK, w);
      for (const k of [0, 1]) {
        const oy = y0 + s * (0.1 + k * 0.45);
        out += rect(x0 + pw * 0.14, oy, pw * 0.72, s * 0.36, LIGHT, s * 0.1, INK, w * 0.8);
        for (const side of [-1, 1]) out += rect(cx + side * pw * 0.17 - s * 0.03, oy + s * 0.09, s * 0.06, s * 0.18, INK, s * 0.02);
      }
      return out;
    }
    case "toolbox": {
      // 道具箱: 床に置いた箱と取っ手。c は箱の下の真ん中
      const bh = s * 0.45;
      return `<path d="M${n(cx - s * 0.22)} ${n(cy - bh)}V${n(cy - bh - s * 0.14)}H${n(cx + s * 0.22)}V${n(cy - bh)}" fill="none" stroke="${INK}" stroke-width="${n(w * 1.2)}" stroke-linejoin="round"/>` +
        rect(cx - h, cy - bh, s, bh, "#6e6e6e", s * 0.08, INK, w) + line(cx - h + w, cy - bh * 0.62, cx + h - w, cy - bh * 0.62, INK, w * 0.6);
    }
    case "check_mark":
      // ✓ の丸: 黒い丸に明るい ✓（確かめた、の印）
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(h * 0.9)}" fill="${INK}"/>` +
        `<polyline points="${n(cx - h * 0.42)},${n(cy + h * 0.02)} ${n(cx - h * 0.1)},${n(cy + h * 0.34)} ${n(cx + h * 0.45)},${n(cy - h * 0.32)}" fill="none" stroke="${PALE}" stroke-width="${n(w * 1.6)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    case "bubble_question":
    case "bubble_check":
    case "think_question":
    case "think_check":
      return ""; // 吹き出しは bubbleSvg で描く
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

/**
 * 吹き出し。c は箱の真ん中（キャンバスの中に収める）、to はしっぽの向かう先（人の頭。無ければ真下）。
 * 話す: 実線の箱としっぽ / 考える: 点線の箱と、頭へ向かって小さくなる丸 2 つ。
 * 中は、道具があれば左に道具・右に「？」か「✓」、無ければ「？」か「✓」だけ。白は data-part="bubble" の中だけ
 */
function bubbleSvg(kind: PropKind, [cx0, cy0]: Pt, s: number, to: Pt | null, inner: InnerKind | undefined, size: number): string {
  const think = kind.startsWith("think");
  const check = kind.endsWith("check");
  const bw = s;
  const bh = s * 0.6;
  const w = Math.max(3, s * 0.03);
  const cx = Math.max(bw / 2 + w, Math.min(size - bw / 2 - w, cx0));
  const cy = Math.max(bh / 2 + w, Math.min(size - bh / 2 - w, cy0));
  const target: Pt = to ?? [cx, cy + bh];
  const box = `<rect x="${n(cx - bw / 2)}" y="${n(cy - bh / 2)}" width="${n(bw)}" height="${n(bh)}" rx="${n(bh * (think ? 0.5 : 0.25))}" fill="#fff" stroke="${INK}" stroke-width="${n(w)}"${think ? ` stroke-dasharray="${n(w * 2.2)} ${n(w * 1.6)}"` : ""}/>`;
  // 箱の縁から先へ向かう向き
  const vx = target[0] - cx;
  const vy = target[1] - cy;
  const len = Math.hypot(vx, vy) || 1;
  const ux = vx / len;
  const uy = vy / len;
  const tEdge = Math.min(Math.abs((bw / 2) / (ux || 1e-9)), Math.abs((bh / 2) / (uy || 1e-9)));
  const edge: Pt = [cx + ux * tEdge, cy + uy * tEdge];
  const room = Math.max(0, len - tEdge - s * 0.06);
  let tail = "";
  if (think) {
    // 考える: 小さい丸 2 つ
    const r1 = s * 0.055;
    const r2 = s * 0.035;
    const d1 = Math.min(room * 0.35, s * 0.12) + r1;
    const d2 = Math.min(room * 0.75, s * 0.26) + r2;
    tail = [[d1, r1], [d2, r2]].map(([dd, r]) => `<circle cx="${n(edge[0] + ux * dd)}" cy="${n(edge[1] + uy * dd)}" r="${n(r)}" fill="#fff" stroke="${INK}" stroke-width="${n(w * 0.8)}"/>`).join("");
  } else {
    // 話す: 縁から先へ向かう三角のしっぽ。付け根は箱の中に少し入れ、縁の線を白で隠す
    const tl = Math.min(room * 0.7, s * 0.22);
    const px = -uy * s * 0.07;
    const py = ux * s * 0.07;
    const base: Pt = [edge[0] - ux * w * 1.5, edge[1] - uy * w * 1.5];
    const tip: Pt = [edge[0] + ux * tl, edge[1] + uy * tl];
    tail = `<polygon points="${n(base[0] + px)},${n(base[1] + py)} ${n(base[0] - px)},${n(base[1] - py)} ${n(tip[0])},${n(tip[1])}" fill="#fff" stroke="${INK}" stroke-width="${n(w)}" stroke-linejoin="round"/>` +
      `<line x1="${n(base[0] + px * 0.8)}" y1="${n(base[1] + py * 0.8)}" x2="${n(base[0] - px * 0.8)}" y2="${n(base[1] - py * 0.8)}" stroke="#fff" stroke-width="${n(w * 2.2)}"/>`;
  }
  // 中身
  const mx = inner ? cx + bw * 0.24 : cx;
  const ms = bh * 0.62;
  let mark: string;
  if (check) {
    mark = `<circle cx="${n(mx)}" cy="${n(cy)}" r="${n(ms * 0.5)}" fill="${INK}"/>` +
      `<polyline points="${n(mx - ms * 0.24)},${n(cy + ms * 0.01)} ${n(mx - ms * 0.06)},${n(cy + ms * 0.19)} ${n(mx + ms * 0.26)},${n(cy - ms * 0.18)}" fill="none" stroke="#fff" stroke-width="${n(ms * 0.11)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else {
    // 「？」を線と点で描く（014: 絵の面に文字を置かない）
    const q = ms * 0.5;
    const qy = cy - q * 0.35;
    mark = `<path d="M${n(mx - q * 0.42)} ${n(qy - q * 0.2)}A${n(q * 0.42)} ${n(q * 0.42)} 0 1 1 ${n(mx + q * 0.1)} ${n(qy + q * 0.22)}Q${n(mx)} ${n(qy + q * 0.32)} ${n(mx)} ${n(qy + q * 0.62)}" fill="none" stroke="${INK}" stroke-width="${n(q * 0.24)}" stroke-linecap="round"/>` +
      `<circle cx="${n(mx)}" cy="${n(qy + q * 1.02)}" r="${n(q * 0.15)}" fill="${INK}"/>`;
  }
  const icon = inner ? shape(inner, [cx - bw * 0.18, cy], bh * 0.62, 1, true) : "";
  return `<g data-part="bubble">${tail}${box}${icon}${mark}</g>`;
}

export function propsSvg(props: PropSpec[], posed: Posed[], size: number): string {
  return props
    .map((p) => {
      const { c, d } = anchorPoint(p.at, posed, size);
      if (BUBBLES.has(p.kind)) {
        let to: Pt | null = null;
        if ("figure" in p.at) {
          const f = posed[p.at.figure];
          to = [f.joints.head[0], f.joints.head[1] - f.h * PROPORTION.head * 0.6];
        }
        return `<g data-part="prop">${bubbleSvg(p.kind, c, p.size * size, to, p.inner, size)}</g>`;
      }
      const s = HEADWEAR.has(p.kind) && "figure" in p.at && p.at.joint === "head" ? posed[p.at.figure].h * PROPORTION.head * 2.5 : p.size * size;
      return `<g data-part="prop">${shape(p.kind, c, s, d)}</g>`;
    })
    .join("");
}
