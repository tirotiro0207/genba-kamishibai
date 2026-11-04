// 小物の部品（017・018a・018b・058。11/5 に人の新しい絵柄に合わせて描き直し、業種の道具を足した）。
// 絵柄の決まりは docs/picto-design.md: 縁は黒で、太さはキャンバスに対して一定（人の縁と同じ。小物の大きさでは変えない）、
// 塗りは灰色の 7 段、角は丸く、線のつなぎ目と端は丸。重なった形は「縁の回 → 中身の回」の 2 回描きでつなぎ目の線を消す（手足と同じ）。
// 印（○・×・✓・禁止・矢印）だけは、大きさに合わせて太さを変える。
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
  // 058 伝わらない絵を直すために足した
  "unwell", "span_arrow", "edge", "anchor_line", "trash_bin",
  // 11/5 業種が増えた分（docs/picto-design.md の表で、多くの業種で使う順）
  "cone", "barrier", "ladder", "stepladder", "fire_extinguisher", "first_aid", "gloves", "goggles",
  "knife", "hot_pot", "cart", "forklift", "spill", "bucket", "mop", "chemical", "gas_cylinder",
  "hammer", "wrench", "grinder", "gear", "sun", "water_bottle", "faucet", "radio",
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
export const INNER_KINDS = [
  "panel", "tester", "outlet", "wire", "harness", "lock", "tag", "box", "toolbox", "checklist", "suspended_load", "broom", "clock",
  "fire_extinguisher", "first_aid", "gloves", "goggles", "cone", "ladder", "chemical", "knife", "gear",
] as const;
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
  unwell: "head",
  span_arrow: null,
  edge: null,
  anchor_line: "hip",
  trash_bin: null,
  cone: null,
  barrier: null,
  ladder: null,
  stepladder: null,
  fire_extinguisher: null,
  first_aid: null,
  gloves: "hand_near",
  goggles: "head",
  knife: "hand_near",
  hot_pot: null,
  cart: null,
  forklift: null,
  spill: null,
  bucket: null,
  mop: "hand_near",
  chemical: null,
  gas_cylinder: null,
  hammer: "hand_near",
  wrench: "hand_near",
  grinder: "hand_near",
  gear: null,
  sun: null,
  water_bottle: "hand_near",
  faucet: null,
  radio: "hand_near",
};

/** c が部品の下の真ん中（床に置く）の部品。吹き出しの中では真ん中へずらして描く */
const ON_FLOOR = new Set<PropKind>(["toolbox", "trash_bin", "cone", "barrier", "ladder", "stepladder", "fire_extinguisher", "hot_pot", "cart", "forklift", "bucket", "chemical", "gas_cylinder"]);

/** 天井の線の高さ（scene.ts の CEILING と同じ。吊り元の綱が天井まで届く） */
const CEIL = 0.06;

const INK = "#000";
/**
 * 塗りの灰色の 7 段（明るい順）。白（#fff）は絵柄の検査（style.ts）で新人のヘルメット・背景・吹き出しの中だけなので、
 * 小物のいちばん明るい面は紙の白（#f4f4f4）にする
 */
const PAPER = "#f4f4f4";
const LIGHT = "#ccc";
const MID = "#999";
const STEEL = "#777";
const DARK = "#555";
const DEEP = "#333";
const COAL = "#222";
const RED = "#d42a1e";

/** 縁の太さ（キャンバスの幅に対する割合）。人の縁（背の高さ 434 の中で 5〜6）を、背の高さ 0.55 の人に当てた値 */
const LINE = 0.0068;
export const lineWidth = (size: number) => Math.max(1.5, size * LINE);

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

/** 描き方の付け足し。W は縁の太さ、icon は吹き出しの中の小さい絵、worn は人の頭や手に着けたとき */
interface Opt {
  W: number;
  icon?: boolean;
  worn?: boolean;
}

