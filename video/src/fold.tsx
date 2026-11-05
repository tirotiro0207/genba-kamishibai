// 本当に折る折り紙（11/5 夕 作者の指示: 形を混ぜずに、紙を折り線で分けて、動く側を折り線を軸に回して倒す）。
// 紙は「面」（凸の多角形）の集まり。面ごとに、元の正方形からの写し（行列）・表か裏か・重なりの順を持つ。
// 1 手 = 1 本以上の折り線。動く側の面を折り線で裏返し、谷折りなら上へ、山折りなら下へ重ねる。折り目を付けて戻す手は 90° まで上げて戻す。
// 面の境目がそのまま折り目の線になる。面の絵は元の紙の絵を行列で写すので、折ると字も一緒に裏返る
import React from "react";
import { PAPER_EDGE, PAPER_FAR, type Pt } from "./paper";

/** SVG の matrix(a b c d e f): x' = a x + c y + e, y' = b x + d y + f */
export type Mat = [number, number, number, number, number, number];
export interface Facet { poly: Pt[]; m: Mat; up: boolean; z: number }
export interface FoldOp {
  line: [Pt, Pt];
  /** 動く側: 折り線の a→b の左（side>0）か右か。どちらの点で決めるかは move の点で渡す */
  move: Pt;
  /** 谷折り（動く側が手前に重なる）。false は山折り（向こうへ倒れて下に入る） */
  valley?: boolean;
  /** 折り目を付けて戻す（90° まで上げて戻す） */
  crease?: boolean;
  /** この凸の多角形の中だけを折る（めくる一部） */
  mask?: Pt[];
  /** 折る面を選ぶ（上に重なったフラップだけ、など） */
  pick?: (f: Facet) => boolean;
}
export interface FStep { id: string; label: string; ops: FoldOp[] }

const I: Mat = [1, 0, 0, 1, 0, 0];
const mul = (p: Mat, q: Mat): Mat => [
  p[0] * q[0] + p[2] * q[1],
  p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3],
  p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4],
  p[1] * q[4] + p[3] * q[5] + p[5],
];
const ap = (m: Mat, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const sideOf = ([a, b]: [Pt, Pt], p: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

/** 折り線を軸に c（cos。1 で元のまま、-1 で裏返しきる）だけ回す写し */
export function turnMat([a, b]: [Pt, Pt], c: number): Mat {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const k = 1 - c;
  const an = a[0] * nx + a[1] * ny;
  return [1 - k * nx * nx, -k * nx * ny, -k * nx * ny, 1 - k * ny * ny, k * an * nx, k * an * ny];
}

/** 凸の多角形を、直線の s の側（s * side ≥ 0）だけに切る */
function clip(poly: Pt[], line: [Pt, Pt], s: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = sideOf(line, p) * s;
    const dq = sideOf(line, q) * s;
    if (dp >= -1e-9) out.push(p);
    if ((dp >= -1e-9) !== (dq >= -1e-9)) {
      const u = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]);
    }
  }
  return area(out) > 0.5 ? out : [];
}
export function area(p: Pt[]) {
  let a = 0;
  for (let i = 0; i < p.length; i++) a += p[i][0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * p[i][1];
  return Math.abs(a) / 2;
}
/** 凸の mask の中と外に分ける（外は凸の切れ端の列） */
function splitMask(poly: Pt[], mask: Pt[]): { inn: Pt[]; out: Pt[][] } {
  // mask の向き（内側の符号）
  const c: Pt = [mask.reduce((s, p) => s + p[0], 0) / mask.length, mask.reduce((s, p) => s + p[1], 0) / mask.length];
  let rest = poly;
  const out: Pt[][] = [];
  for (let i = 0; i < mask.length && rest.length; i++) {
    const e: [Pt, Pt] = [mask[i], mask[(i + 1) % mask.length]];
    const sIn = Math.sign(sideOf(e, c)) || 1;
    const o = clip(rest, e, -sIn);
    if (o.length) out.push(o);
    rest = clip(rest, e, sIn);
  }
  return { inn: rest, out };
}

/** 1 つの折り線で、面を「残る」と「動く」に分ける */
function partition(facets: Facet[], op: FoldOp): { stay: Facet[]; mov: Facet[] } {
  const s = Math.sign(sideOf(op.line, op.move)) || 1;
  const stay: Facet[] = [];
  const mov: Facet[] = [];
  for (const f of facets) {
    if (op.pick && !op.pick(f)) {
      stay.push(f);
      continue;
    }
    const a = clip(f.poly, op.line, -s);
    const b = clip(f.poly, op.line, s);
    if (a.length) stay.push({ ...f, poly: a });
    if (!b.length) continue;
    if (op.mask) {
      const { inn, out } = splitMask(b, op.mask);
      for (const o of out) stay.push({ ...f, poly: o });
      if (inn.length) mov.push({ ...f, poly: inn });
    } else mov.push({ ...f, poly: b });
  }
  return { stay, mov };
}

/** 動いた面を折り線で裏返して、重なりの順を付け直す */
function land(stay: Facet[], mov: Facet[], op: FoldOp): Facet[] {
  if (op.crease || !mov.length) return [...stay, ...mov];
  const T = turnMat(op.line, -1);
  const zs = [...stay, ...mov].map((f) => f.z);
  const hi = Math.max(...zs);
  const lo = Math.min(...zs);
  const mHi = Math.max(...mov.map((f) => f.z));
  const mLo = Math.min(...mov.map((f) => f.z));
  const moved = mov.map((f) => ({
    poly: f.poly.map((p) => ap(T, p)),
    m: mul(T, f.m),
    up: !f.up,
    z: op.valley !== false ? hi + 1 + (mHi - f.z) : lo - 1 - (f.z - mLo),
  }));
  return [...stay, ...moved];
}
const renumber = (fs: Facet[]) => {
  const order = [...fs].sort((a, b) => a.z - b.z);
  return order.map((f, i) => ({ ...f, z: i }));
};

/** 手の列を折っていった、手ごとの紙（states[0] は折る前の正方形） */
export function foldAll(steps: FStep[], half = 100): Facet[][] {
  let cur: Facet[] = [{ poly: [[-half, -half], [half, -half], [half, half], [-half, half]], m: I, up: true, z: 0 }];
  const states = [cur];
  for (const st of steps) {
    for (const op of st.ops) {
      const { stay, mov } = partition(cur, op);
      cur = renumber(land(stay, mov, op));
    }
    states.push(cur);
  }
  return states;
}

/** 折り線を、紙の外へはみ出さない長さに切る（点線用） */
function seg(line: [Pt, Pt], fs: Facet[]) {
  const b = bbox(fs);
  const [a, c] = line;
  const dx = c[0] - a[0];
  const dy = c[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, a[0] - b.x0 + 6], [dx, b.x1 + 6 - a[0]], [-dy, a[1] - b.y0 + 6], [dy, b.y1 + 6 - a[1]]]) {
    if (Math.abs(p) < 1e-9) continue;
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
  }
  const P = (t: number) => `${(a[0] + dx * t).toFixed(1)} ${(a[1] + dy * t).toFixed(1)}`;
  return t1 > t0 ? `M${P(t0)}L${P(t1)}` : "";
}

