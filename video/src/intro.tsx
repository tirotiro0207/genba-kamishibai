// 冒頭 0:00〜0:13（コマ 0〜389）の白地の段。11/5 夕の直し（作者の指示）:
// 見出し 2 つが下から同時にワッと出る → 時計 → 手書きの印刷口 → 紙を 1 枚ずつ一気に刷る → 2 枚を同時に、めくって重ねて折る
// → 体の紙と脚の紙を組んで紙の人ができた瞬間に弾む → 吹き出し「紙芝居にします！」→ 右から木の枠を引っぱり込み、左へ走って消える。
// 0:13.0（コマ 390）で枠が真ん中に止まっているのは、前の版と同じ（後ろの場面がそこから始まるため）。
// 折る動き: 手順の前の形を「折り線」で 2 つに切り、片側を折り線を軸に回して重ねる（見かけの幅が cos で縮み、半分を越えると裏の面が見える・下に影が動く）。
// 手本の手順には折り線の無い手順もあるので、折ったあとの形にいちばんよく重なる線を、折ったあとの形の角どうしを結ぶ線から探す
import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { POSES } from "../../src/shared/picto/poses";
import { BODY_STEPS, JOIN_STEPS, type Layer, LEG_STEPS, MOVE, type Shade, SheetPatterns, type Step } from "./origami";
import { gait, mixAngles, PAPER_EDGE, PAPER_FAR, PaperDefs, PaperPerson, type Pt, Shadow } from "./paper";
import { Clocks, FONT_JP, FONT_PEN, FRAME, StageFrame, WobbleDefs } from "./parts";
import { CLOCKS, FIGURE_K, FPS, GROUND, H, INK, PERSON_H, W } from "./timeline";

export const INTRO_FRAMES = 390;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const sec = (s: number) => Math.round(s * FPS);
const ease = Easing.inOut(Easing.cubic);
const easeIO = (m: number) => (m < 0.5 ? 2 * m * m : 1 - (-2 * m + 2) ** 2 / 2);

// ---- 時間割（コマ） ----
/** 見出し 2 つが下から上がる（0:00.0〜0:00.4・行き過ぎて戻る） */
const POP = 12;
/** 時計の線を描く・針が回り出す */
const DIAL_DRAW: [number, number] = [10, 28];
const HANDS_AT = 30;
/** 印刷口を手で描く */
const MOUTH: [number, number] = [64, 78];
/** 1 枚を刷る長さ（0.8 秒）と、刷り終えた紙が置き場へ動く長さ */
const PRINT = 24;
const P1 = 78;
const P2 = P1 + PRINT;
const SLIDE = 12;
/** 2 枚を同時に折る */
const FOLD_START = P2 + PRINT + SLIDE - 2; // 136（0:04.5）
const FOLD_END = 228;
/** 組む・仕上げ（7 手順を 6 コマずつ） */
const JOIN_START = 232;
const JOIN_STEP = 6;
const DONE = JOIN_START + JOIN_STEPS.length * JOIN_STEP; // 274（0:09.1）
/** 紙の人に入れ替える・吹き出し */
const SWAP = DONE + 2;
const BUBBLE = DONE + 4;
/** 枠を引っぱる（前の版の s6 と同じ 3 秒） */
const PULL = 300;

// ---- 置き場 ----
const MOUTH_X = CLOCKS.text;
const MOUTH_Y = CLOCKS.labelY + 30;
const MOUTH_W = 400;
/** 紙の倍率（紙は 200 の正方形。320 px） */
const K = 1.6;
const HALF = 100 * K;
const SLOT_BODY = { x: 360, y: 410 };
const SLOT_LEGS = { x: 920, y: 410 };
const FIG_X = 640;

// ---- 形の計算 ----
const area = (p: Pt[]) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i];
    const [x1, y1] = p[(i + 1) % p.length];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
};
const side = ([a, b]: [Pt, Pt], p: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
/** 多角形を折り線で切って、s の側（s * side ≥ 0）だけを残す */
function clipHalf(poly: Pt[], line: [Pt, Pt], s: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = side(line, p) * s;
    const dq = side(line, q) * s;
    if (dp >= 0) out.push(p);
    if ((dp >= 0) !== (dq >= 0)) {
      const u = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]);
    }
  }
  return out.length >= 3 ? out : [];
}
const proj = (p: Pt, [a, b]: [Pt, Pt]): Pt => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const u = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1);
  return [a[0] + dx * u, a[1] + dy * u];
};
/** 折り線を軸に、面を c（1 で元のまま、-1 で裏返しきる）だけ回した形 */
const turn = (poly: Pt[], line: [Pt, Pt], c: number): Pt[] =>
  poly.map((p) => {
    const q = proj(p, line);
    return [q[0] + (p[0] - q[0]) * c, q[1] + (p[1] - q[1]) * c] as Pt;
  });
