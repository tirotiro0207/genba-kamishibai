// 体が細かいドットに分かれて、1 つの点（ポータルの口）へ吸い込まれる仕組み（v4 でも使う部品。11/5 夜）。
// 人の絵は、マスクで小さな四角に切って順に消し、消えた四角の所から元の色のドットが出て、口の真ん中へまっすぐ吸い込まれる（v4）。
// ドットが出る所は人の形のあらまし（頭・胴・脚。リュックがあれば背中の箱）に絞り、何も無い所からドットが出ないようにする
import React from "react";
import { interpolate } from "remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const hash = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
interface Box { x0: number; y0: number; x1: number; y1: number; colors?: string[] }
/** 立った人のあらまし（足元 x・地面 g・背の高さ h）。pack が -1 / 1 なら背中の左 / 右にリュックの箱 */
export const bodyBoxes = (x: number, g: number, h: number, pack: -1 | 0 | 1 = 0): Box[] => {
  const b: Box[] = [
    { x0: x - h * 0.13, y0: g - h, x1: x + h * 0.13, y1: g - h * 0.72 }, // 頭
    { x0: x - h * 0.14, y0: g - h * 0.72, x1: x + h * 0.14, y1: g - h * 0.42 }, // 胴と腕
    { x0: x - h * 0.12, y0: g - h * 0.42, x1: x + h * 0.12, y1: g }, // 脚
  ];
  if (pack) {
    const px = x + pack * h * 0.2;
    b.push({ x0: px - h * 0.3, y0: g - h * 1.24, x1: px + h * 0.22, y1: g + h * 0.02 });
  }
  return b;
};

/**
 * p は 0〜1（0 でそのまま、1 で全部吸い込まれた）。children は消える絵（SVG）。
 * to は吸い込まれる先。cell はドットの大きさ。color はドットの色（いくつか渡すと混ぜる）
 */
export const Dissolve: React.FC<{ id: string; p: number; boxes: Box[]; to: [number, number]; cell?: number; color?: string[]; children: React.ReactNode }> = ({ id, p, boxes, to, cell = 6, color = ["#2b2550", "#ffffff", "#d97757"], children }) => {
  if (p <= 0) return <>{children}</>;
  const cells: { x: number; y: number; thr: number; i: number; col: string }[] = [];
  const seen = new Set<string>();
  const near = boxes.reduce((a, b) => Math.max(a, Math.hypot((b.x0 + b.x1) / 2 - to[0], (b.y0 + b.y1) / 2 - to[1])), 1);
  let i = 0;
  for (const b of boxes) {
    for (let y = b.y0; y < b.y1; y += cell) {
      for (let x = b.x0; x < b.x1; x += cell) {
        const key = `${Math.round(x / cell)}:${Math.round(y / cell)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // 吸い込む口に近い所から先にほどける（少しばらつかせる）
        const d = Math.hypot(x - to[0], y - to[1]) / near;
        const cs = b.colors ?? color;
        cells.push({ x, y, thr: Math.min(0.62, d * 0.45 + hash(i) * 0.17), i, col: cs[Math.floor(hash(i + 3) * cs.length)] });
        i++;
      }
    }
  }
  const FLY = 0.36;
  return (
    <g>
      <mask id={id} maskUnits="userSpaceOnUse" x={-4000} y={-4000} width={8000} height={8000}>
        <rect x={-4000} y={-4000} width={8000} height={8000} fill="#fff" />
        {cells.map((c) => (p > c.thr ? <rect key={c.i} x={c.x - 1} y={c.y - 1} width={cell + 2} height={cell + 2} fill="#000" shapeRendering="crispEdges" /> : null))}
        {p >= 0.99 && <rect x={-4000} y={-4000} width={8000} height={8000} fill="#000" />}
      </mask>
      <g mask={`url(#${id})`}>{children}</g>
      {cells.map((c) => {
        const q = interpolate(p, [c.thr, c.thr + FLY], [0, 1], clamp);
        if (q <= 0 || q >= 1) return null;
        // v4（作者の指示）: 渦を巻かず、元の所から口の真ん中へまっすぐ飛ぶ。口に近づくほど速い。後ろに 2 個分の尾
        return [0, 0.07, 0.14].map((lag, k) => {
          const qq = Math.max(0, q - lag);
          if (k > 0 && qq <= 0) return null;
          const e = qq * qq;
          const x = c.x + (to[0] - c.x) * e;
          const y = c.y + (to[1] - c.y) * e;
          const s = cell * (1 - e * 0.6) * (1 - k * 0.3);
          return <rect key={`${c.i}-${k}`} x={x - s / 2} y={y - s / 2} width={s} height={s} fill={c.col} opacity={(1 - e * 0.4) * (1 - k * 0.35)} />;
        });
      })}
    </g>
  );
};
