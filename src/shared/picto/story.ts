// 動画の起の紙芝居だけで使う部品（096a）。カードの小物（props.ts の PROP_KINDS）とは分け、AI の構造化出力には入れない。
// 絵柄はカードと同じ: 黒い縁取り・グレーの面・文字なし。吹き出しの中の白だけ data-part="bubble" の中に置く。
// 置き場所はキャンバスの割合（0〜1）で決め、大きさはキャンバスの幅に対する割合
import { type Frame, renderFrame } from "./scene";

export const STORY_KINDS = [
  "map_japan", "map_vietnam", "heart", "globe", "book", "arrow_right",
  "blackboard", "desk", "game_handheld", "star", "brick_wall", "screen_card", "arc_arrow",
] as const;
export type StoryKind = (typeof STORY_KINDS)[number];

/** 考える吹き出しの中に描ける部品 */
export const STORY_BUBBLE_INNER = ["map_japan", "map_vietnam", "globe", "heart"] as const;
export type StoryBubbleInner = (typeof STORY_BUBBLE_INNER)[number];

export type StoryPart =
  | { kind: StoryKind; x: number; y: number; size: number; flip?: boolean }
  /** 考える吹き出し。中に部品を 1 つか 2 つ（2 つなら間に矢印）。to は頭（小さい丸がそこへ向かう） */
  | { kind: "think"; x: number; y: number; size: number; inner: StoryBubbleInner[]; to?: [number, number] };

const INK = "#000";
const GRAY = "#8a8a8a";
const DARK = "#3a3a3a";
const LIGHT = "#d6d6d6";
const n = (v: number) => Math.round(v * 10) / 10;
const poly = (pts: [number, number][], fill: string, w = 0) =>
  `<path d="M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join(" L")} Z" fill="${fill}"${w ? ` stroke="${INK}" stroke-width="${n(w)}" stroke-linejoin="round"` : ""}/>`;
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, w: number) =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}" stroke-width="${n(w)}" stroke-linecap="round"/>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, rx: number, sw = 0) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(rx)}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${n(sw)}"` : ""}/>`;

// 地図は形だけ（-0.5〜0.5 の枠の中）。国の名前や旗は描かない
const JAPAN: [number, number][][] = [
  [[0.1, -0.46], [0.3, -0.5], [0.44, -0.4], [0.38, -0.27], [0.22, -0.3], [0.12, -0.36]],
  [[0.16, -0.26], [0.32, -0.24], [0.32, -0.06], [0.22, 0.1], [0.04, 0.2], [-0.16, 0.26], [-0.32, 0.24], [-0.34, 0.14], [-0.18, 0.08], [-0.02, 0.02], [0.1, -0.08], [0.14, -0.18]],
  [[-0.22, 0.29], [-0.04, 0.27], [-0.06, 0.35], [-0.22, 0.36]],
  [[-0.46, 0.24], [-0.34, 0.26], [-0.32, 0.4], [-0.4, 0.48], [-0.48, 0.36]],
];
const VIETNAM: [number, number][] = [
  [-0.18, -0.48], [0.12, -0.46], [0.16, -0.38], [0.04, -0.3], [-0.02, -0.2], [0.06, -0.08], [0.2, 0.04], [0.24, 0.2], [0.14, 0.34], [-0.04, 0.46],
  [-0.18, 0.48], [-0.12, 0.36], [0.02, 0.24], [0.04, 0.14], [-0.06, 0.02], [-0.18, -0.12], [-0.2, -0.28], [-0.1, -0.38], [-0.22, -0.42],
];

