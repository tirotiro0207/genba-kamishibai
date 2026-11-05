// 体が細かいドットに分かれて、1 つの点（ポータルの口）へ吸い込まれる仕組み（v4 でも使う部品。11/5 夜）。
// 人の絵は、マスクで小さな四角に切って順に消し、消えた四角の所から同じ色のドットが出て、渦を巻きながら吸い込まれる。
// ドットが出る所は人の形のあらまし（頭・胴・脚。リュックがあれば背中の箱）に絞り、何も無い所からドットが出ないようにする
import React from "react";
import { interpolate } from "remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const hash = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
interface Box { x0: number; y0: number; x1: number; y1: number }
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
  const cells: { x: number; y: number; thr: number; i: number }[] = [];
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
        cells.push({ x, y, thr: Math.min(0.62, d * 0.45 + hash(i) * 0.17), i });
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
        const e = q * q;
        // 渦: 口のまわりを回りながら近づく
        const ang = Math.atan2(c.y - to[1], c.x - to[0]) + e * 1.6 * (hash(c.i + 7) > 0.5 ? 1 : -1);
        const r = Math.hypot(c.x - to[0], c.y - to[1]) * (1 - e);
        const x = to[0] + Math.cos(ang) * r;
        const y = to[1] + Math.sin(ang) * r;
        const s = cell * (1 - e * 0.7);
        return <rect key={c.i} x={x - s / 2} y={y - s / 2} width={s} height={s} fill={color[c.i % color.length]} opacity={1 - e * 0.5} />;
      })}
    </g>
  );
};