function inside(poly: Pt[], [x, y]: Pt) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const inAny = (polys: Pt[][], p: Pt) => polys.some((q) => q.length >= 3 && inside(q, p));
const path = (poly: Pt[]) => `M${poly.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("L")}Z`;

/** 形を同じ点の数に並べ直す（動かすとき、ねじれないように時計回り・上の左から） */
function resample(poly: Pt[], n = 48): Pt[] {
  let a = 0;
  for (let i = 0; i < poly.length; i++) a += poly[i][0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * poly[i][1];
  const p0 = a < 0 ? [...poly].reverse() : poly;
  let s = 0;
  p0.forEach((q, i) => {
    if (q[1] < p0[s][1] - 0.01 || (Math.abs(q[1] - p0[s][1]) <= 0.01 && q[0] < p0[s][0])) s = i;
  });
  const p = [...p0.slice(s), ...p0.slice(0, s)];
  const lens = p.map((q, i) => Math.hypot(p[(i + 1) % p.length][0] - q[0], p[(i + 1) % p.length][1] - q[1]));
  const total = lens.reduce((x, y) => x + y, 0) || 1;
  const out: Pt[] = [];
  let e = 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const want = (i / n) * total;
    while (e < p.length - 1 && acc + lens[e] < want) acc += lens[e++];
    const t = lens[e] ? (want - acc) / lens[e] : 0;
    const q0 = p[e];
    const q1 = p[(e + 1) % p.length];
    out.push([q0[0] + (q1[0] - q0[0]) * t, q0[1] + (q1[1] - q0[1]) * t]);
  }
  return out;
}
const lerp = (a: Pt[], b: Pt[], t: number): Pt[] => a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t]);

const stateOf = (s: Step): Layer[] => [...s.layers, ...(s.flaps ?? []).filter((f) => !f.open)];

/** 折り線の見つけ方: 前の形の片側を線で裏返したものが、あとの形にいちばんよく重なる線（あとの形の角どうしを結ぶ線から選ぶ） */
interface AutoFold { line: [Pt, Pt]; s: number }
const foldCache = new Map<string, AutoFold | null>();
function findFold(key: string, A: Layer[], B: Layer[], creases: [Pt, Pt][] = []): AutoFold | null {
  if (foldCache.has(key)) return foldCache.get(key)!;
  const a = A.map((l) => l.poly);
  const b = B.map((l) => l.poly);
  const all = [...a, ...b].flat();
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const N = 22;
  const grid: Pt[] = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) grid.push([x0 + ((i + 0.5) / N) * (x1 - x0), y0 + ((j + 0.5) / N) * (y1 - y0)]);
  const target = grid.map((p) => inAny(b, p));
  const nT = target.filter(Boolean).length || 1;
  const miss = (pred: (p: Pt) => boolean) => grid.reduce((n, p, i) => n + (pred(p) !== target[i] ? 1 : 0), 0);
  const base = miss((p) => inAny(a, p));
  let best: AutoFold | null = null;
  if (base / nT > 0.05) {
    const areaA = a.reduce((s, p) => s + area(p), 0);
    const verts: Pt[] = [];
    for (const p of b.flat()) if (!verts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 2)) verts.push(p);
    const lines: [Pt, Pt][] = [...creases];
    for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) if (Math.hypot(verts[i][0] - verts[j][0], verts[i][1] - verts[j][1]) > 12) lines.push([verts[i], verts[j]]);
    let bestMiss = base * 0.6;
    for (const line of lines) {
      for (const s of [1, -1]) {
        const mov = a.map((p) => clipHalf(p, line, -s)).filter((p) => p.length);
        const movA = mov.reduce((t, p) => t + area(p), 0);
        if (movA < areaA * 0.06 || movA > areaA * 0.94) continue;
        const stay = a.map((p) => clipHalf(p, line, s)).filter((p) => p.length);
        const back = mov.map((p) => turn(p, line, -1));
        const m = miss((p) => inAny(stay, p) || inAny(back, p));
        if (m < bestMiss) {
          bestMiss = m;
          best = { line, s };
        }
      }
    }
  }
  foldCache.set(key, best);
  return best;
}