/** 部品 1 つ。c は真ん中、s は大きさ（px）、d は向き（1 右・-1 左） */
export function storyShape(kind: StoryKind, [cx, cy]: [number, number], s: number, d = 1): string {
  const w = Math.max(3, s * 0.035);
  const h = s / 2;
  const at = (pts: [number, number][]) => pts.map(([x, y]) => [cx + x * s * d, cy + y * s] as [number, number]);
  switch (kind) {
    case "map_japan":
      return JAPAN.map((p) => poly(at(p), GRAY, w)).join("");
    case "map_vietnam":
      return poly(at(VIETNAM), GRAY, w);
    case "heart":
      return `<path d="M${n(cx)} ${n(cy + h * 0.8)}C${n(cx - h * 1.2)} ${n(cy)} ${n(cx - h * 0.9)} ${n(cy - h * 0.9)} ${n(cx)} ${n(cy - h * 0.35)}C${n(cx + h * 0.9)} ${n(cy - h * 0.9)} ${n(cx + h * 1.2)} ${n(cy)} ${n(cx)} ${n(cy + h * 0.8)}Z" fill="${GRAY}" stroke="${INK}" stroke-width="${n(w)}" stroke-linejoin="round"/>`;
    case "globe":
      // 地球: 丸と、経線の楕円 2 つと、緯線 2 本（言葉の国を選ばない「世界の言葉」）
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(h * 0.9)}" fill="${LIGHT}" stroke="${INK}" stroke-width="${n(w)}"/>` +
        `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(h * 0.4)}" ry="${n(h * 0.9)}" fill="none" stroke="${INK}" stroke-width="${n(w * 0.7)}"/>` +
        line(cx, cy - h * 0.9, cx, cy + h * 0.9, INK, w * 0.7) + line(cx - h * 0.9, cy, cx + h * 0.9, cy, INK, w * 0.7) +
        line(cx - h * 0.78, cy - h * 0.45, cx + h * 0.78, cy - h * 0.45, INK, w * 0.5) + line(cx - h * 0.78, cy + h * 0.45, cx + h * 0.78, cy + h * 0.45, INK, w * 0.5);
    case "book": {
      // 開いた本: 左右の頁と、頁の中の横の筋（字は描かない）
      let out = poly([[cx, cy - h * 0.45], [cx - h, cy - h * 0.6], [cx - h, cy + h * 0.45], [cx, cy + h * 0.6]], LIGHT, w) +
        poly([[cx, cy - h * 0.45], [cx + h, cy - h * 0.6], [cx + h, cy + h * 0.45], [cx, cy + h * 0.6]], LIGHT, w);
      for (const k of [-1, 1]) for (let i = 0; i < 4; i++) out += line(cx + k * h * 0.18, cy - h * 0.25 + i * h * 0.2, cx + k * h * 0.8, cy - h * 0.35 + i * h * 0.2, GRAY, w * 0.6);
      return out;
    }
    case "arrow_right":
      return line(cx - h * d, cy, cx + h * 0.45 * d, cy, INK, w * 2.2) + poly([[cx + h * d, cy], [cx + h * 0.4 * d, cy - h * 0.42], [cx + h * 0.4 * d, cy + h * 0.42]], INK);
    case "blackboard": {
      // 黒板: 濃いグレーの板と木の枠、白くない明るいグレーのうねりの筋（字の代わり。読める字は描かない）
      const bw = s;
      const bh = s * 0.6;
      let out = rect(cx - bw / 2, cy - bh / 2, bw, bh, DARK, w, w * 1.4);
      for (let i = 0; i < 3; i++) {
        const y = cy - bh * 0.25 + i * bh * 0.22;
        const x0 = cx - bw * 0.38;
        const len = bw * (0.7 - i * 0.12);
        let dpath = `M${n(x0)} ${n(y)}`;
        for (let k = 1; k <= 8; k++) dpath += ` Q${n(x0 + (len / 8) * (k - 0.5))} ${n(y + (k % 2 ? -1 : 1) * bh * 0.05)} ${n(x0 + (len / 8) * k)} ${n(y)}`;
        out += `<path d="${dpath}" fill="none" stroke="${LIGHT}" stroke-width="${n(w * 0.9)}" stroke-linecap="round"/>`;
      }
      return out + rect(cx - bw * 0.42, cy + bh / 2 - w, bw * 0.84, w * 2.2, GRAY, w * 0.5, w * 0.6);
    }
    case "desk":
      // 机: 天板と脚 2 本。c は天板の真ん中
      return rect(cx - h, cy - s * 0.05, s, s * 0.1, GRAY, w * 0.5, w) + line(cx - h * 0.85, cy + s * 0.05, cx - h * 0.85, cy + s * 0.5, INK, w * 1.4) + line(cx + h * 0.85, cy + s * 0.05, cx + h * 0.85, cy + s * 0.5, INK, w * 1.4);
    case "game_handheld": {
      // 手で持つゲーム機（どこの製品か分からない形）: 角の丸い箱・画面・十字の鍵・丸い押しボタン 2 つ
      const gw = s;
      const gh = s * 0.58;
      const kw = gh * 0.12;
      const kx = cx - gw * 0.36;
      return rect(cx - gw / 2, cy - gh / 2, gw, gh, GRAY, gh * 0.22, w) +
        rect(cx - gw * 0.22, cy - gh * 0.34, gw * 0.44, gh * 0.68, LIGHT, gh * 0.05, w * 0.8) +
        rect(kx - kw * 1.5, cy - kw / 2, kw * 3, kw, INK, kw * 0.2) + rect(kx - kw / 2, cy - kw * 1.5, kw, kw * 3, INK, kw * 0.2) +
        `<circle cx="${n(cx + gw * 0.33)}" cy="${n(cy - gh * 0.08)}" r="${n(kw * 0.7)}" fill="${INK}"/><circle cx="${n(cx + gw * 0.41)}" cy="${n(cy + gh * 0.1)}" r="${n(kw * 0.7)}" fill="${INK}"/>`;
    }
    case "star": {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? h * 0.42 : h;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      return poly(pts, GRAY, w);
    }
    case "brick_wall": {
      // れんがの壁: c は壁の下の真ん中、高さは s、幅は s の 0.3
      const ww = s * 0.3;
      const rows = 8;
      const rh = s / rows;
      let out = rect(cx - ww / 2, cy - s, ww, s, "#a8a8a8", 0, w);
      for (let i = 1; i < rows; i++) out += line(cx - ww / 2, cy - s + i * rh, cx + ww / 2, cy - s + i * rh, INK, w * 0.6);
      for (let i = 0; i < rows; i++) out += line(cx + (i % 2 ? ww * 0.17 : -ww * 0.17), cy - s + i * rh, cx + (i % 2 ? ww * 0.17 : -ww * 0.17), cy - s + (i + 1) * rh, INK, w * 0.6);
      return out;
    }
    case "screen_card": {
      // 画面（携帯の板）に、ピクトグラムのカードの縮図: 人の形と丸の印
      const pw = s * 0.6;
      const ph = s;
      const hr = pw * 0.1;
      return rect(cx - pw / 2, cy - ph / 2, pw, ph, GRAY, pw * 0.12, w) +
        rect(cx - pw * 0.4, cy - ph * 0.4, pw * 0.8, ph * 0.72, LIGHT, pw * 0.04, w * 0.6) +
        `<circle cx="${n(cx - pw * 0.1)}" cy="${n(cy - ph * 0.22)}" r="${n(hr)}" fill="${INK}"/>` +
        line(cx - pw * 0.1, cy - ph * 0.14, cx - pw * 0.1, cy + ph * 0.05, INK, w * 1.4) +
        line(cx - pw * 0.1, cy - ph * 0.08, cx + pw * 0.08, cy - ph * 0.02, INK, w * 1.2) +
        line(cx - pw * 0.1, cy + ph * 0.05, cx - pw * 0.2, cy + ph * 0.2, INK, w * 1.2) + line(cx - pw * 0.1, cy + ph * 0.05, cx, cy + ph * 0.2, INK, w * 1.2) +
        `<circle cx="${n(cx + pw * 0.2)}" cy="${n(cy - ph * 0.2)}" r="${n(pw * 0.1)}" fill="none" stroke="${INK}" stroke-width="${n(w)}"/>` +
        `<circle cx="${n(cx)}" cy="${n(cy + ph * 0.41)}" r="${n(pw * 0.05)}" fill="${INK}"/>`;
    }
    case "arc_arrow": {
      // 弧の矢印: 左から右へ山なりに越える点線。c は弧の頂、幅は s
      const x0 = cx - h * d;
      const x1 = cx + h * 0.8 * d;
      const y0 = cy + s * 0.35;
      const tip: [number, number] = [cx + h * d, y0];
      return `<path d="M${n(x0)} ${n(y0)}Q${n(cx)} ${n(cy - s * 0.35)} ${n(x1)} ${n(y0 - s * 0.05)}" fill="none" stroke="${INK}" stroke-width="${n(w * 1.6)}" stroke-dasharray="${n(w * 3)} ${n(w * 2.2)}" stroke-linecap="round"/>` +
        poly([tip, [tip[0] - h * 0.3 * d, tip[1] - h * 0.3], [tip[0] - h * 0.32 * d, tip[1] + h * 0.12]], INK);
    }
  }
}