/** 部品の形。c は部品の「持つところ」（手に付けるときは手の位置。床に置く部品は下の真ん中） */
function shape(kind: PropKind, [cx, cy]: Pt, s: number, d: number, { W, icon = false, worn = false }: Opt): string {
  const h = s / 2;
  /** 向いている側を正にした横の位置 */
  const X = (v: number) => cx + d * v;
  const sw = (k = 1) => `stroke="${INK}" stroke-width="${n(W * k)}" stroke-linejoin="round"`;
  const line = (x1: number, y1: number, x2: number, y2: number, c = INK, k = 1) =>
    `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${c}" stroke-width="${n(W * k)}" stroke-linecap="round"/>`;
  /** 縁つきの形（塗りと縁を 1 つの要素で。縁は塗りの上に乗る） */
  const path = (dd: string, fill: string, k = 1) => `<path d="${dd}" fill="${fill}" ${sw(k)}/>`;
  /** 角の丸い四角のパス。x1・x2 は向きで入れ替わってよい */
  const rr = (x1: number, y1: number, x2: number, y2: number, r?: number) => {
    const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1];
    const [t, u] = y1 < y2 ? [y1, y2] : [y2, y1];
    const q = Math.min(r ?? Math.min(b - a, u - t) * 0.22, (b - a) / 2, (u - t) / 2);
    return `M${n(a + q)} ${n(t)}H${n(b - q)}A${n(q)} ${n(q)} 0 0 1 ${n(b)} ${n(t + q)}V${n(u - q)}A${n(q)} ${n(q)} 0 0 1 ${n(b - q)} ${n(u)}H${n(a + q)}A${n(q)} ${n(q)} 0 0 1 ${n(a)} ${n(u - q)}V${n(t + q)}A${n(q)} ${n(q)} 0 0 1 ${n(a + q)} ${n(t)}Z`;
  };
  const box = (x1: number, y1: number, x2: number, y2: number, fill: string, r?: number, k = 1) => path(rr(x1, y1, x2, y2, r), fill, k);
  const circ = (x: number, y: number, r: number) => `M${n(x - r)} ${n(y)}A${n(r)} ${n(r)} 0 1 0 ${n(x + r)} ${n(y)}A${n(r)} ${n(r)} 0 1 0 ${n(x - r)} ${n(y)}Z`;
  const ring = (x: number, y: number, r: number, fill: string, k = 1) => path(circ(x, y, r), fill, k);
  const dot = (x: number, y: number, r: number, fill = INK) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${fill}"/>`;
  const poly = (pts: Pt[]) => `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}Z`;
  /** 綱・柄・管のような太さのある線。縁の黒の線の上に中身の線を重ねる（手足と同じ 2 回描き） */
  const cord = (dd: string, t: number, fill: string) =>
    `<path d="${dd}" fill="none" stroke="${INK}" stroke-width="${n(t)}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${dd}" fill="none" stroke="${fill}" stroke-width="${n(Math.max(0.5, t - W * 1.6))}" stroke-linecap="round" stroke-linejoin="round"/>`;
  /** 重なった形をひと続きに見せる: 全部の縁（太さ 2 倍。外へ出た半分が縁になる）→ 全部の中身 */
  const merge = (parts: [string, string][], rule = "") =>
    parts.map(([dd]) => `<path d="${dd}" fill="${INK}"${rule} stroke="${INK}" stroke-width="${n(W * 2)}" stroke-linejoin="round"/>`).join("") +
    parts.map(([dd, fill]) => `<path d="${dd}" fill="${fill}"${rule}/>`).join("");
  /** つや: 濃い面に、光の来る側（左上）へ短い明るい線を 1 本 */
  const shine = (x1: number, y1: number, x2: number, y2: number, on: string) => line(x1, y1, x2, y2, on === MID || on === STEEL ? LIGHT : on === LIGHT ? PAPER : MID, 0.7);
  /** 印の太さ（大きさに合わせる） */
  const mark = s * 0.1;

  // かぶり物: 頭の上の半分をおおう丸い形と、縁の帯（向いている側へ少し長い）。目と口は出したまま。人の絵柄の安全帽と同じ作り
  const dome = (fill: string, brim: number, cap = false) => {
    const r = h * 0.9;
    const base = cy - h * 0.28;
    const top = path(`M${n(cx - r)} ${n(base)}C${n(cx - r)} ${n(base - r * 1.25)} ${n(cx + r)} ${n(base - r * 1.25)} ${n(cx + r)} ${n(base)}Z`, fill);
    const bh = r * 0.2;
    const band = cap
      ? box(X(r * 0.45), base - bh * 0.6, X(r * (1 + brim)), base + bh * 0.4, fill, bh * 0.5)
      : box(X(-r * 1.06), base - bh * 0.6, X(r * (1.06 + brim)), base + bh * 0.4, fill, bh * 0.5);
    const ridge = cap ? "" : `<path d="M${n(X(r * 0.12))} ${n(base - r * 0.92)}Q${n(X(r * 0.24))} ${n(base - r * 0.5)} ${n(X(r * 0.2))} ${n(base - bh * 0.6)}" fill="none" stroke="${INK}" stroke-width="${n(W * 0.7)}" stroke-linecap="round"/>`;
    const gloss = fill === "#fff" ? "" : `<path d="M${n(X(-r * 0.62))} ${n(base - r * 0.42)}Q${n(X(-r * 0.5))} ${n(base - r * 0.78)} ${n(X(-r * 0.16))} ${n(base - r * 0.88)}" fill="none" stroke="${fill === COAL ? STEEL : LIGHT}" stroke-width="${n(W * 0.7)}" stroke-linecap="round"/>`;
    return top + ridge + gloss + band;
  };
  // 表示の丸 2 つ（左は抜き、右は塗り）を入れた暗い窓。盤と検電器の印
  const display = (x1: number, y1: number, x2: number, y2: number) => {
    const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1];
    const hh = y2 - y1;
    const ym = (y1 + y2) / 2;
    return box(a, y1, b, y2, DEEP, hh * 0.3, 0.6) +
      `<circle cx="${n(a + (b - a) * 0.3)}" cy="${n(ym)}" r="${n(hh * 0.24)}" fill="none" stroke="${PAPER}" stroke-width="${n(Math.max(1, hh * 0.1))}"/>` + dot(a + (b - a) * 0.7, ym, hh * 0.26, PAPER);
  };
  switch (kind) {
    case "helmet":
      // ほかの作業の人のグレーのヘルメット
      return dome(MID, 0.25);
    case "helmet_new":
      // 新人の白いヘルメット（白は data-part="helmet-new" の中だけ）
      return `<g data-part="helmet-new">${dome("#fff", 0.25)}</g>`;
    case "cap_lead":
      // 上の人の黒い帽子: 丸い形と、前へ長く出るつば
      return dome(COAL, 0.75, true);
    case "harness": {
      // 安全帯: 腰のベルトと前のバックル、背中側から出る綱と、先のフック（縦長の輪）
      const bk = X(-h * 0.7);
      const hx = X(-h * 1.3);
      const hy = cy - h * 1.05;
      return cord(`M${n(bk)} ${n(cy)}Q${n(X(-h * 1.45))} ${n(cy - h * 0.1)} ${n(hx)} ${n(hy + h * 0.28)}`, W * 2.6, MID) +
        cord(rr(hx - h * 0.13, hy - h * 0.25, hx + h * 0.13, hy + h * 0.28, h * 0.13), W * 2.4, LIGHT) +
        box(cx - h * 0.78, cy - h * 0.15, cx + h * 0.78, cy + h * 0.15, DEEP, h * 0.08) +
        box(X(h * 0.12), cy - h * 0.22, X(h * 0.42), cy + h * 0.22, LIGHT, h * 0.06, 0.8);
    }
    case "tester": {
      // 検電器: 手に持つ丸い軸と表示の丸 2 つの窓、向いている側へのびる先と黒い先端
      const back = X(-h * 0.55);
      const front = X(h * 0.95);
      const tip = X(h * 1.6);
      return cord(`M${n(front)} ${n(cy)}H${n(tip)}`, W * 2.6, MID) + dot(tip, cy, W * 1.3) +
        box(back, cy - h * 0.3, front, cy + h * 0.3, LIGHT, h * 0.3) + display(X(h * 0.02), cy - h * 0.17, X(h * 0.78), cy + h * 0.17) +
        line(X(-h * 0.25), cy - h * 0.26, X(-h * 0.25), cy + h * 0.26, INK, 0.6);
    }
    case "wire": {
      // 電線: 手から向いている側へ垂れる灰の被覆と、先の 2 本の芯
      const ex = X(s);
      const ey = cy + h * 0.4;
      return cord(`M${n(X(h * 1.75))} ${n(ey - h * 0.12)}L${n(ex + d * h * 0.3)} ${n(ey - h * 0.28)}M${n(X(h * 1.75))} ${n(ey + h * 0.12)}L${n(ex + d * h * 0.3)} ${n(ey + h * 0.28)}`, W * 2, LIGHT) +
        cord(`M${n(cx)} ${n(cy)}C${n(X(h * 0.6))} ${n(cy + h * 0.9)} ${n(X(h * 1.2))} ${n(cy - h * 0.5)} ${n(X(h * 1.8))} ${n(ey)}`, W * 3.2, DARK);
    }
    case "panel": {
      // 盤: 壁に付いた角の丸い箱。扉の内の線、表示の窓（丸 2 つ）、ブレーカーの列、下へ垂れるコードと差し込み。c は箱の真ん中
      const pw = s * 0.95;
      const ph = s * 0.78;
      const x0 = cx - pw / 2;
      const y0 = cy - ph / 2;
      let out = box(x0, y0, x0 + pw, y0 + ph, LIGHT, s * 0.1) + display(x0 + pw * 0.16, y0 + ph * 0.16, x0 + pw * 0.84, y0 + ph * 0.46);
      if (!icon) {
        out += `<path d="${rr(x0 + pw * 0.07, y0 + ph * 0.07, x0 + pw * 0.93, y0 + ph * 0.93, s * 0.06)}" fill="none" stroke="${INK}" stroke-width="${n(W * 0.5)}"/>`;
        for (let k = 0; k < 4; k++) {
          const bx = x0 + pw * (0.2 + k * 0.17);
          out += box(bx, y0 + ph * 0.58, bx + pw * 0.1, y0 + ph * 0.84, PAPER, pw * 0.02, 0.6) + line(bx + pw * 0.05, y0 + ph * 0.64, bx + pw * 0.05, y0 + ph * 0.7, INK, 0.9);
        }
        const ty = y0 + ph + s * 0.3;
        out += cord(`M${n(cx)} ${n(y0 + ph)}C${n(cx)} ${n(ty - s * 0.1)} ${n(cx - s * 0.12)} ${n(ty - s * 0.12)} ${n(cx - s * 0.08)} ${n(ty)}`, W * 2, DARK) +
          box(cx - s * 0.14, ty, cx - s * 0.02, ty + s * 0.1, DEEP, s * 0.02, 0.8);
      }
      return out;
    }
    case "outlet": {
      // コンセント: 角の丸い板に、差し込み口 2 つ。どの口にも縦の穴が 2 つずつ。c は板の真ん中
      const pw = s * 0.62;
      const x0 = cx - pw / 2;
      const y0 = cy - h;
      let out = box(x0, y0, x0 + pw, y0 + s, PAPER, s * 0.12);
      for (const k of [0, 1]) {
        const oy = y0 + s * (0.1 + k * 0.45);
        out += box(x0 + pw * 0.14, oy, x0 + pw * 0.86, oy + s * 0.36, LIGHT, s * 0.1, 0.8);
        for (const side of [-1, 1]) out += `<rect x="${n(cx + side * pw * 0.17 - s * 0.03)}" y="${n(oy + s * 0.09)}" width="${n(s * 0.06)}" height="${n(s * 0.18)}" rx="${n(s * 0.02)}" fill="${INK}"/>`;
      }
      return out;
    }
    case "toolbox": {
      // 道具箱: 床に置いた濃い箱、ふたの線と留め金、上の取っ手。c は箱の下の真ん中
      const bh = s * 0.45;
      return cord(`M${n(cx - s * 0.22)} ${n(cy - bh)}V${n(cy - bh - s * 0.14)}H${n(cx + s * 0.22)}V${n(cy - bh)}`, W * 2.6, MID) +
        box(cx - h, cy - bh, cx + h, cy, DARK, s * 0.07) + line(cx - h + W, cy - bh * 0.62, cx + h - W, cy - bh * 0.62, INK, 0.7) +
        box(cx - s * 0.06, cy - bh * 0.72, cx + s * 0.06, cy - bh * 0.46, LIGHT, s * 0.02, 0.6) + shine(cx - h * 0.8, cy - bh * 0.82, cx - h * 0.45, cy - bh * 0.82, DARK);
    }
    case "check_mark":
      // ✓ の丸: 黒い丸に明るい ✓（確かめた、の印）
      return dot(cx, cy, h * 0.9) +
        `<polyline points="${n(cx - h * 0.42)},${n(cy + h * 0.02)} ${n(cx - h * 0.1)},${n(cy + h * 0.34)} ${n(cx + h * 0.45)},${n(cy - h * 0.32)}" fill="none" stroke="${PAPER}" stroke-width="${n(mark * 1.2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    case "bubble_question":
    case "bubble_check":
    case "think_question":
    case "think_check":
      return ""; // 吹き出しは bubbleSvg で描く
    case "suspended_load": {
      // 上の端から吊った荷: ワイヤー、フック、2 本の吊り具、板を組んだ荷
      const top = Math.max(0, cy - h * 2.2);
      const hy = cy - h * 0.78;
      return line(cx, top, cx, hy - h * 0.18, INK, 1.2) +
        `<path d="M${n(cx)} ${n(hy - h * 0.2)}V${n(hy)}A${n(h * 0.12)} ${n(h * 0.12)} 0 1 1 ${n(cx - h * 0.2)} ${n(hy - h * 0.04)}" fill="none" stroke="${INK}" stroke-width="${n(W * 1.6)}" stroke-linecap="round"/>` +
        line(cx - h * 0.62, cy - h * 0.15, cx, hy + h * 0.1, INK, 1) + line(cx + h * 0.62, cy - h * 0.15, cx, hy + h * 0.1, INK, 1) +
        box(cx - h, cy - h * 0.15, cx + h, cy + h, DARK, s * 0.05) + line(cx - h + W, cy + h * 0.28, cx + h - W, cy + h * 0.28, INK, 0.6) +
        line(cx - h + W, cy + h * 0.62, cx + h - W, cy + h * 0.62, INK, 0.6) + shine(cx - h * 0.78, cy + h * 0.06, cx - h * 0.4, cy + h * 0.06, DARK);
    }
    case "arrow_down":
      // 下向きの矢印: 軸と矢じりを 1 つの形で（印なので太さは大きさに合わせる）
      return path(poly([[cx - h * 0.17, cy - h], [cx + h * 0.17, cy - h], [cx + h * 0.17, cy + h * 0.08], [cx + h * 0.52, cy + h * 0.08], [cx, cy + h], [cx - h * 0.52, cy + h * 0.08], [cx - h * 0.17, cy + h * 0.08]]), INK);
    case "broom": {
      // 箒: 柄の上を手に持ち、穂先は向いている側の下へ。穂先は台形と穂の線
      const bx = X(h * 0.5);
      const by = cy + h * 1.6;
      let out = cord(`M${n(X(-h * 0.06))} ${n(cy - h * 0.35)}L${n(bx)} ${n(by)}`, W * 2.6, MID) +
        path(poly([[bx - h * 0.42, by], [bx + h * 0.42, by], [bx + h * 0.6, by + h * 0.5], [bx - h * 0.6, by + h * 0.5]]), STEEL);
      for (const k of [-0.3, 0, 0.3]) out += line(bx + k * h * 1.05, by + h * 0.12, bx + k * h * 1.3, by + h * 0.44, INK, 0.5);
      return out + box(bx - h * 0.46, by - h * 0.1, bx + h * 0.46, by + h * 0.08, DEEP, h * 0.04, 0.8);
    }
    case "box": {
      // 両手で前に抱える段ボールの箱。手の位置を箱の手前の上の角あたりにする。上のふたの線と、まん中のテープ
      const x0 = cx - (d > 0 ? h * 0.3 : h * 1.7);
      const y0 = cy - h * 0.55;
      return box(x0, y0, x0 + s, y0 + h * 1.1, LIGHT, s * 0.05) + box(x0 + s * 0.44, y0, x0 + s * 0.56, y0 + h * 0.42, MID, 0, 0.6) +
        line(x0 + W, y0 + h * 0.42, x0 + s - W, y0 + h * 0.42, INK, 0.6);
    }
    case "lock": {
      // 錠前: 金属の掛け金の弧、濃い本体、鍵穴（丸と下へ広がる形）
      const sx = h * 0.36;
      return cord(`M${n(cx - sx)} ${n(cy - h * 0.1)}V${n(cy - h * 0.45)}A${n(sx)} ${n(sx)} 0 0 1 ${n(cx + sx)} ${n(cy - h * 0.45)}V${n(cy - h * 0.1)}`, W * 2.8, MID) +
        box(cx - h * 0.62, cy - h * 0.15, cx + h * 0.62, cy + h * 0.85, DARK, h * 0.16) +
        path(`M${n(cx - h * 0.12)} ${n(cy + h * 0.25)}A${n(h * 0.14)} ${n(h * 0.14)} 0 1 1 ${n(cx + h * 0.12)} ${n(cy + h * 0.25)}L${n(cx + h * 0.08)} ${n(cy + h * 0.55)}H${n(cx - h * 0.08)}Z`, PAPER, 0.5) +
        shine(cx - h * 0.46, cy + h * 0.02, cx - h * 0.46, cy + h * 0.34, DARK);
    }
    case "tag":
      // 札: ひもで下げた角の丸い板と、ひもを通す穴。中は × の印（触るな）を図形で描く
      return line(cx, cy - h * 0.9, cx, cy - h * 0.38, INK, 0.8) + box(cx - h * 0.7, cy - h * 0.45, cx + h * 0.7, cy + h * 0.8, PAPER, s * 0.08) +
        ring(cx, cy - h * 0.28, h * 0.07, LIGHT, 0.6) +
        line(cx - h * 0.32, cy - h * 0.02, cx + h * 0.32, cy + h * 0.56, INK, (mark * 0.8) / W) + line(cx + h * 0.32, cy - h * 0.02, cx - h * 0.32, cy + h * 0.56, INK, (mark * 0.8) / W);
    case "clock":
      // 時計: 太い縁と 12 時・3 時・6 時・9 時の目盛りと 2 本の針（短い針は 3 時、長い針は 12 時）
      return ring(cx, cy, h - W, PAPER, 1.6) +
        [0, 1, 2, 3].map((k) => {
          const a = (k * Math.PI) / 2;
          return line(cx + Math.sin(a) * h * 0.6, cy - Math.cos(a) * h * 0.6, cx + Math.sin(a) * h * 0.74, cy - Math.cos(a) * h * 0.74, INK, 0.9);
        }).join("") +
        line(cx, cy, cx, cy - h * 0.55, INK, 1) + line(cx, cy, cx + h * 0.38, cy, INK, 1.3) + dot(cx, cy, W * 1.1);
    case "checklist": {
      // 手元のチェックリスト: 濃い板に紙と上の留め具、3 行の欄。上の 2 行に ✓、下の 1 行は空の四角
      const x0 = cx - h * 0.72;
      const y0 = cy - h;
      let out = box(x0, y0, x0 + h * 1.44, y0 + s, STEEL, s * 0.06) + box(x0 + h * 0.12, y0 + h * 0.16, x0 + h * 1.32, y0 + s - h * 0.1, PAPER, s * 0.02, 0.6) +
        box(cx - h * 0.3, y0 - h * 0.12, cx + h * 0.3, y0 + h * 0.14, DEEP, s * 0.03, 0.8);
      for (let k = 0; k < 3; k++) {
        const ry = y0 + h * (0.55 + k * 0.48);
        const bx = x0 + h * 0.26;
        out += box(bx, ry - h * 0.13, bx + h * 0.26, ry + h * 0.13, PAPER, s * 0.02, 0.5) + line(bx + h * 0.42, ry, x0 + h * 1.16, ry, MID, 0.7);
        if (k < 2) out += `<polyline points="${n(bx + h * 0.04)},${n(ry)} ${n(bx + h * 0.12)},${n(ry + h * 0.1)} ${n(bx + h * 0.32)},${n(ry - h * 0.2)}" fill="none" stroke="${INK}" stroke-width="${n(W * 0.9)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      return out;
    }
    case "prohibit": {
      // 禁止: 赤い円と左上から右下への斜線。下のものが透けるよう中は塗らない。赤はこの部品の中だけ（014）
      const r = h - mark * 0.6;
      return `<g data-part="prohibit"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="none" stroke="${RED}" stroke-width="${n(mark * 1.2)}"/>` +
        `<line x1="${n(cx - r * 0.7)}" y1="${n(cy - r * 0.7)}" x2="${n(cx + r * 0.7)}" y2="${n(cy + r * 0.7)}" stroke="${RED}" stroke-width="${n(mark * 1.2)}"/></g>`;
    }
    case "circle_mark":
      // ○: 正しいやり方の印。太い黒の輪
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(h * 0.8)}" fill="none" stroke="${INK}" stroke-width="${n(mark * 1.5)}"/>`;
    case "cross_mark":
      // ×: まちがったやり方の印。太い黒の 2 本線（赤は禁止の部品だけに使う）
      return line(cx - h * 0.7, cy - h * 0.7, cx + h * 0.7, cy + h * 0.7, INK, (mark * 1.5) / W) + line(cx + h * 0.7, cy - h * 0.7, cx - h * 0.7, cy + h * 0.7, INK, (mark * 1.5) / W);
    case "unwell": {
      // 体の具合が悪い印: 頭の前の上のうず巻きと、頭の後ろの汗の粒 3 つ。c は頭
      const sx = X(h * 0.75);
      const sy = cy - h * 1.05;
      const pts: string[] = [];
      for (let k = 0; k <= 60; k++) {
        const a = (k / 60) * Math.PI * 5;
        const r = (k / 60) * h * 0.5;
        pts.push(`${n(sx + Math.cos(a) * r)},${n(sy + Math.sin(a) * r)}`);
      }
      const drop = (x: number, y: number, r: number) =>
        path(`M${n(x)} ${n(y - r * 1.8)}Q${n(x + r * 1.1)} ${n(y - r * 0.2)} ${n(x)} ${n(y + r)}Q${n(x - r * 1.1)} ${n(y - r * 0.2)} ${n(x)} ${n(y - r * 1.8)}Z`, LIGHT, 0.7);
      return `<polyline points="${pts.join(" ")}" fill="none" stroke="${INK}" stroke-width="${n(W)}" stroke-linecap="round"/>` +
        drop(X(-h * 0.85), cy - h * 0.55, h * 0.13) + drop(X(-h * 1.05), cy - h * 0.1, h * 0.11) + drop(X(-h * 0.8), cy + h * 0.3, h * 0.1);
    }
    case "span_arrow":
      // 幅の矢印: 左右の両方へ向く矢じりと、端の縦の線。c は真ん中、長さは size
      return line(cx - h * 0.8, cy, cx + h * 0.8, cy, INK, 1.3) +
        path(poly([[cx - h, cy], [cx - h * 0.74, cy - h * 0.16], [cx - h * 0.74, cy + h * 0.16]]), INK, 0.6) +
        path(poly([[cx + h, cy], [cx + h * 0.74, cy - h * 0.16], [cx + h * 0.74, cy + h * 0.16]]), INK, 0.6) +
        line(cx - h, cy - h * 0.28, cx - h, cy + h * 0.28, INK, 1) + line(cx + h, cy - h * 0.28, cx + h, cy + h * 0.28, INK, 1);
    case "edge":
      // 床の端: c から右は床が無く、下へ暗い穴が続く（足を踏み外すと落ちる）。c は床の端の角
      return `<rect x="${n(cx)}" y="${n(cy - W * 0.5)}" width="${n(s * 20)}" height="${n(s * 20)}" fill="${DEEP}"/>` + line(cx, cy, cx, cy + s * 20, INK, 1.6) +
        line(cx - s * 0.4, cy, cx, cy, INK, 1.6);
    case "anchor_line":
      return ""; // 天井までの長さが要るので propsSvg で描く
    case "trash_bin": {
      // ごみ箱: 下の狭い台形の箱と、ふたとつまみと、縦の筋 2 本。c は箱の下の真ん中
      const bh = s * 0.88;
      const lid = s * 0.12;
      let out = path(`M${n(cx - h * 0.8)} ${n(cy - bh)}L${n(cx + h * 0.8)} ${n(cy - bh)}L${n(cx + h * 0.62)} ${n(cy)}L${n(cx - h * 0.62)} ${n(cy)}Z`, MID);
      for (const k of [-1, 1]) out += line(cx + k * h * 0.28, cy - bh * 0.8, cx + k * h * 0.22, cy - bh * 0.15, INK, 0.6);
      return out + shine(cx - h * 0.62, cy - bh * 0.8, cx - h * 0.55, cy - bh * 0.4, MID) +
        box(cx - h * 0.16, cy - bh - lid * 1.7, cx + h * 0.16, cy - bh - lid * 0.6, DARK, lid * 0.3, 0.8) + box(cx - h * 0.92, cy - bh - lid, cx + h * 0.92, cy - bh + lid * 0.1, DARK, lid * 0.35);
    }
    case "cone": {
      // カラーコーン: 濃い台、上の細い円すい、明るい帯 2 本。塗り → 帯 → 縁の順で、帯が縁の線を隠さない。c は下の真ん中
      const yb = cy - s * 0.1;
      const yt = cy - s * 0.95;
      const at = (f: number): [number, number] => [s * (0.06 + (0.31 - 0.06) * f), yt + (yb - yt) * f];
      const body = `M${n(cx - s * 0.31)} ${n(yb)}L${n(cx - s * 0.06)} ${n(yt + s * 0.03)}Q${n(cx)} ${n(yt - s * 0.02)} ${n(cx + s * 0.06)} ${n(yt + s * 0.03)}L${n(cx + s * 0.31)} ${n(yb)}Z`;
      const band = (f1: number, f2: number) => {
        const [a1, y1] = at(f1);
        const [a2, y2] = at(f2);
        return `<path d="${poly([[cx - a1, y1], [cx + a1, y1], [cx + a2, y2], [cx - a2, y2]])}" fill="${PAPER}"/>`;
      };
      return box(cx - s * 0.45, cy - s * 0.12, cx + s * 0.45, cy, DEEP, s * 0.03) +
        `<path d="${body}" fill="${STEEL}"/>` + band(0.26, 0.42) + band(0.6, 0.76) + `<path d="${body}" fill="none" ${sw()}/>`;
    }
    case "barrier": {
      // 立入禁止のバー: 横の板に斜めの縞 3 本、両はしの足と床の台。c は下の真ん中
      const y0 = cy - s * 0.78;
      const y1 = cy - s * 0.52;
      const legs = [-1, 1].map((k) => cord(`M${n(cx + k * s * 0.36)} ${n(y1)}L${n(cx + k * s * 0.42)} ${n(cy - s * 0.05)}`, W * 2.8, DARK) + box(cx + k * s * 0.42 - s * 0.09, cy - s * 0.06, cx + k * s * 0.42 + s * 0.09, cy, DEEP, s * 0.02, 0.8)).join("");
      const bd = rr(cx - h, y0, cx + h, y1, s * 0.04);
      const sk = (y1 - y0) * 0.7;
      const stripes = [-0.3, 0, 0.3].map((f) => {
        const x = cx + f * s;
        return `<path d="${poly([[x - s * 0.06 + sk / 2, y0 + W * 0.5], [x + s * 0.06 + sk / 2, y0 + W * 0.5], [x + s * 0.06 - sk / 2, y1 - W * 0.5], [x - s * 0.06 - sk / 2, y1 - W * 0.5]])}" fill="${DEEP}"/>`;
      }).join("");
      return legs + `<path d="${bd}" fill="${PAPER}"/>` + stripes + `<path d="${bd}" fill="none" ${sw()}/>`;
    }
    case "ladder": {
      // はしご: 2 本の柱と 5 段の踏みさん、足の台。踏みさんを先に描き、柱でその端を隠す。c は下の真ん中
      const top = cy - s;
      let out = "";
      for (let k = 1; k <= 5; k++) {
        const y = cy - (s * k) / 6;
        out += cord(`M${n(cx - s * 0.17)} ${n(y)}H${n(cx + s * 0.17)}`, W * 2.2, STEEL);
      }
      for (const k of [-1, 1]) out += cord(`M${n(cx + k * s * 0.17)} ${n(cy - W)}V${n(top)}`, W * 2.8, MID) + box(cx + k * s * 0.17 - s * 0.05, cy - s * 0.04, cx + k * s * 0.17 + s * 0.05, cy, DEEP, s * 0.015, 0.7);
      return out;
    }
    case "stepladder": {
      // 脚立（横から）: A の形の 2 本の足、前の足に 3 つの踏み台、間の開き止め、上の天板。c は下の真ん中
      const ay = cy - s * 0.92;
      const fx = X(s * 0.3);
      const bx = X(-s * 0.3);
      let out = line(X(-s * 0.16), cy - s * 0.4, X(s * 0.16), cy - s * 0.4, INK, 0.8) +
        cord(`M${n(cx)} ${n(ay)}L${n(bx)} ${n(cy - W)}`, W * 2.8, STEEL) + cord(`M${n(cx)} ${n(ay)}L${n(fx)} ${n(cy - W)}`, W * 2.8, MID);
      for (const f of [0.28, 0.52, 0.76]) {
        const px = cx + (fx - cx) * f;
        const py = ay + (cy - ay) * f;
        out += box(px - d * s * 0.15, py - s * 0.025, px + d * s * 0.03, py + s * 0.025, STEEL, s * 0.01, 0.7);
      }
      return out + box(X(-s * 0.1), ay - s * 0.06, X(s * 0.1), ay + s * 0.02, DARK, s * 0.02);
    }
    case "fire_extinguisher": {
      // 消火器: 濃い胴、明るい札、上の弁とレバー、前へ垂れるホースとノズル、胴のつや。c は下の真ん中
      const x1 = cx - s * 0.2;
      const x2 = cx + s * 0.2;
      const y0 = cy - s * 0.78;
      return box(cx - s * 0.06, y0 - s * 0.1, cx + s * 0.06, y0 + s * 0.02, DEEP, s * 0.02, 0.8) +
        line(X(-s * 0.02), y0 - s * 0.1, X(-s * 0.2), y0 - s * 0.16, INK, 1.6) +
        box(x1, y0, x2, cy, DARK, s * 0.16) + box(cx - s * 0.13, y0 + s * 0.22, cx + s * 0.13, y0 + s * 0.46, PAPER, s * 0.03, 0.7) +
        line(cx - s * 0.07, y0 + s * 0.34, cx + s * 0.07, y0 + s * 0.34, INK, 0.6) +
        shine(cx - s * 0.13, y0 + s * 0.08, cx - s * 0.13, y0 + s * 0.17, DARK) +
        cord(`M${n(X(s * 0.06))} ${n(y0 - s * 0.04)}C${n(X(s * 0.34))} ${n(y0)} ${n(X(s * 0.32))} ${n(cy - s * 0.34)} ${n(X(s * 0.26))} ${n(cy - s * 0.22)}`, W * 2.2, DEEP) +
        box(X(s * 0.2), cy - s * 0.24, X(s * 0.31), cy - s * 0.12, COAL, s * 0.02, 0.8);
    }
    case "first_aid": {
      // 救急箱: 明るい箱と上の取っ手、まん中の十字（赤は使えないので濃い灰）。c は箱の真ん中
      const y0 = cy - s * 0.32;
      const q = s * 0.08;
      return cord(`M${n(cx - s * 0.16)} ${n(y0)}V${n(y0 - s * 0.12)}H${n(cx + s * 0.16)}V${n(y0)}`, W * 2.4, DARK) +
        box(cx - h, y0, cx + h, cy + s * 0.36, PAPER, s * 0.08) + line(cx - h + W, y0 + s * 0.14, cx + h - W, y0 + s * 0.14, INK, 0.6) +
        path(poly([[cx - q, cy - q * 2.2], [cx + q, cy - q * 2.2], [cx + q, cy - q * 0.2], [cx + q * 3, cy - q * 0.2], [cx + q * 3, cy + q * 1.8], [cx + q, cy + q * 1.8], [cx + q, cy + q * 3.8], [cx - q, cy + q * 3.8], [cx - q, cy + q * 1.8], [cx - q * 3, cy + q * 1.8], [cx - q * 3, cy - q * 0.2], [cx - q, cy - q * 0.2]]), DEEP, 0.7);
    }
    case "gloves": {
      // 手袋: 着けたときは手の丸を覆う灰の丸と、向いている側の親指。持つ・置くときは指 4 本と親指と濃い袖口の形。c は手
      if (worn) return merge([[circ(cx, cy, s * 0.3), MID], [circ(X(s * 0.22), cy - s * 0.2, s * 0.13), MID]]);
      const fing = [-0.21, -0.07, 0.07, 0.21].map((f, i): [string, string] => [rr(cx + f * s - s * 0.065, cy - s * (0.48 - (i === 0 || i === 3 ? 0.06 : 0)), cx + f * s + s * 0.065, cy, s * 0.065), MID]);
      // 親指は手のひらの横から斜め上へのびる細い形（先は丸）
      const thumb = `M${n(X(s * 0.16))} ${n(cy + s * 0.18)}L${n(X(s * 0.38))} ${n(cy - s * 0.1)}A${n(s * 0.065)} ${n(s * 0.065)} 0 0 ${d > 0 ? 1 : 0} ${n(X(s * 0.47))} ${n(cy - s * 0.02)}L${n(X(s * 0.26))} ${n(cy + s * 0.22)}Z`;
      return merge([...fing, [rr(cx - s * 0.28, cy - s * 0.18, cx + s * 0.28, cy + s * 0.22, s * 0.12), MID], [thumb, MID]]) +
        box(cx - s * 0.26, cy + s * 0.2, cx + s * 0.26, cy + s * 0.42, DARK, s * 0.04);
    }
    case "goggles": {
      // 保護めがね: 着けたときは目の前の明るいレンズと、頭の後ろへ回るバンド（横から）。持つ・置くときは正面の 2 つのレンズ。レンズにつや
      if (worn) {
        const r = s / 2.5; // かぶり物と同じく、s は頭の半径の 2.5 倍
        const lx = X(r * 0.52);
        const ly = cy + r * 0.1;
        return cord(`M${n(X(r * 0.2))} ${n(ly - r * 0.05)}Q${n(X(-r * 0.5))} ${n(ly - r * 0.25)} ${n(X(-r * 0.98))} ${n(ly - r * 0.15)}`, W * 2.4, DARK) +
          box(lx - r * 0.34, ly - r * 0.24, lx + r * 0.34, ly + r * 0.22, LIGHT, r * 0.14) + shine(lx - r * 0.14, ly - r * 0.1, lx + r * 0.04, ly - r * 0.1, LIGHT);
      }
      return cord(`M${n(cx - h * 0.95)} ${n(cy)}H${n(cx + h * 0.95)}`, W * 2.4, DARK) +
        merge([[rr(cx - h * 0.82, cy - h * 0.32, cx - h * 0.06, cy + h * 0.3, h * 0.2), LIGHT], [rr(cx + h * 0.06, cy - h * 0.32, cx + h * 0.82, cy + h * 0.3, h * 0.2), LIGHT], [rr(cx - h * 0.14, cy - h * 0.2, cx + h * 0.14, cy - h * 0.04, h * 0.05), LIGHT]]) +
        shine(cx - h * 0.6, cy - h * 0.12, cx - h * 0.36, cy - h * 0.12, LIGHT) + shine(cx + h * 0.28, cy - h * 0.12, cx + h * 0.52, cy - h * 0.12, LIGHT);
    }
    case "knife": {
      // 包丁: 手に持つ濃い柄と鋲 2 つ、明るい刃（背はまっすぐ、刃先は切っ先へ上がる）、刃のつや。c は柄の真ん中
      const y0 = cy - h * 0.24;
      const y1 = cy + h * 0.22;
      return path(`M${n(X(h * 0.35))} ${n(y0)}L${n(X(h * 1.55))} ${n(y0)}Q${n(X(h * 1.75))} ${n(y0 + h * 0.02)} ${n(X(h * 1.78))} ${n(y0 + h * 0.06)}Q${n(X(h * 1.45))} ${n(y1)} ${n(X(h * 0.6))} ${n(y1)}L${n(X(h * 0.35))} ${n(y1 - h * 0.04)}Z`, LIGHT) +
        shine(X(h * 0.55), y0 + h * 0.12, X(h * 1.35), y0 + h * 0.12, LIGHT) +
        box(X(-h * 0.5), cy - h * 0.15, X(h * 0.3), cy + h * 0.15, COAL, h * 0.14) + box(X(h * 0.26), cy - h * 0.2, X(h * 0.4), cy + h * 0.2, STEEL, h * 0.04, 0.7) +
        dot(X(-h * 0.25), cy, h * 0.045, MID) + dot(X(h * 0.05), cy, h * 0.045, MID);
    }
    case "hot_pot": {
      // 熱い鍋: 濃い胴と両はしの取っ手、縁、ふたとつまみ、上へのぼる湯気 3 本。c は下の真ん中
      const y0 = cy - s * 0.42;
      let out = "";
      for (const k of [-1, 0, 1]) {
        const x = cx + k * s * 0.2;
        out += `<path d="M${n(x)} ${n(y0 - s * 0.24)}Q${n(x + s * 0.06)} ${n(y0 - s * 0.32)} ${n(x)} ${n(y0 - s * 0.4)}Q${n(x - s * 0.06)} ${n(y0 - s * 0.48)} ${n(x)} ${n(y0 - s * 0.56)}" fill="none" stroke="${MID}" stroke-width="${n(W * 1.2)}" stroke-linecap="round"/>`;
      }
      return out + [-1, 1].map((k) => box(cx + k * s * 0.4, y0 + s * 0.04, cx + k * s * 0.5, y0 + s * 0.12, DEEP, s * 0.03, 0.8)).join("") +
        box(cx - s * 0.4, y0, cx + s * 0.4, cy, DARK, s * 0.08) + shine(cx - s * 0.32, y0 + s * 0.14, cx - s * 0.32, y0 + s * 0.26, DARK) +
        path(`M${n(cx - s * 0.42)} ${n(y0 + s * 0.02)}Q${n(cx)} ${n(y0 - s * 0.18)} ${n(cx + s * 0.42)} ${n(y0 + s * 0.02)}Z`, STEEL) +
        box(cx - s * 0.06, y0 - s * 0.16, cx + s * 0.06, y0 - s * 0.07, DEEP, s * 0.03, 0.8);
    }
    case "cart": {
      // 台車: 平らな荷台、後ろ（向きと逆の側）の取っ手、黒い車輪 2 つと明るい軸。c は下の真ん中
      const py = cy - s * 0.24;
      return cord(`M${n(X(-s * 0.44))} ${n(py)}L${n(X(-s * 0.48))} ${n(cy - s * 0.9)}L${n(X(-s * 0.36))} ${n(cy - s * 0.94)}`, W * 2.8, MID) +
        [-0.34, 0.34].map((f) => ring(cx + f * s, cy - s * 0.09, s * 0.085, COAL) + dot(cx + f * s, cy - s * 0.09, s * 0.03, MID)).join("") +
        box(cx - h, py - s * 0.05, cx + h, py + s * 0.06, STEEL, s * 0.03);
    }
    case "forklift": {
      // フォークリフト（横から、向いている側に爪）: 胴と後ろの重り、屋根の柱と屋根、座席、前の柱と爪、大小の車輪。c は下の真ん中
      const wheel = (x: number, r: number) => ring(x, cy - r, r, COAL) + dot(x, cy - r, r * 0.38, MID);
      return [-0.33, 0.14].map((f) => cord(`M${n(X(f * s))} ${n(cy - s * 0.4)}L${n(X((f + 0.02) * s))} ${n(cy - s * 0.92)}`, W * 2.4, DARK)).join("") +
        box(X(-s * 0.42), cy - s * 0.98, X(s * 0.22), cy - s * 0.9, DARK, s * 0.03) +
        box(X(s * 0.3), cy - s * 1.0, X(s * 0.38), cy - s * 0.06, DARK, s * 0.02) +
        box(X(s * 0.38), cy - s * 0.46, X(s * 0.44), cy - s * 0.06, DEEP, s * 0.01, 0.8) + box(X(s * 0.38), cy - s * 0.1, X(s * 0.78), cy - s * 0.04, DEEP, s * 0.01, 0.8) +
        path(`M${n(X(-s * 0.56))} ${n(cy - s * 0.14)}V${n(cy - s * 0.38)}Q${n(X(-s * 0.56))} ${n(cy - s * 0.46)} ${n(X(-s * 0.46))} ${n(cy - s * 0.46)}H${n(X(-s * 0.08))}L${n(X(s * 0.06))} ${n(cy - s * 0.36)}H${n(X(s * 0.28))}V${n(cy - s * 0.14)}Z`, STEEL) +
        box(X(-s * 0.3), cy - s * 0.58, X(-s * 0.16), cy - s * 0.44, DEEP, s * 0.03, 0.8) + shine(X(-s * 0.5), cy - s * 0.36, X(-s * 0.5), cy - s * 0.24, STEEL) +
        wheel(X(-s * 0.36), s * 0.13) + wheel(X(s * 0.12), s * 0.12);
    }
    case "spill": {
      // こぼれた水・油: 床に広がる平たい水たまりと、つやの短い弧、そばの小さい粒 2 つ。c は水たまりの真ん中
      const k = [1, 0.82, 1.06, 0.9, 1, 0.78, 1.1, 0.92];
      const pt = (i: number): Pt => {
        const a = (i / k.length) * Math.PI * 2;
        return [cx + Math.cos(a) * h * k[i % k.length], cy + Math.sin(a) * h * 0.3 * k[i % k.length]];
      };
      let dd = "";
      for (let i = 0; i < k.length; i++) {
        const [x1, y1] = pt(i);
        const [x2, y2] = pt(i + 1);
        const m = [(x1 + x2) / 2, (y1 + y2) / 2];
        dd += i === 0 ? `M${n(m[0])} ${n(m[1])}` : `Q${n(x1)} ${n(y1)} ${n(m[0])} ${n(m[1])}`;
      }
      const [x0, y0] = pt(0);
      const [xa, ya] = pt(1);
      dd += `Q${n(x0)} ${n(y0)} ${n((x0 + xa) / 2)} ${n((y0 + ya) / 2)}Z`;
      return path(dd, LIGHT) + `<path d="M${n(cx - h * 0.5)} ${n(cy - h * 0.04)}Q${n(cx - h * 0.3)} ${n(cy - h * 0.16)} ${n(cx)} ${n(cy - h * 0.14)}" fill="none" stroke="${PAPER}" stroke-width="${n(W)}" stroke-linecap="round"/>` +
        ring(X(h * 1.15), cy - h * 0.12, h * 0.07, LIGHT, 0.7) + ring(X(h * 1.32), cy + h * 0.06, h * 0.05, LIGHT, 0.7);
    }
    case "bucket": {
      // バケツ: 下の狭い灰の胴と濃い縁、上の弧の取っ手、胴のつや。c は下の真ん中
      const y0 = cy - s * 0.6;
      return `<path d="M${n(cx - s * 0.36)} ${n(y0)}Q${n(cx)} ${n(y0 - s * 0.6)} ${n(cx + s * 0.36)} ${n(y0)}" fill="none" stroke="${INK}" stroke-width="${n(W * 1.2)}" stroke-linecap="round"/>` +
        path(`M${n(cx - s * 0.34)} ${n(y0)}H${n(cx + s * 0.34)}L${n(cx + s * 0.27)} ${n(cy - s * 0.04)}Q${n(cx + s * 0.26)} ${n(cy)} ${n(cx + s * 0.22)} ${n(cy)}H${n(cx - s * 0.22)}Q${n(cx - s * 0.26)} ${n(cy)} ${n(cx - s * 0.27)} ${n(cy - s * 0.04)}Z`, MID) +
        line(cx - s * 0.3, y0 + s * 0.2, cx + s * 0.3, y0 + s * 0.2, INK, 0.5) + shine(cx - s * 0.24, y0 + s * 0.3, cx - s * 0.21, y0 + s * 0.48, MID) +
        box(cx - s * 0.38, y0 - s * 0.04, cx + s * 0.38, y0 + s * 0.04, STEEL, s * 0.03);
    }
    case "mop": {
      // モップ: 柄の上を手に持ち、先は向いている側の下へ。先は濃い留め具と、明るい房（下の端が波）
      const bx = X(h * 0.55);
      const by = cy + h * 1.55;
      let fr = `M${n(bx - h * 0.45)} ${n(by)}H${n(bx + h * 0.45)}V${n(by + h * 0.4)}`;
      for (let k = 0; k < 4; k++) fr += `Q${n(bx + h * (0.45 - k * 0.225 - 0.11))} ${n(by + h * 0.62)} ${n(bx + h * (0.45 - (k + 1) * 0.225))} ${n(by + h * 0.4)}`;
      let out = cord(`M${n(X(-h * 0.06))} ${n(cy - h * 0.35)}L${n(bx)} ${n(by)}`, W * 2.6, MID) + path(`${fr}Z`, LIGHT);
      for (const k of [-0.22, 0, 0.22]) out += line(bx + k * h, by + h * 0.1, bx + k * h, by + h * 0.38, INK, 0.5);
      return out + box(bx - h * 0.3, by - h * 0.12, bx + h * 0.3, by + h * 0.06, DEEP, h * 0.04, 0.8);
    }
    case "chemical": {
      // 薬品の容器: 肩の付いた明るい胴、後ろの取っ手の輪、前の濃いふた、危ないの印（ひし形と「！」の線と点）の札。c は下の真ん中
      const y0 = cy - s * 0.78;
      return cord(`M${n(X(-s * 0.2))} ${n(y0 + s * 0.16)}Q${n(X(-s * 0.36))} ${n(y0 + s * 0.02)} ${n(X(-s * 0.18))} ${n(y0 - s * 0.02)}`, W * 2.6, LIGHT) +
        box(X(s * 0.06), y0 - s * 0.12, X(s * 0.2), y0 + s * 0.04, DEEP, s * 0.02, 0.8) +
        path(`M${n(cx - s * 0.3)} ${n(cy - s * 0.04)}V${n(y0 + s * 0.2)}Q${n(cx - s * 0.3)} ${n(y0 + s * 0.06)} ${n(cx - s * 0.16)} ${n(y0)}H${n(cx + s * 0.16)}Q${n(cx + s * 0.3)} ${n(y0 + s * 0.06)} ${n(cx + s * 0.3)} ${n(y0 + s * 0.2)}V${n(cy - s * 0.04)}Q${n(cx + s * 0.3)} ${n(cy)} ${n(cx + s * 0.26)} ${n(cy)}H${n(cx - s * 0.26)}Q${n(cx - s * 0.3)} ${n(cy)} ${n(cx - s * 0.3)} ${n(cy - s * 0.04)}Z`, LIGHT) +
        box(cx - s * 0.2, cy - s * 0.52, cx + s * 0.2, cy - s * 0.12, PAPER, s * 0.03, 0.7) +
        path(poly([[cx, cy - s * 0.48], [cx + s * 0.16, cy - s * 0.32], [cx, cy - s * 0.16], [cx - s * 0.16, cy - s * 0.32]]), PAPER, 0.8) +
        line(cx, cy - s * 0.4, cx, cy - s * 0.3, INK, 0.9) + dot(cx, cy - s * 0.24, W * 0.55);
    }
    case "gas_cylinder": {
      // ガスのボンベ: 丸い肩の細長い胴と濃い台の輪、肩の帯、上の弁と握り、胴のつや。c は下の真ん中
      const y0 = cy - s * 0.86;
      return box(cx - s * 0.05, y0 - s * 0.1, cx + s * 0.05, y0 + s * 0.04, DEEP, s * 0.015, 0.8) + box(cx - s * 0.12, y0 - s * 0.14, cx + s * 0.12, y0 - s * 0.08, DARK, s * 0.03, 0.8) +
        box(cx - s * 0.21, y0, cx + s * 0.21, cy - s * 0.03, STEEL, s * 0.2) + line(cx - s * 0.2 + W * 0.5, y0 + s * 0.26, cx + s * 0.2 - W * 0.5, y0 + s * 0.26, INK, 0.6) +
        shine(cx - s * 0.12, y0 + s * 0.34, cx - s * 0.12, y0 + s * 0.58, STEEL) + box(cx - s * 0.2, cy - s * 0.07, cx + s * 0.2, cy, DEEP, s * 0.02, 0.8);
    }
    case "hammer": {
      // 金づち: 手に持つ木の柄（上へのびる）と、柄の上の濃い頭（打つ面は向いている側）。c は柄を握るところ
      const hy = cy - h * 1.15;
      return cord(`M${n(cx)} ${n(cy + h * 0.35)}V${n(hy)}`, W * 3.4, MID) +
        box(X(-h * 0.42), hy - h * 0.2, X(h * 0.5), hy + h * 0.18, DARK, h * 0.06) + box(X(h * 0.46), hy - h * 0.24, X(h * 0.66), hy + h * 0.22, DEEP, h * 0.05, 0.8) +
        shine(X(-h * 0.28), hy - h * 0.08, X(h * 0.2), hy - h * 0.08, DARK);
    }
    case "wrench": {
      // スパナ: 手に持つ明るい軸、向いている側の開いた口、後ろの輪（穴は抜く）。重なりは 2 回描きでひと続きに。c は軸の握るところ
      const jx = X(h * 0.95);
      const R = h * 0.3;
      const ri = h * 0.15;
      const a = (34 * Math.PI) / 180;
      const op = (r: number, sg: number): string => `${n(jx + d * r * Math.cos(a))} ${n(cy - sg * r * Math.sin(a))}`;
      const f0 = d > 0 ? 0 : 1;
      const jaw = `M${op(R, 1)}A${n(R)} ${n(R)} 0 1 ${f0} ${op(R, -1)}L${op(ri, -1)}A${n(ri)} ${n(ri)} 0 1 ${1 - f0} ${op(ri, 1)}Z`;
      const ex = X(-h * 0.75);
      const ringD = `${circ(ex, cy, h * 0.26)}${circ(ex, cy, h * 0.11)}`;
      return merge([[rr(X(-h * 0.7), cy - h * 0.13, X(h * 0.8), cy + h * 0.13, h * 0.13), LIGHT], [jaw, LIGHT], [ringD, LIGHT]], ` fill-rule="evenodd"`) +
        shine(X(-h * 0.35), cy - h * 0.03, X(h * 0.4), cy - h * 0.03, LIGHT);
    }
    case "grinder": {
      // ディスクグラインダー: 手に持つ濃い胴と握りの筋、前の頭、下の明るい円盤と後ろ半分の覆い、前の下へ飛ぶ火花。c は胴を握るところ
      const gx = X(h * 0.98);
      const gy = cy + h * 0.52;
      const R = h * 0.44;
      let out = "";
      for (const [a, l] of [[20, 0.28], [45, 0.36], [70, 0.24]] as [number, number][]) {
        const r = (a * Math.PI) / 180;
        const x1 = gx + d * Math.cos(r) * (R + h * 0.1);
        const y1 = gy + Math.sin(r) * (R + h * 0.1);
        out += line(x1, y1, x1 + d * Math.cos(r) * h * l, y1 + Math.sin(r) * h * l, STEEL, 0.9);
      }
      const f = d > 0 ? 0 : 1;
      return out + box(X(-h * 0.55), cy - h * 0.21, X(h * 0.9), cy + h * 0.21, DARK, h * 0.21) +
        [-0.3, -0.15].map((k) => line(X(k * h), cy - h * 0.13, X(k * h), cy + h * 0.13, DEEP, 0.7)).join("") +
        box(X(h * 0.78), cy - h * 0.3, X(h * 1.16), cy + h * 0.2, DEEP, h * 0.08) +
        ring(gx, gy, R, LIGHT) + path(`M${n(gx)} ${n(gy - R - W)}A${n(R + W)} ${n(R + W)} 0 0 ${f} ${n(gx)} ${n(gy + R + W)}Z`, STEEL) + dot(gx, gy, h * 0.07, DEEP) +
        shine(X(-h * 0.35), cy - h * 0.1, X(h * 0.4), cy - h * 0.1, DARK);
    }
    case "gear": {
      // 回る機械（巻き込まれ）: 歯 8 つの灰の歯車と明るい軸、外を回る矢印。c は歯車の真ん中
      const pts: Pt[] = [];
      for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * Math.PI * 2;
        for (const [da, r] of [[-0.2, 0.3], [-0.12, 0.4], [0.12, 0.4], [0.2, 0.3]] as [number, number][]) pts.push([cx + Math.cos(a0 + da) * s * r, cy + Math.sin(a0 + da) * s * r]);
      }
      const ar = s * 0.48;
      const a1 = (-150 * Math.PI) / 180;
      const a2 = (-30 * Math.PI) / 180;
      const tip: Pt = [cx + Math.cos(a2) * ar, cy + Math.sin(a2) * ar];
      const hd = s * 0.09;
      return path(poly(pts), MID) + ring(cx, cy, s * 0.13, PAPER) + dot(cx, cy, s * 0.04) +
        `<path d="M${n(cx + Math.cos(a1) * ar)} ${n(cy + Math.sin(a1) * ar)}A${n(ar)} ${n(ar)} 0 0 1 ${n(tip[0] - hd * 0.5)} ${n(tip[1] - hd * 0.6)}" fill="none" stroke="${INK}" stroke-width="${n(W * 1.4)}" stroke-linecap="round"/>` +
        path(poly([[tip[0] + hd * 0.6, tip[1] + hd * 0.2], [tip[0] - hd * 1.2, tip[1] - hd * 0.1], [tip[0] - hd * 0.1, tip[1] - hd * 1.5]]), INK, 0.6);
    }
    case "sun": {
      // 暑さ（日差し）: 明るい灰の丸と 8 本の光の線。c は丸の真ん中
      let out = "";
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        out += line(cx + Math.cos(a) * s * 0.34, cy + Math.sin(a) * s * 0.34, cx + Math.cos(a) * s * 0.48, cy + Math.sin(a) * s * 0.48, INK, 1.4);
      }
      return out + ring(cx, cy, s * 0.25, LIGHT) + shine(cx - s * 0.14, cy - s * 0.08, cx - s * 0.06, cy - s * 0.16, LIGHT);
    }
    case "water_bottle": {
      // 水の入れ物（水分を取る）: 手に持つ明るい胴、濃いふた、札に雫の形、胴のつや。c は胴の真ん中
      const y0 = cy - h * 0.62;
      const y1 = cy + h * 0.62;
      return box(cx - h * 0.14, y0 - h * 0.28, cx + h * 0.14, y0 + h * 0.02, DEEP, h * 0.05, 0.8) +
        box(cx - h * 0.24, y0, cx + h * 0.24, y1, LIGHT, h * 0.12) + box(cx - h * 0.24, cy - h * 0.12, cx + h * 0.24, cy + h * 0.3, PAPER, 0, 0.6) +
        path(`M${n(cx)} ${n(cy - h * 0.04)}Q${n(cx + h * 0.1)} ${n(cy + h * 0.1)} ${n(cx)} ${n(cy + h * 0.2)}Q${n(cx - h * 0.1)} ${n(cy + h * 0.1)} ${n(cx)} ${n(cy - h * 0.04)}Z`, MID, 0.5) +
        shine(cx - h * 0.12, y0 + h * 0.12, cx - h * 0.12, y0 + h * 0.36, LIGHT);
    }
    case "faucet": {
      // 手洗いの蛇口: 壁の台、前へのびて下へ曲がる管、上の濃い取っ手、管の先から落ちる水の線と粒。c は壁の台
      const ex = X(h * 0.9);
      let out = cord(`M${n(cx)} ${n(cy)}H${n(ex - d * h * 0.1)}Q${n(ex)} ${n(cy)} ${n(ex)} ${n(cy + h * 0.15)}V${n(cy + h * 0.32)}`, W * 3.4, MID) +
        box(X(h * 0.32), cy - h * 0.42, X(h * 0.52), cy - h * 0.08, DARK, h * 0.05, 0.8) + box(X(h * 0.18), cy - h * 0.5, X(h * 0.66), cy - h * 0.38, DARK, h * 0.05, 0.8) +
        box(X(-h * 0.12), cy - h * 0.3, X(h * 0.08), cy + h * 0.3, STEEL, h * 0.05);
      for (const k of [-0.08, 0.08]) out += line(ex + k * h, cy + h * 0.5, ex + k * h, cy + h * 1.0, MID, 1.1);
      return out + path(`M${n(ex)} ${n(cy + h * 1.12)}Q${n(ex + h * 0.08)} ${n(cy + h * 1.26)} ${n(ex)} ${n(cy + h * 1.32)}Q${n(ex - h * 0.08)} ${n(cy + h * 1.26)} ${n(ex)} ${n(cy + h * 1.12)}Z`, LIGHT, 0.6);
    }
    case "radio": {
      // 無線機: 手に持つ濃い縦の箱、後ろの上の角から立つアンテナ、明るい表示、話す穴の線、上のつまみ。c は箱の真ん中
      const y0 = cy - h * 0.55;
      const y1 = cy + h * 0.55;
      return cord(`M${n(X(-h * 0.14))} ${n(y0)}V${n(y0 - h * 0.62)}`, W * 2.6, DARK) + box(X(h * 0.06), y0 - h * 0.16, X(h * 0.2), y0 + h * 0.02, DARK, h * 0.04, 0.8) +
        box(cx - h * 0.3, y0, cx + h * 0.3, y1, DEEP, h * 0.12) + box(cx - h * 0.2, y0 + h * 0.14, cx + h * 0.2, y0 + h * 0.42, LIGHT, h * 0.04, 0.6) +
        [0.6, 0.76, 0.92].map((f) => line(cx - h * 0.16, y0 + h * f, cx + h * 0.16, y0 + h * f, STEEL, 0.8)).join("") +
        shine(X(-h * 0.2), y0 + h * 0.56, X(-h * 0.2), y0 + h * 0.9, DEEP);
    }
  }
}

