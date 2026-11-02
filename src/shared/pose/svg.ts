// 最小の仮の人形（006）。姿勢の数字から丸と線の SVG を作る。同じ入力なら同じ文字列。文字・title・id は入れない。
// 正式な絵（塗りの人・部品・コマ割り）は 015〜017 で作り直す。
import { type Figure, type Pose, type Prop } from "./schema";

export const SIZE = 768;
const S = SIZE;
const GROUND = 0.85;
const BLACK = "#000";
const GRAY = "#808080";
const LIGHT = "#e1e1e1";
const RED = "#d21e1e";

type Pt = [number, number];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** 小数 1 桁に丸めて -0 を 0 にする（環境で文字列が変わらないように） */
const n = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};
const pts = (ps: Pt[]) => ps.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");

const line = (a: Pt, b: Pt, w: number, c = BLACK) => `<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}" stroke="${c}" stroke-width="${n(w)}" stroke-linecap="round"/>`;
const poly = (ps: Pt[], fill: string, stroke = "none", w = 0) => `<polygon points="${pts(ps)}" fill="${fill}" stroke="${stroke}" stroke-width="${n(w)}"/>`;
const path = (ps: Pt[], w: number, c = BLACK) => `<polyline points="${pts(ps)}" fill="none" stroke="${c}" stroke-width="${n(w)}" stroke-linejoin="round" stroke-linecap="round"/>`;
const rect = (x0: number, y0: number, x1: number, y1: number, fill: string, stroke = "none", w = 0, r = 0) =>
  `<rect x="${n(x0)}" y="${n(y0)}" width="${n(x1 - x0)}" height="${n(y1 - y0)}"${r ? ` rx="${n(r)}"` : ""} fill="${fill}" stroke="${stroke}" stroke-width="${n(w)}"/>`;
const circle = (c: Pt, r: number, fill: string, stroke = "none", w = 0) => `<circle cx="${n(c[0])}" cy="${n(c[1])}" r="${n(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${n(w)}"/>`;
const ellipse = (c: Pt, rx: number, ry: number, fill: string, stroke = "none", w = 0) =>
  `<ellipse cx="${n(c[0])}" cy="${n(c[1])}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}" stroke="${stroke}" stroke-width="${n(w)}"/>`;
/** 弧（角度は度、時計回り。0 が右） */
const arc = (c: Pt, r: number, from: number, to: number, w: number, c2 = BLACK) => {
  const p = (deg: number): Pt => [c[0] + r * Math.cos((deg * Math.PI) / 180), c[1] + r * Math.sin((deg * Math.PI) / 180)];
  const sweep = (((to - from) % 360) + 360) % 360;
  const [a, b] = [p(from), p(from + sweep)];
  return `<path d="M${n(a[0])} ${n(a[1])}A${n(r)} ${n(r)} 0 ${sweep > 180 ? 1 : 0} 1 ${n(b[0])} ${n(b[1])}" fill="none" stroke="${c2}" stroke-width="${n(w)}" stroke-linecap="round"/>`;
};

export type Joints = Record<"hip" | "shoulder" | "head" | `${"elbow" | "hand" | "knee" | "foot"}_${"l" | "r"}`, Pt>;

/** 人物の関節の位置。足のいちばん低いところを地面に置く */
export function posePoints(fig: Figure): { p: Joints; sc: number; d: 1 | -1 } {
  const a = fig.angles;
  const sc = clamp(fig.scale, 0.4, 1.3) * S;
  const d = fig.facing === "right" ? 1 : -1;
  const vec = (fromDown: number, len: number): Pt => {
    const r = (fromDown * Math.PI) / 180;
    return [d * Math.sin(r) * len * sc, Math.cos(r) * len * sc];
  };
  const add = (p: Pt, q: Pt): Pt => [p[0] + q[0], p[1] + q[1]];
  const hip: Pt = [0, 0];
  const tor = clamp(a.torso, -100, 100);
  const sh = add(hip, vec(180 - tor, 0.2));
  const head = add(sh, vec(180 - tor - clamp(a.head, -60, 60), 0.045 * 1.15));
  const p = { hip, shoulder: sh, head } as Joints;
  for (const s of ["l", "r"] as const) {
    const u = clamp(a[`arm_${s}_upper`], -180, 200);
    const lo = clamp(a[`arm_${s}_lower`], -10, 160);
    p[`elbow_${s}`] = add(sh, vec(u - tor, 0.11));
    p[`hand_${s}`] = add(p[`elbow_${s}`], vec(u + lo - tor, 0.1));
    const lu = clamp(a[`leg_${s}_upper`], -60, 150);
    const ll = clamp(a[`leg_${s}_lower`], -160, 10);
    p[`knee_${s}`] = add(hip, vec(lu - tor * 0.2, 0.11 * 1.2));
    p[`foot_${s}`] = add(p[`knee_${s}`], vec(lu + ll - tor * 0.2, 0.1 * 1.3));
  }
  const lowest = Math.max(...Object.values(p).map((q) => q[1]));
  const ox = clamp(fig.x, 0.1, 0.9) * S;
  const oy = GROUND * S - lowest;
  for (const k of Object.keys(p) as (keyof Joints)[]) p[k] = [p[k][0] + ox, p[k][1] + oy];
  return { p, sc, d };
}