function thinkSvg(part: Extract<StoryPart, { kind: "think" }>, size: number): string {
  const cx = part.x * size;
  const cy = part.y * size;
  const bw = part.size * size;
  const bh = bw * (part.inner.length > 1 ? 0.5 : 0.75);
  const w = Math.max(3, bw * 0.025);
  let out = `<rect x="${n(cx - bw / 2)}" y="${n(cy - bh / 2)}" width="${n(bw)}" height="${n(bh)}" rx="${n(bh * 0.45)}" fill="#fff" stroke="${INK}" stroke-width="${n(w)}" stroke-dasharray="${n(w * 2.2)} ${n(w * 1.6)}"/>`;
  if (part.to) {
    const [tx, ty] = [part.to[0] * size, part.to[1] * size];
    const sx = cx + (tx - cx) * 0.25;
    const sy = cy + bh / 2;
    for (const [u, r] of [[0.35, 0.045], [0.7, 0.03]] as const)
      out += `<circle cx="${n(sx + (tx - sx) * u)}" cy="${n(sy + (ty - sy) * u)}" r="${n(bw * r)}" fill="#fff" stroke="${INK}" stroke-width="${n(w * 0.8)}"/>`;
  }
  const k = part.inner.length;
  const inner = part.inner
    .map((kind, i) => storyShape(kind, [cx + (k > 1 ? (i === 0 ? -bw * 0.28 : bw * 0.28) : 0), cy], bh * 0.78))
    .join("");
  const arrow = k > 1 ? storyShape("arrow_right", [cx, cy], bh * 0.32) : "";
  return `<g data-part="bubble">${out}${inner}${arrow}</g>`;
}

export function storyPartsSvg(parts: StoryPart[], size: number): string {
  return parts
    .map((p) => (p.kind === "think" ? `<g data-part="prop">${thinkSvg(p, size)}</g>` : `<g data-part="prop">${storyShape(p.kind, [p.x * size, p.y * size], p.size * size, p.flip ? -1 : 1)}</g>`))
    .join("");
}

/** 起の 1 枚: カードと同じ場面（人形・小物）に、起の部品を足す。枠の線より下に重ねる */
export function storyFrameSvg(frame: Frame, parts: StoryPart[], size = 768): string {
  const { svg } = renderFrame(frame, size);
  const at = svg.lastIndexOf('<g data-part="border">');
  return svg.slice(0, at) + storyPartsSvg(parts, size) + svg.slice(at);
}
