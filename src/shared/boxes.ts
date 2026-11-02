// 経路の画面（053）で絵の部品をタップする範囲と、枠に入った部品を選ぶとき（044b）に使う。描く側の位置の決め方（関節の位置と小物の持つところ）から、
// 部品ごとの箱を絵の見える範囲に対する割合（0〜1）で出す。描いた SVG の中は変えない。
import type { CardPart } from "./card";
import { frameAt, type MotionJson } from "./picto/motion";
import { anchorPoint } from "./picto/props";
import { renderFrame, SIZE } from "./picto/scene";
import { PROPORTION } from "./picto/skeleton";

export interface Box {
  part: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 時刻 t のコマで見えている部品の箱。見えていない部品（隠した小物・ほかのコマだけの部品）は出さない */
export function partBoxes(m: MotionJson, t: number, parts: CardPart[]): Box[] {
  const frame = frameAt(m, t);
  const { posed, view } = renderFrame(frame);
  // 小物の何番目かは、キーフレームの props の並び（隠した小物も数える）
  const key = [...m.keyframes].reverse().find((k) => k.t <= t) ?? m.keyframes[0];
  const shown = key.props.map((p) => p.show !== false);
  const [vx, vy, vw] = view;
  const rel = (x0: number, y0: number, x1: number, y1: number) => {
    const a = Math.max(0, (x0 - vx) / vw);
    const b = Math.max(0, (y0 - vy) / vw);
    const c = Math.min(1, (x1 - vx) / vw);
    const d = Math.min(1, (y1 - vy) / vw);
    return c > a && d > b ? { x: a, y: b, w: c - a, h: d - b } : null;
  };
  const out: Box[] = [];
  for (const part of parts) {
    const tg = part.target;
    let r: ReturnType<typeof rel> = null;
    if (tg.type === "figure" && posed[tg.index]) {
      const p = posed[tg.index];
      const pts = Object.values(p.joints);
      const pad = p.h * PROPORTION.head * 1.2;
      r = rel(Math.min(...pts.map((q) => q[0])) - pad, Math.min(...pts.map((q) => q[1])) - pad, Math.max(...pts.map((q) => q[0])) + pad, Math.max(...pts.map((q) => q[1])) + pad * 0.3);
    } else if (tg.type === "prop" && shown[tg.index]) {
      const k = key.props[tg.index];
      const at = k.figure < 0 ? { x: k.x, y: k.y } : { figure: k.figure, joint: k.joint, dx: k.dx, dy: k.dy };
      const { c } = anchorPoint(at, posed, SIZE);
      const half = (k.size * SIZE) / 2;
      r = rel(c[0] - half, c[1] - half, c[0] + half, c[1] + half);
    }
    if (r) out.push({ part: part.id, ...r });
  }
  return out;
}