/**
 * 手順の列の、進み p（手順 i を終えた所が i）での紙。
 * 折る手順は「片側を持ち上げて、折り線を軸に回して、重ねる」。回る面の下には影が動き、半分を越えると裏の面が見える。折り終えたら折り線が残る
 */
const FoldSheet: React.FC<{ steps: Step[]; p: number; pattern: string; prev?: Step; tag: string }> = ({ steps, p, pattern, prev, tag }) => {
  const i = Math.max(0, Math.min(steps.length - 1, Math.floor(p)));
  const step = steps[i];
  const before = i > 0 ? steps[i - 1] : prev;
  const raw = Math.min(1, (p - i) / MOVE);
  const t = before && p < steps.length ? easeIO(raw) : 1;
  const fill = (s: Shade, own?: string) => (s === 0 ? `url(#${own ?? pattern})` : s === 1 ? PAPER_FAR : "#ddd1b2");
  const backOf = (s: Shade): Shade => (s === 0 ? 1 : 2);
  const from = before ? stateOf(before) : step.layers;
  const edge = { stroke: PAPER_EDGE, strokeWidth: 2.2 / K, strokeLinejoin: "round" as const };
  const creases = (lines: [Pt, Pt][]) =>
    lines.map(([a, b], j) => <path key={`c${j}`} d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} stroke={PAPER_EDGE} strokeWidth={1.6 / K} opacity={0.8} />);
  const foldLine = (line: [Pt, Pt]) => <path d={`M${line[0][0]} ${line[0][1]}L${line[1][0]} ${line[1][1]}`} stroke={INK} strokeWidth={2 / K} strokeDasharray={`${6 / K} ${5 / K}`} opacity={0.5} />;
  /** 回る面とその影（c は cos。影は面が持ち上がっている間だけ、少しずれて下に落ちる） */
  const flapOf = (poly: Pt[], line: [Pt, Pt], c: number, shade: Shade, key: string, own?: string) => {
    const lift = Math.sqrt(Math.max(0, 1 - c * c));
    const shadow = turn(poly, line, c * 0.92).map(([x, y]) => [x + 5 * lift, y + 8 * lift] as Pt);
    const face = c > 0 ? shade : backOf(shade);
    return (
      <g key={key}>
        {lift > 0.02 && <path d={path(shadow)} fill="#3b3320" opacity={0.18 * lift} />}
        <path d={path(turn(poly, line, c))} fill={fill(face, c > 0 ? own : undefined)} {...edge} />
        {/* 持ち上がった面の光（めくれの手ざわり） */}
        {lift > 0.1 && <path d={path(turn(poly, line, c))} fill={c > 0 ? "#fff" : "#000"} opacity={0.12 * lift} />}
      </g>
    );
  };

  // 1. 手本に折り線がある手順（フラップ）
  if (step.flaps?.length) {
    const layers = step.layers;
    const tf = Math.min(1, t / 0.9);
    return (
      <g>
        <g {...edge}>{layers.map((l, j) => <path key={j} d={path(l.poly)} fill={fill(l.shade, l.fill)} />)}</g>
        {step.flaps.map((f, j) => {
          if (t >= 1 && f.open) return null;
          const pre = turn(f.poly, f.line, -1);
          const k = f.open ? Math.sin(tf * Math.PI) : tf;
          return flapOf(pre, f.line, Math.cos(k * Math.PI), f.shade === 2 ? 1 : 0, `f${j}`);
        })}
        {t >= 1 || !before ? creases(step.creases ?? []) : step.flaps.map((f, j) => <g key={j}>{foldLine(f.line)}</g>)}
      </g>
    );
  }
  // 2. 裏返す
  if (step.flip) {
    const sx = Math.max(0.04, Math.abs(Math.cos(t * Math.PI)));
    const layers = t < 0.5 ? from : step.layers;
    return (
      <g transform={`scale(${sx} 1)`}>
        <g {...edge}>{layers.map((l, j) => <path key={j} d={path(l.poly)} fill={fill(t < 0.5 ? l.shade : l.shade, l.fill)} />)}</g>
        {t >= 1 && creases(step.creases ?? [])}
      </g>
    );
  }
  // 3. 向きを変える（横にする）
  if (step.id === "L7" && t < 1) {
    const th = (t * Math.PI) / 2;
    const rot = (poly: Pt[]) => poly.map(([x, y]) => [x * Math.cos(th) + y * Math.sin(th), -x * Math.sin(th) + y * Math.cos(th)] as Pt);
    return <g {...edge}>{from.map((l, j) => <path key={j} d={path(rot(l.poly))} fill={fill(l.shade, l.fill)} />)}</g>;
  }
  // 4. 折り線を探して折る
  const auto = before && t < 1 ? findFold(`${tag}:${step.id}`, from, step.layers, step.creases) : null;
  if (auto) {
    const tf = Math.min(1, t / 0.82);
    const fade = interpolate(t, [0.82, 1], [0, 1], clamp);
    const c = Math.cos(tf * Math.PI);
    return (
      <g>
        <g opacity={1 - fade}>
          <g {...edge}>
            {from.map((l, j) => {
              const stay = clipHalf(l.poly, auto.line, auto.s);
              return stay.length ? <path key={j} d={path(stay)} fill={fill(l.shade, l.fill)} /> : null;
            })}
          </g>
          {from.map((l, j) => {
            const mov = clipHalf(l.poly, auto.line, -auto.s);
            return mov.length ? flapOf(mov, auto.line, c, l.shade, `m${j}`, l.fill) : null;
          })}
          {foldLine(auto.line)}
        </g>
        {fade > 0 && (
          <g opacity={fade} {...edge}>
            {step.layers.map((l, j) => <path key={j} d={path(l.poly)} fill={fill(l.shade, l.fill)} />)}
          </g>
        )}
      </g>
    );
  }
  // 5. 形だけ変える（折り線の無い手順・止まっているとき）
  const k = t;
  const layers =
    k >= 1
      ? step.layers
      : Array.from({ length: Math.max(step.layers.length, from.length) }, (_, j) => {
          const a = from[Math.min(j, from.length - 1)];
          const b = step.layers[Math.min(j, step.layers.length - 1)];
          const c = k < 0.5 ? a : b;
          return { poly: lerp(resample(a.poly), resample(b.poly), k), shade: c.shade, fill: c.fill };
        });
  return (
    <g>
      <g {...edge}>{layers.map((l, j) => <path key={j} d={path(l.poly)} fill={fill(l.shade, l.fill)} />)}</g>
      {(t >= 1 || !before) && creases(step.creases ?? [])}
    </g>
  );
};