function drawProp(kind: Prop, [cx, cy]: Pt, size: number, d: number): string {
  const h = (clamp(size, 0.04, 0.45) * S) / 2;
  const w = Math.max(3, Math.floor(S * 0.008));
  const P = (x: number, y: number): Pt => [cx + x * h, cy + y * h];
  switch (kind) {
    case "helmet":
      return `<path d="M${n(cx - h)} ${n(cy)}A${n(h)} ${n(h * 0.8)} 0 0 1 ${n(cx + h)} ${n(cy)}Z" fill="${GRAY}" stroke="${BLACK}" stroke-width="3"/>`;
    case "harness":
      return rect(cx - h, cy - h * 0.25, cx + h, cy + h * 0.25, "none", BLACK, w);
    case "hook":
      return arc([cx, cy], h * 0.5, 0, 300, w) + line(P(0, -0.5), P(0, -1.2), w);
    case "anchor_bar":
      return line(P(-2, 0), P(2, 0), w * 3, GRAY);
    case "voltage_tester":
      return rect(cx - h * 0.2, cy - h, cx + h * 0.2, cy + h * 0.3, BLACK) + line(P(0, 0.3), P(0, 1), w) + [0, 1, 2].map((i) => arc(P(0, -1), h * (0.5 + 0.25 * i), 220, 320, w, GRAY)).join("");
    case "wire":
      return path([P(-2, -0.3), P(-1, 0), P(0, -0.3), P(1, 0), P(2, -0.3)], w * 2);
    case "panel":
      return rect(cx - h, cy - h * 1.3, cx + h, cy + h * 1.3, LIGHT, BLACK, w) + line(P(0, -1.3), P(0, 1.3), w, GRAY);
    case "tag":
      return rect(cx - h * 0.6, cy - h * 0.4, cx + h * 0.6, cy + h * 0.6, "#fff", BLACK, 2) + line(P(-0.4, -0.1), P(0.4, 0.4), w) + line(P(0.4, -0.1), P(-0.4, 0.4), w) + circle(P(0, -0.27), h * 0.08, BLACK);
    case "lock":
      return arc(P(0, -0.5), h * 0.4, 180, 360, w * 2) + rect(cx - h * 0.55, cy - h * 0.5, cx + h * 0.55, cy + h * 0.4, BLACK);
    case "suspended_load":
      return line(P(0, -2), P(0, -0.6), w) + rect(cx - h, cy - h * 0.6, cx + h, cy + h * 0.6, GRAY, BLACK, w);
    case "crane_hook":
      return line(P(0, -2), P(0, 0), w) + arc(P(0, 0.2), h * 0.4, 300, 200, w * 2);
    case "arrow_down":
      return line(P(0, -1), P(0, 0.4), w * 2) + poly([P(-0.4, 0.3), P(0.4, 0.3), P(0, 1)], BLACK);
    case "distance_arrow":
      return line(P(-2, 0), P(2, 0), w) + [-1, 1].map((s) => poly([P(s * 2, 0), P(s * 1.6, -0.25), P(s * 1.6, 0.25)], BLACK) + line(P(s * 2, -0.5), P(s * 2, 0.5), w)).join("");
    case "broom":
      return line(P(0, -1.5), P(0, 0.5), w) + poly([P(-0.5, 1), P(0.5, 1), P(0.15, 0.5), P(-0.15, 0.5)], GRAY);
    case "box":
      return rect(cx - h, cy - h * 0.7, cx + h, cy + h * 0.7, LIGHT, BLACK, w);
    case "trash_bin":
      return poly([P(-0.7, -0.6), P(0.7, -0.6), P(0.55, 1), P(-0.55, 1)], GRAY, BLACK, 2) + line(P(-0.85, -0.75), P(0.85, -0.75), w);
    case "clock":
      return circle([cx, cy], h, "#fff", BLACK, w) + line([cx, cy], P(0, -0.7), w) + line([cx, cy], P(0.5, 0), w);
    case "checklist":
      return rect(cx - h * 0.7, cy - h, cx + h * 0.7, cy + h, "#fff", BLACK, w) + [0, 1, 2].map((i) => {
        const y = -0.6 + i * 0.6;
        return path([P(-0.5, y), P(-0.35, y + 0.15), P(-0.1, y - 0.15)], w) + line(P(0.05, y), P(0.5, y), w, GRAY);
      }).join("");
    case "check":
      return path([P(-1, 0), P(-0.3, 0.7), P(1, -0.8)], w * 2);
    case "thermometer":
      return rect(cx - h * 0.12, cy - h, cx + h * 0.12, cy + h * 0.5, "none", BLACK, w) + circle(P(0, 0.7), h * 0.3, BLACK);
    case "speech_bubble":
      return ellipse([cx, cy], h, h * 0.6, "#fff", BLACK, w) + poly([P(-d * 0.4, 0.45), P(-d * 1.1, 1), P(-d * 0.1, 0.55)], BLACK);
    case "stop_hand":
      return rect(cx - h * 0.5, cy - h * 0.3, cx + h * 0.5, cy + h * 0.8, BLACK, "none", 0, h * 0.2) + [0, 1, 2, 3].map((i) => {
        const x0 = cx - h * 0.5 + i * h * 0.26;
        return rect(x0, cy - h, x0 + h * 0.2, cy - h * 0.2, BLACK, "none", 0, h * 0.1);
      }).join("");
    case "warning_triangle":
      return poly([P(0, -1), P(1, 0.8), P(-1, 0.8)], "none", BLACK, w) + line(P(0, -0.3), P(0, 0.3), w * 2) + circle(P(0, 0.52), h * 0.08, BLACK);
    case "bed":
      return rect(cx - h * 1.5, cy - h * 0.2, cx + h * 1.5, cy + h * 0.2, GRAY) + line(P(-1.5, -0.6), P(-1.5, 0.6), w);
  }
}