/** 1 手の角度（0〜1 の進み u → 0〜π）。最初の 1/3 で持ち上げ、真ん中がいちばん速く、最後にぱたっと止まる */
export const foldAngle = (u: number) => {
  const v = Math.max(0, Math.min(1, u));
  const e = v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
  return e * Math.PI;
};

const path = (poly: Pt[]) => `M${poly.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join("L")}Z`;

/** 面を 1 枚描く（表は元の紙の絵を写して貼る・裏は無地のクリーム。紙の目を重ねる） */
const Face: React.FC<{ id: string; poly: Pt[]; m: Mat; showFront: boolean; pattern: string; light?: number; sw: number }> = ({ id, poly, m, showFront, pattern, light = 0, sw }) => (
  <g>
    <clipPath id={id}>
      <path d={path(poly)} />
    </clipPath>
    <g clipPath={`url(#${id})`}>
      {showFront ? (
        <g transform={`matrix(${m.map((v) => v.toFixed(5)).join(" ")})`}>
          <rect x={-104} y={-104} width={208} height={208} fill={`url(#${pattern})`} />
        </g>
      ) : (
        <path d={path(poly)} fill={PAPER_FAR} />
      )}
      {light !== 0 && <path d={path(poly)} fill={light > 0 ? "#fff" : "#2a2416"} opacity={Math.abs(light)} />}
    </g>
    <path d={path(poly)} fill="none" stroke={PAPER_EDGE} strokeWidth={sw} strokeLinejoin="round" />
  </g>
);

/**
 * 手の列の、進み p（手 i を終えた所が i）での紙。手 i の間は、手 i の折り線ごとに動く面を回して描く。
 * k は画面での倍率（線の太さをそろえるため）。id は clipPath の名前の頭
 */