/** かぶり物と保護めがねは頭に付けたとき、手袋は手に付けたとき、size ではなく頭・手の大きさに合わせる */
const HEADWEAR = new Set<PropKind>(["helmet", "helmet_new", "cap_lead", "goggles"]);
const HANDWEAR = new Set<PropKind>(["gloves"]);

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
  // 縁は人や小物と同じ太さ（大きさでは変えない）
  const w = lineWidth(size);
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
  // 中の道具は細い縁で描き、床に置く道具は箱の真ん中に来るよう下へずらす
  const is = bh * 0.62;
  const icon = inner ? shape(inner, [cx - bw * 0.18, cy + (ON_FLOOR.has(inner) ? is * 0.45 : 0)], is, 1, { W: w * 0.7, icon: true }) : "";
  return `<g data-part="bubble">${tail}${box}${icon}${mark}</g>`;
}

export function propsSvg(props: PropSpec[], posed: Posed[], size: number): string {
  const W = lineWidth(size);
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
      const onHead = HEADWEAR.has(p.kind) && "figure" in p.at && p.at.joint === "head";
      const onHand = HANDWEAR.has(p.kind) && "figure" in p.at && p.at.joint.startsWith("hand");
      const s = onHead ? posed[(p.at as { figure: number }).figure].h * PROPORTION.head * 2.5
        : onHand ? posed[(p.at as { figure: number }).figure].h * PROPORTION.hand * 3.6
        : p.size * size;
      if (p.kind === "anchor_line") return `<g data-part="prop">${anchorLine(c, s, d, size, W)}</g>`;
      // 人に付けた安全帯は、腰のベルトに加えて肩のベルトともものベルトを体に沿って描く（058）
      const straps = p.kind === "harness" && "figure" in p.at ? harnessStraps(posed[p.at.figure], W) : "";
      return `<g data-part="prop">${straps}${shape(p.kind, c, s, d, { W, worn: onHead || onHand })}</g>`;
    })
    .join("");
}