function drawFigure(fig: Figure): { svg: string; p: Joints; d: 1 | -1 } {
  const { p, sc, d } = posePoints(fig);
  const w = Math.max(6, Math.floor(sc * 0.03));
  const bones: [keyof Joints, keyof Joints][] = [
    ["hip", "shoulder"], ["shoulder", "elbow_l"], ["elbow_l", "hand_l"], ["shoulder", "elbow_r"], ["elbow_r", "hand_r"],
    ["hip", "knee_l"], ["knee_l", "foot_l"], ["hip", "knee_r"], ["knee_r", "foot_r"],
  ];
  let svg = bones.map(([a, b]) => line(p[a], p[b], w)).join("");
  const r = sc * 0.05;
  svg += circle(p.head, r, BLACK);
  // 視線: 頭の前に短い線（0 で向いている側、正で上）
  const g = (clamp(fig.gaze, -90, 90) * Math.PI) / 180;
  const eye: Pt = [p.head[0] + d * r * 1.25, p.head[1]];
  svg += line(eye, [eye[0] + d * Math.cos(g) * r * 0.9, eye[1] - Math.sin(g) * r * 0.9], 3, GRAY);
  if (fig.mouth_open) svg += d > 0 ? arc([p.head[0] + r * 1.2, p.head[1]], r * 0.6, -40, 40, 3) : arc([p.head[0] - r * 1.2, p.head[1]], r * 0.6, 140, 220, 3);
  if (fig.pointing) {
    for (const s of ["l", "r"] as const) {
      const [ex, ey] = p[`elbow_${s}`];
      const [hx, hy] = p[`hand_${s}`];
      const len = Math.hypot(hx - ex, hy - ey) || 1;
      svg += line([hx, hy], [hx + ((hx - ex) / len) * r * 0.9, hy + ((hy - ey) / len) * r * 0.9], Math.max(3, Math.floor(w / 2)));
    }
  }
  return { svg, p, d };
}

/** 姿勢の数字から SVG。中身は図形だけ（文字・title・desc・id・メタデータ無し） */
export function renderPoseSvg(pose: Pose): string {
  const parts: string[] = [rect(0, 0, S, S, "#fff"), line([0, GROUND * S], [S, GROUND * S], 4, GRAY)];
  const figs = pose.figures.slice(0, 2).map(drawFigure);
  parts.push(...figs.map((f) => f.svg));
  for (const pr of pose.props) {
    let at: Pt = [clamp(pr.x, 0, 1) * S, clamp(pr.y, 0, 1) * S];
    let d = 1;
    if (pr.attach !== "free" && figs.length) {
      const f = figs[clamp(pr.figure, 0, figs.length - 1)];
      at = f.p[pr.attach === "waist" ? "hip" : pr.attach];
      d = f.d;
      if (pr.kind === "helmet") at = [at[0], at[1] - SIZE * 0.012];
    }
    parts.push(drawProp(pr.kind, at, pr.size, d));
  }
  if (pose.overlay.mark === "circle") parts.push(circle([S * 0.87, S * 0.13], S * 0.09, "none", BLACK, 10));
  if (pose.overlay.mark === "cross") parts.push(line([S * 0.78, S * 0.04], [S * 0.96, S * 0.22], 12), line([S * 0.96, S * 0.04], [S * 0.78, S * 0.22], 12));
  if (pose.overlay.prohibit) parts.push(circle([S / 2, S / 2], S * 0.44, "none", RED, 22), line([S * 0.2, S * 0.2], [S * 0.8, S * 0.8], 22, RED));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${parts.join("")}</svg>`;
}