export const FoldPaper: React.FC<{ steps: FStep[]; states: Facet[][]; p: number; pattern: string; k: number; id: string; hold?: number }> = ({ steps, states, p, pattern, k, id, hold = 0.12 }) => {
  const i = Math.max(0, Math.min(steps.length, Math.floor(p)));
  const sw = 1.6 / k;
  const draw = (fs: Facet[], key: string, tm?: Mat, flip?: boolean, light = 0) =>
    [...fs]
      .sort((a, b) => a.z - b.z)
      .map((f, j) => {
        const poly = tm ? f.poly.map((q) => ap(tm, q)) : f.poly;
        const m = tm ? mul(tm, f.m) : f.m;
        const front = flip ? !f.up : f.up;
        return <Face key={`${key}${j}`} id={`${id}-${key}${j}`} poly={poly} m={m} showFront={front} pattern={pattern} sw={sw} light={light} />;
      });
  if (i >= steps.length || p - i <= 0) return <g>{draw(states[i], "s")}</g>;
  const step = steps[i];
  const u = Math.min(1, (p - i) / (1 - hold));
  // 手の中の折り線を順に分ける（同時に回す）
  let rest = states[i];
  const moving: { mov: Facet[]; op: FoldOp }[] = [];
  for (const op of step.ops) {
    const { stay, mov } = partition(rest, op);
    rest = stay;
    moving.push({ mov, op });
  }
  const th = foldAngle(u);
  return (
    <g>
      {/* 山折りで向こうへ倒れる面は、残る紙の下に */}
      {moving.filter((m) => m.op.valley === false && !m.op.crease).map((m, j) => {
        const c = Math.cos(th);
        return <g key={`b${j}`}>{draw(m.mov, `b${j}-`, turnMat(m.op.line, c), c < 0, -0.15 * Math.sin(th))}</g>;
      })}
      {draw(rest, "s")}
      {moving.filter((m) => m.op.valley !== false || m.op.crease).map((m, j) => {
        const ang = m.op.crease ? Math.sin(u * Math.PI) * (Math.PI / 2) : th;
        const c = Math.cos(ang);
        const lift = Math.sin(ang);
        const T = turnMat(m.op.line, c);
        // 持ち上がった面の影（少しずれて、残る紙の上に落ちる）
        const sh = turnMat(m.op.line, c * 0.9 + (c >= 0 ? 0.1 : -0.1) * 0);
        return (
          <g key={`f${j}`}>
            {lift > 0.02 &&
              m.mov.map((f, q) => (
                <path key={q} d={path(f.poly.map((pt) => ap(sh, pt)).map(([x, y]) => [x + 4 * lift, y + 7 * lift] as Pt))} fill="#3b3320" opacity={0.2 * lift} />
              ))}
            {draw(m.mov, `f${j}-`, T, c < 0, (c > 0 ? 0.14 : -0.1) * lift)}
            {/* 折り線（回っている間だけ点線） */}
            <path d={seg(m.op.line, states[i])} stroke="#2b2550" strokeWidth={1.6 / k} strokeDasharray={`${5 / k} ${4 / k}`} opacity={0.4 * Math.min(1, lift * 3)} />
          </g>
        );
      })}
    </g>
  );
};

/** 面の集まりを、そのまま描く（組んだあとの紙の人の部品など） */
export const Facets: React.FC<{ fs: Facet[]; pattern: string; k: number; id: string }> = ({ fs, pattern, k, id }) => (
  <g>
    {[...fs]
      .sort((a, b) => a.z - b.z)
      .map((f, j) => (
        <Face key={j} id={`${id}-${j}`} poly={f.poly} m={f.m} showFront={f.up} pattern={pattern} sw={1.6 / k} />
      ))}
  </g>
);

/** 面を凸の多角形で切り出す（紙の人の部品分け） */
export function cut(fs: Facet[], region: Pt[]): Facet[] {
  return fs.flatMap((f) => {
    const { inn } = splitMask(f.poly, region);
    return inn.length ? [{ ...f, poly: inn }] : [];
  });
}
export const translateFacets = (fs: Facet[], dx: number, dy: number): Facet[] => {
  const T: Mat = [1, 0, 0, 1, dx, dy];
  return fs.map((f) => ({ ...f, poly: f.poly.map((p) => ap(T, p)), m: mul(T, f.m) }));
};
export const bbox = (fs: Facet[]) => {
  const ps = fs.flatMap((f) => f.poly);
  return { x0: Math.min(...ps.map((p) => p[0])), x1: Math.max(...ps.map((p) => p[0])), y0: Math.min(...ps.map((p) => p[1])), y1: Math.max(...ps.map((p) => p[1])) };
};