/** 吊り元の綱: 腰の後ろから天井の金具までの灰の綱と、天井にかけたフックと金具の板。c は腰 */
function anchorLine([cx, cy]: Pt, s: number, d: number, size: number, W: number): string {
  const top = CEIL * size;
  const bx = cx - d * s * 0.45;
  const tx = cx - d * s * 0.7;
  const hookY = top + s * 0.45;
  const rope = `M${n(bx)} ${n(cy)}Q${n(tx - d * s * 0.25)} ${n((cy + hookY) / 2)} ${n(tx)} ${n(hookY)}`;
  return `<path d="${rope}" fill="none" stroke="${INK}" stroke-width="${n(W * 2.6)}" stroke-linecap="round"/><path d="${rope}" fill="none" stroke="${MID}" stroke-width="${n(W)}" stroke-linecap="round"/>` +
    `<path d="M${n(tx)} ${n(hookY)}V${n(top + s * 0.2)}A${n(s * 0.12)} ${n(s * 0.12)} 0 0 ${d > 0 ? 1 : 0} ${n(tx + d * s * 0.24)} ${n(top + s * 0.2)}V${n(top + s * 0.3)}" fill="none" stroke="${INK}" stroke-width="${n(W * 1.6)}" stroke-linecap="round"/>` +
    `<rect x="${n(tx - s * 0.2)}" y="${n(top)}" width="${n(s * 0.64)}" height="${n(s * 0.12)}" rx="${n(s * 0.03)}" fill="${STEEL}" stroke="${INK}" stroke-width="${n(W)}" stroke-linejoin="round"/>`;
}