// ---- 見出し・時計・印刷口 ----

/** 見出し 2 つ（下からワッと出る。行き過ぎて戻る） */
const Labels: React.FC<{ g: number; o: number }> = ({ g, o }) => {
  const up = interpolate(g, [0, POP], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2.6)) });
  const op = interpolate(g, [0, 4], [0, 1], clamp);
  return (
    <g opacity={op * o} transform={`translate(0 ${(1 - up) * 90})`}>
      {[
        [CLOCKS.text, "文書で読む"],
        [CLOCKS.card, "絵のカードで読む"],
      ].map(([x, s]) => (
        <text key={s} x={x} y={CLOCKS.labelY} textAnchor="middle" fontFamily={FONT_JP} fontSize={34} fontWeight={700} fill={INK}>
          {s}
        </text>
      ))}
    </g>
  );
};

/** 手で描いた印刷機の印刷口（横長の口・ふちの厚み・口の奥の影）。p は描けた割合 */
const Mouth: React.FC<{ p: number; o: number; busy: number }> = ({ p, o, busy }) => {
  if (p <= 0 || o <= 0) return null;
  const x0 = MOUTH_X - MOUTH_W / 2;
  const y0 = MOUTH_Y - 16;
  const dash = { pathLength: 1, strokeDasharray: `${p} 1` };
  // 刷っている間は口が小さく震える
  const shake = busy > 0 ? Math.sin(busy * 2.1) * 1.2 : 0;
  return (
    <g opacity={o} transform={`translate(0 ${shake})`}>
      <g filter="url(#wobble)">
        {/* 口の奥の影 */}
        <rect x={x0 + 14} y={y0 + 12} width={(MOUTH_W - 28) * p} height={10} rx={5} fill={INK} opacity={0.85} />
        {/* 外のふち（上の厚み） */}
        <path d={`M${x0} ${y0 + 26}L${x0} ${y0 + 4}Q${x0} ${y0} ${x0 + 6} ${y0}L${x0 + MOUTH_W - 6} ${y0}Q${x0 + MOUTH_W} ${y0} ${x0 + MOUTH_W} ${y0 + 4}L${x0 + MOUTH_W} ${y0 + 26}`} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" {...dash} />
        {/* 下のくちびる（紙が出てくる所） */}
        <path d={`M${x0 - 10} ${y0 + 28}L${x0 + MOUTH_W + 10} ${y0 + 28}`} stroke={INK} strokeWidth={6} strokeLinecap="round" {...dash} />
        <path d={`M${x0 + 4} ${y0 + 34}L${x0 + MOUTH_W - 4} ${y0 + 34}`} stroke={INK} strokeWidth={2.5} strokeLinecap="round" opacity={0.6} {...dash} />
      </g>
    </g>
  );
};

/** 刷られて出てくる紙。q は出た割合（上の行から順に見える）。紙の上の端は口に付いたまま */
const PrintingSheet: React.FC<{ q: number; pattern: string; id: string }> = ({ q, pattern, id }) => {
  const top = MOUTH_Y + 12;
  const len = 2 * HALF * q;
  return (
    <g>
      <defs>
        <clipPath id={`out-${id}`}>
          <rect x={0} y={top} width={W} height={len} />
        </clipPath>
        <linearGradient id={`curl-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.16} />
        </linearGradient>
      </defs>
      <g clipPath={`url(#out-${id})`} filter="url(#sheet-shadow)">
        <g transform={`translate(${MOUTH_X} ${top + HALF}) scale(${K})`}>
          <rect x={-100} y={-100} width={200} height={200} fill={`url(#${pattern})`} stroke={PAPER_EDGE} strokeWidth={2.2 / K} />
        </g>
      </g>
      {/* 出てくる先の端は少し反って影になる */}
      {q > 0 && q < 1 && <rect x={MOUTH_X - HALF} y={top + len - 18} width={2 * HALF} height={18} fill={`url(#curl-${id})`} />}
    </g>
  );
};

// ---- 組む ----
const FIG = `translate(${FIG_X} ${GROUND}) scale(${FIGURE_K})`;
const toFig = (poly: Pt[], x: number, y: number, k: number): Pt[] => poly.map(([px, py]) => [(x + px * k - FIG_X) / FIGURE_K, (y + py * k - GROUND) / FIGURE_K] as Pt);
/** 組む前の 2 つの部品（左に体、右に脚）を、紙の人の座標に移したもの。ここから C1 へ動く */
const BEFORE_JOIN: Step = (() => {
  const legs = LEG_STEPS[LEG_STEPS.length - 1].layers;
  const body = BODY_STEPS[BODY_STEPS.length - 1].layers;
  return {
    id: "before",
    label: "",
    layers: [
      ...legs.map((l) => ({ ...l, poly: toFig(l.poly, SLOT_LEGS.x, SLOT_LEGS.y, K) })),
      ...body.map((l) => ({ ...l, poly: toFig(l.poly, SLOT_BODY.x, SLOT_BODY.y, K), fill: l.fill ? "torso-j-up" : undefined })),
    ],
  };
})();

// ---- 枠を引っぱる（前の版の s6 と同じ動き。11/5 夜 v4: 枠が大きいので 0.2 秒遅く着き、大きく弾む） ----
const WALK_END = sec(0.5);
const HAND = (58 * PERSON_H) / 356;
const PULL_END = sec(1.7);
const RUN_AT = sec(2.0);
const frameCx = (f: number) =>
  f < WALK_END
    ? interpolate(f, [0, WALK_END], [W + FRAME.w / 2 + 40, W + FRAME.w / 2 - 170], { ...clamp, easing: Easing.out(Easing.quad) })
    : interpolate(f, [WALK_END, PULL_END], [W + FRAME.w / 2 - 170, W / 2], { ...clamp, easing: Easing.inOut(Easing.quad) });

const BUBBLE_TEXT = "紙芝居にします！";

/** 冒頭 0:00〜0:13 の 1 コマ（g は冒頭からのコマ） */
export const Intro: React.FC<{ g?: number }> = ({ g: gIn }) => {
  const cur = useCurrentFrame();
  const g = gIn ?? cur;

  // 見出し・時計・印刷口の濃さ
  const clocksO = interpolate(g, [P1, P1 + 18], [1, 0], clamp);
  const headO = interpolate(g, [FOLD_START - 8, FOLD_START + 4], [1, 0], clamp);
  const dialP = interpolate(g, DIAL_DRAW, [0, 1], clamp);
  const mouthP = interpolate(g, MOUTH, [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const busy = (g >= P1 && g < P2 + PRINT) ? g - P1 : 0;

  // 紙 1（脚になる）と紙 2（体になる）
  const q1 = interpolate(g, [P1, P1 + PRINT], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const q2 = interpolate(g, [P2, P2 + PRINT], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const out = { x: MOUTH_X, y: MOUTH_Y + 12 + HALF };
  const m1 = interpolate(g, [P1 + PRINT, P1 + PRINT + SLIDE], [0, 1], { ...clamp, easing: ease });
  const m2 = interpolate(g, [P2 + PRINT, P2 + PRINT + SLIDE], [0, 1], { ...clamp, easing: ease });
  const at = (m: number, to: { x: number; y: number }) => ({ x: out.x + (to.x - out.x) * m, y: out.y + (to.y - out.y) * m - Math.sin(m * Math.PI) * 40, r: Math.sin(m * Math.PI) * -5 });

  // 折る進み（2 枚同時。脚 11 手順・体 18 手順を同じ長さで）
  const fp = interpolate(g, [FOLD_START, FOLD_END], [0, 1], clamp);
  const legP = Math.min(LEG_STEPS.length - 0.001, fp * LEG_STEPS.length);
  const bodyP = Math.min(BODY_STEPS.length - 0.001, fp * BODY_STEPS.length);
  const folding = g >= FOLD_START && g < JOIN_START;
  const joinP = Math.min(JOIN_STEPS.length - 0.001, Math.max(0, (g - JOIN_START) / JOIN_STEP));

  // 説明の大きな字（折り始めにドーンと出て、完成まで残る）
  const bigIn = interpolate(g, [FOLD_START, FOLD_START + 8], [0, 1], { ...clamp, easing: Easing.out(Easing.back(3)) });
  const bigO = interpolate(g, [FOLD_START, FOLD_START + 3, DONE + 4, DONE + 12], [0, 1, 1, 0], clamp);

  // できあがりの瞬間: 小さく弾んで光る
  const pop = g >= DONE && g < DONE + 8 ? 1 + 0.07 * Math.sin(((g - DONE) / 8) * Math.PI) : 1;
  const shine = interpolate(g, [DONE, DONE + 3, DONE + 12], [0, 1, 0], clamp);
  const swap = interpolate(g, [SWAP, SWAP + 6], [0, 1], clamp);

  // 吹き出し
  const bub = interpolate(g, [BUBBLE, BUBBLE + 7], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2)) });
  const bubO = interpolate(g, [PULL + 8, PULL + 16], [1, 0], clamp);

  // 枠を引っぱる
  const f = g - PULL;
  const pulling = f >= 0;
  const cx = frameCx(Math.max(0, f));
  const edgeX = cx - FRAME.w / 2;
  let x = FIG_X;
  let angles = mixAngles(POSES.stand, POSES.wave, interpolate(g, [SWAP + 2, SWAP + 10], [0, 1], clamp) * (0.75 + 0.25 * Math.sin((g / FPS) * Math.PI * 3)));
  let facing: "left" | "right" = "right";
  if (pulling) {
    if (f < WALK_END) {
      x = interpolate(f, [0, WALK_END], [FIG_X, W + FRAME.w / 2 - 170 - FRAME.w / 2 - HAND], { ...clamp, easing: Easing.inOut(Easing.quad) });
      angles = gait("walk", f / sec(0.5));
    } else if (f < PULL_END) {
      x = edgeX - HAND;
      const st = gait("walk", (f - WALK_END) / sec(0.45));
      angles = mixAngles(POSES.pull, { ...POSES.pull, leg_near_upper: st.leg_near_upper, leg_near_lower: st.leg_near_lower, leg_far_upper: st.leg_far_upper, leg_far_lower: st.leg_far_lower }, 0.6);
    } else if (f < RUN_AT) {
      x = edgeX - HAND;
      angles = mixAngles(POSES.pull, POSES.stand, interpolate(f, [PULL_END, RUN_AT], [0, 1], clamp));
    } else {
      facing = "left";
      x = interpolate(f, [RUN_AT, sec(2.6)], [edgeX - HAND, -300], { ...clamp, easing: Easing.in(Easing.quad) });
      angles = gait("run", (f - RUN_AT) / sec(0.2));
    }
  }
  const bob = facing === "left" ? Math.abs(Math.sin(((f - RUN_AT) / sec(0.2)) * Math.PI)) * -14 : 0;
  const bounce = f >= PULL_END && f < PULL_END + 10 ? Math.sin(((f - PULL_END) / 10) * Math.PI) * -16 : 0;
  const puff = pulling ? interpolate(f - PULL_END, [0, 6, 22], [0, 0.55, 0], clamp) : 0;
  const tata = pulling ? interpolate(f, [RUN_AT, RUN_AT + 4, sec(2.9)], [0, 1, 0], clamp) : 0;
  const dust = pulling && f > RUN_AT ? [0, 1, 2].map((i) => ({ x: x + 70 + i * 70, o: interpolate(f - RUN_AT - i * 3, [0, 6, 18], [0, 0.5, 0], clamp), r: 16 + i * 6 })) : [];
  // 名のりで 1 回跳ねる
  const hop = g >= SWAP + 16 && g < SWAP + 24 ? Math.sin(((g - SWAP - 16) / 8) * Math.PI) * 26 : 0;

  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <PaperDefs />
        <SheetPatterns />
        <WobbleDefs />
        <defs>
          <filter id="sheet-shadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx={0} dy={6} stdDeviation={6} floodColor="#3b3320" floodOpacity={0.22} />
          </filter>
          <radialGradient id="shine" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fff6c8" stopOpacity={0.95} />
            <stop offset="1" stopColor="#fff6c8" stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="#fbfaf5" />

        {/* 時計（見出しは下から出す方を使うので、ここでは描かない） */}
        {clocksO > 0 && g >= DIAL_DRAW[0] && <Clocks g={g + (sec(2.5) - HANDS_AT)} draw={[0, 0, dialP, dialP]} opacity={clocksO} />}
        <Labels g={g} o={headO} />
        <Mouth p={mouthP} o={headO} busy={busy} />

        {/* 印刷: 1 枚目（脚）→ 2 枚目（体）。刷り終えたら置き場へ */}
        {g >= P1 && g < FOLD_START && (
          m1 <= 0 ? (
            <PrintingSheet q={q1} pattern="sheet-legs" id="a" />
          ) : (
            <g transform={`translate(${at(m1, SLOT_LEGS).x} ${at(m1, SLOT_LEGS).y}) rotate(${at(m1, SLOT_LEGS).r}) scale(${K})`} filter="url(#sheet-shadow)">
              <FoldSheet steps={LEG_STEPS} p={0} pattern="sheet-legs" tag="legs" />
            </g>
          )
        )}
        {g >= P2 && g < FOLD_START && (
          m2 <= 0 ? (
            <PrintingSheet q={q2} pattern="sheet-body" id="b" />
          ) : (
            <g transform={`translate(${at(m2, SLOT_BODY).x} ${at(m2, SLOT_BODY).y}) rotate(${at(m2, SLOT_BODY).r}) scale(${K})`} filter="url(#sheet-shadow)">
              <FoldSheet steps={BODY_STEPS} p={0} pattern="sheet-body" tag="body" />
            </g>
          )
        )}

        {/* 2 枚を同時に折る */}
        {folding && (
          <>
            <g transform={`translate(${SLOT_BODY.x} ${SLOT_BODY.y}) scale(${K})`} filter="url(#sheet-shadow)">
              <FoldSheet steps={BODY_STEPS} p={bodyP} pattern="sheet-body" tag="body" />
            </g>
            <g transform={`translate(${SLOT_LEGS.x} ${SLOT_LEGS.y}) scale(${K})`} filter="url(#sheet-shadow)">
              <FoldSheet steps={LEG_STEPS} p={legP} pattern="sheet-legs" tag="legs" />
            </g>
          </>
        )}

        {/* 組む・仕上げ → できあがり */}
        {g >= JOIN_START && swap < 1 && (
          <>
            <Shadow x={FIG_X} ground={GROUND} w={110} opacity={interpolate(g, [JOIN_START, JOIN_START + 8], [0, 0.18], clamp)} />
            <g transform={`${FIG} translate(0 ${-((pop - 1) * 300)}) scale(${pop})`} opacity={1 - swap} filter="url(#sheet-shadow)">
              <FoldSheet steps={JOIN_STEPS} p={joinP} pattern="sheet-body" prev={BEFORE_JOIN} tag="join" />
            </g>
          </>
        )}
        {shine > 0 && (
          <g opacity={shine}>
            <ellipse cx={FIG_X} cy={GROUND - PERSON_H / 2} rx={260} ry={330} fill="url(#shine)" />
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2;
              const r0 = 300 + shine * 20;
              return <path key={i} d={`M${FIG_X + Math.cos(a) * r0 * 0.75} ${GROUND - PERSON_H / 2 + Math.sin(a) * r0}l${Math.cos(a) * 40} ${Math.sin(a) * 40}`} stroke={INK} strokeWidth={5} strokeLinecap="round" />;
            })}
          </g>
        )}

        {/* 説明の大きな字 */}
        {bigO > 0 && (
          <g opacity={bigO} transform={`translate(${W / 2} 92) scale(${0.6 + bigIn * 0.4})`}>
            <text x={0} y={0} textAnchor="middle" fontFamily={FONT_PEN} fontSize={58} fontWeight={700} fill={INK} stroke="#fbfaf5" strokeWidth={10} paintOrder="stroke" filter="url(#wobble)">
              文字の情報を、折りたたんで、絵にする。
            </text>
          </g>
        )}

        {/* 枠を引っぱる */}
        {pulling && (
          <>
            <g transform={`translate(0 ${bounce})`}>
              <StageFrame cx={cx} />
            </g>
            {puff > 0 && [-1, -0.4, 0.4, 1].map((k) => <ellipse key={k} cx={W / 2 + k * (FRAME.w / 2)} cy={FRAME.cy + FRAME.h / 2 + 18 - puff * 10} rx={40 + puff * 40} ry={14 + puff * 8} fill="#d8cfbf" opacity={puff} />)}
            {tata > 0 && (
              <g opacity={tata}>
                {[0, 1, 2].map((i) => <path key={i} d={`M${x + 90 + i * 10} ${GROUND - 300 + i * 70}h${120 + i * 30}`} stroke={INK} strokeWidth={4} strokeLinecap="round" filter="url(#wobble)" />)}
                <text x={Math.max(60, x + 60)} y={GROUND - 20} fontFamily={FONT_PEN} fontSize={44} fill={INK} transform={`rotate(-8 ${Math.max(60, x + 60)} ${GROUND - 20})`}>
                  タタタ
                </text>
              </g>
            )}
            {dust.map((p, i) => <circle key={i} cx={p.x} cy={GROUND - 6} r={p.r} fill="#c8bfae" opacity={p.o} />)}
          </>
        )}

        {/* 紙の人 */}
        {swap > 0 && (
          <>
            <Shadow x={x} ground={GROUND} w={110} />
            <PaperPerson angles={angles} x={x} ground={GROUND + bob - hop} height={PERSON_H} facing={facing} view={pulling ? undefined : "front"} opacity={swap} />
          </>
        )}

        {/* 吹き出し「紙芝居にします！」 */}
        {bub > 0 && bubO > 0 && (
          <g opacity={bubO} transform={`translate(${x + 150} 150) scale(${bub})`}>
            <path d="M-20 -50H330Q350 -50 350 -30V30Q350 50 330 50H40L-20 100L0 50H-20Q-40 50 -40 30V-30Q-40 -50 -20 -50Z" fill="#fff" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
            <text x={155} y={14} textAnchor="middle" fontFamily={FONT_JP} fontSize={40} fontWeight={700} fill={INK}>
              {BUBBLE_TEXT}
            </text>
          </g>
        )}
      </svg>
    </AbsoluteFill>
  );
};