/** 安全帯の肩とももをつなぐベルト（フルハーネス）。肩から腰へ 2 本、胸に横の 1 本、ももに 1 本ずつ。縁の黒の上に濃い灰を重ねる */
function harnessStraps(p: Posed, W: number): string {
  const j = p.joints;
  const tw = p.h * PROPORTION.torsoWidth * 0.32;
  const strap = (a: Pt, b: Pt) =>
    `<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}" stroke="${INK}" stroke-width="${n(W * 3)}" stroke-linecap="round"/>` +
    `<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}" stroke="${DARK}" stroke-width="${n(W * 1.4)}" stroke-linecap="round"/>`;
  const at = (a: Pt, b: Pt, u: number): Pt => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  let out = "";
  for (const k of [-1, 1]) out += strap([j.shoulder[0] + k * tw, j.shoulder[1]], [j.hip[0] + k * tw, j.hip[1]]);
  const chest = at(j.shoulder, j.hip, 0.3);
  out += strap([chest[0] - tw * 1.3, chest[1]], [chest[0] + tw * 1.3, chest[1]]);
  const lw = p.h * PROPORTION.limbWidth * 0.75;
  for (const knee of [j.knee_far, j.knee_near]) {
    const m = at(j.hip, knee, 0.35);
    const vx = knee[0] - j.hip[0];
    const vy = knee[1] - j.hip[1];
    const len = Math.hypot(vx, vy) || 1;
    const [px, py] = [-vy / len, vx / len];
    out += strap([m[0] + px * lw, m[1] + py * lw], [m[0] - px * lw, m[1] - py * lw]);
  }
  return out;
}
