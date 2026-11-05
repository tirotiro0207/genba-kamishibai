// 枠の中の紙の上の絵（v4。作者の絵コンテと場面ごとの台本 11/5 夜）。
// むかしむかし（0:19〜0:36）は 1 本の長い巻紙で、場面ごとに左へ流れ、0.5 秒に 1 つずつ描き足す。
// 人はドローマイライフ調の棒人間（丸い頭・1 本の体・棒の手足）で、右下から入る「描く手」が黒いマーカーで描く。色は黒の線と、赤とオレンジだけ。
// 0:34.5 に棒人間がカードのピクトグラムの人に変わり、そのまま冒険の支度とポータル（0:36〜0:45.5）。ポータルに触れた所から体がドットにほどけて吸い込まれる。
// 座標は 660×350 の紙（全体を窓の大きさへ広げて使う）。t は冒頭からの秒
import React from "react";
import { Easing, interpolate } from "remotion";
import { characterSvg, type HeadwearKind } from "../../src/shared/picto/character";
import { type Angles, POSES } from "../../src/shared/picto/poses";
import { bodyBoxes, Dissolve } from "./dissolve";
import { gait, mixAngles } from "./paper";
import { FONT_PEN } from "./parts";
import { INK } from "./timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.inOut(Easing.quad);
export const WW = 660;
export const WH = 350;
const PG = 312; // 紙の上の地面
const PEN = "#1f1b26";
const RED = "#d8392b";
const ORANGE = "#f08a1c";

/** t0 から d 秒で 0 → 1 */
export const prog = (t: number, t0: number, d = 0.3) => interpolate(t, [t0, t0 + d], [0, 1], clamp);
/** ポンと出る（少し大きくなってから落ち着く） */
const popK = (p: number) => (p <= 0 ? 0 : interpolate(p, [0, 0.6, 1], [0.3, 1.12, 1], clamp));
export const Pop: React.FC<{ t: number; at: number; x: number; y: number; children: React.ReactNode; d?: number }> = ({ t, at, x, y, children, d = 0.25 }) => {
  const p = prog(t, at, d);
  if (p <= 0) return null;
  return <g transform={`translate(${x} ${y}) scale(${popK(p)})`} opacity={Math.min(1, p * 2)}>{children}</g>;
};
/** マーカーで線を引く（path を 0 → 1 で描く） */
export const Draw: React.FC<{ t: number; at: number; d: string; dur?: number; w?: number; color?: string }> = ({ t, at, d, dur = 0.4, w = 4, color = PEN }) => {
  const p = prog(t, at, dur);
  if (p <= 0) return null;
  return <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={`${p} 1`} />;
};

// ---- 棒人間（ドローマイライフ調） ----
type DPose = "stand" | "sit" | "droop";
/** head は頭の出（0〜1）、body は体と手足を描いた割合（0〜1） */
export const Stick: React.FC<{ x: number; g: number; h: number; hair?: "dad" | "mom" | "kid" | "baby"; pose?: DPose; face?: "smile" | "flat" | "open" | "none"; headUp?: number; sparkle?: boolean; head?: number; body?: number }> = ({ x, g, h, hair = "kid", pose = "stand", face = "smile", headUp = 0, sparkle, head = 1, body = 1 }) => {
  const r = h * 0.15;
  const w = Math.max(3, h * 0.028);
  const dash = (p: number) => ({ pathLength: 1, strokeDasharray: `${p} 1` });
  if (hair === "baby") {
    return (
      <g stroke={PEN} strokeWidth={w} fill="none" strokeLinecap="round">
        <path d={`M${x - h * 0.4} ${g - h * 0.3}Q${x - h * 0.2} ${g - h * 0.05} ${x + h * 0.3} ${g - h * 0.12}Q${x + h * 0.45} ${g - h * 0.4} ${x} ${g - h * 0.5}`} />
        <circle cx={x + h * 0.1} cy={g - h * 0.72} r={h * 0.24} />
        <path d={`M${x + h * 0.02} ${g - h * 0.66}q${h * 0.08} ${h * 0.08} ${h * 0.16} 0`} />
      </g>
    );
  }
  const droop = pose === "droop" ? 1 : 0;
  const hip: [number, number] = pose === "sit" ? [x, g - h * 0.28] : [x, g - h * 0.45];
  const neck: [number, number] = [x + (pose === "sit" ? h * 0.03 : 0), hip[1] - h * 0.32];
  const hc: [number, number] = [neck[0] + headUp * h * 0.04, neck[1] - r - headUp * h * 0.02];
  const sh = neck[1] + h * 0.05 + droop * h * 0.04;
  const legs =
    pose === "sit"
      ? `M${hip[0]} ${hip[1]}L${hip[0] + h * 0.26} ${hip[1]}L${hip[0] + h * 0.28} ${g}M${hip[0]} ${hip[1]}L${hip[0] + h * 0.2} ${hip[1] + 4}L${hip[0] + h * 0.18} ${g}`
      : `M${hip[0]} ${hip[1]}L${x - h * 0.11} ${g}M${hip[0]} ${hip[1]}L${x + h * 0.11} ${g}`;
  const arms = pose === "sit" ? `M${neck[0]} ${sh}L${neck[0] + h * 0.2} ${sh + h * 0.12}M${neck[0]} ${sh}L${neck[0] + h * 0.16} ${sh + h * 0.16}` : `M${neck[0]} ${sh}L${x - h * 0.17} ${sh + h * (0.22 + droop * 0.08)}M${neck[0]} ${sh}L${x + h * 0.17} ${sh + h * (0.22 + droop * 0.08)}`;
  const hairPath =
    hair === "mom"
      ? `M${hc[0] - r * 0.9} ${hc[1] - r * 0.4}Q${hc[0] - r * 1.5} ${hc[1] + r * 1.2} ${hc[0] - r * 0.9} ${hc[1] + r * 2.4}M${hc[0] + r * 0.9} ${hc[1] - r * 0.4}Q${hc[0] + r * 1.5} ${hc[1] + r * 1.2} ${hc[0] + r * 0.9} ${hc[1] + r * 2.4}`
      : hair === "dad"
        ? `M${hc[0] - r * 0.4} ${hc[1] - r * 0.9}l${-r * 0.15} ${-r * 0.5}M${hc[0]} ${hc[1] - r}l0 ${-r * 0.55}M${hc[0] + r * 0.4} ${hc[1] - r * 0.9}l${r * 0.15} ${-r * 0.5}`
        : `M${hc[0] - r * 0.2} ${hc[1] - r}l${-r * 0.2} ${-r * 0.4}M${hc[0] + r * 0.2} ${hc[1] - r}l${r * 0.1} ${-r * 0.45}`;
  const mouth = face === "smile" ? `M${hc[0] - r * 0.35} ${hc[1] + r * 0.3}Q${hc[0]} ${hc[1] + r * 0.7} ${hc[0] + r * 0.35} ${hc[1] + r * 0.3}` : face === "flat" ? `M${hc[0] - r * 0.3} ${hc[1] + r * 0.45}H${hc[0] + r * 0.3}` : face === "open" ? `M${hc[0] - r * 0.15} ${hc[1] + r * 0.4}a${r * 0.15} ${r * 0.18} 0 1 0 ${r * 0.3} 0a${r * 0.15} ${r * 0.18} 0 1 0 ${-r * 0.3} 0` : "";
  const skirt = hair === "mom" ? `M${hip[0]} ${hip[1] - h * 0.1}L${hip[0] - h * 0.13} ${hip[1] + h * 0.1}H${hip[0] + h * 0.13}Z` : "";
  return (
    <g stroke={PEN} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none">
      {head > 0 && (
        <g opacity={Math.min(1, head * 2)}>
          <circle cx={hc[0]} cy={hc[1]} r={r} {...dash(head)} />
          {head >= 1 && face !== "none" && (
            <>
              <circle cx={hc[0] - r * 0.35} cy={hc[1] - r * 0.05} r={w * 0.45} fill={PEN} />
              <circle cx={hc[0] + r * 0.35} cy={hc[1] - r * 0.05} r={w * 0.45} fill={PEN} />
              <path d={mouth} />
            </>
          )}
        </g>
      )}
      {body > 0 && (
        <g>
          <path d={`M${neck[0]} ${neck[1]}L${hip[0]} ${hip[1]}${legs}${arms}`} {...dash(body)} />
          <path d={hairPath} {...dash(body)} />
          {skirt && <path d={skirt} {...dash(body)} />}
        </g>
      )}
      {sparkle && <path d={`M${hc[0] + r * 0.6} ${hc[1] - r * 0.9}l${r * 0.15} ${r * 0.35}l${r * 0.35} ${r * 0.15}l${-r * 0.35} ${r * 0.15}l${-r * 0.15} ${r * 0.35}l${-r * 0.15} ${-r * 0.35}l${-r * 0.35} ${-r * 0.15}l${r * 0.35} ${-r * 0.15}Z`} stroke={ORANGE} strokeWidth={w * 0.6} />}
    </g>
  );
};

// ---- 小物（線だけ。塗らない） ----
const JAPAN = "M60 10Q70 22 64 34Q56 46 44 54Q30 62 18 72Q8 78 4 86M26 66Q22 74 14 78M52 14Q58 6 66 4";
const VIETNAM = "M30 0Q46 4 50 16Q40 26 34 40Q46 58 54 80Q60 104 50 122Q38 136 24 140Q30 128 36 116Q40 98 30 80Q20 64 22 48Q24 30 14 16Q20 6 30 0Z";
/** 考える吹き出し（小さな丸 2 つ＋雲） */
const Thought: React.FC<{ x: number; y: number; rx?: number; ry?: number; tail: -1 | 1 }> = ({ x, y, rx = 70, ry = 52, tail }) => (
  <g fill="none" stroke={PEN} strokeWidth={3.5}>
    <path d={`M${x - rx} ${y}Q${x - rx} ${y - ry} ${x - rx * 0.3} ${y - ry * 0.85}Q${x} ${y - ry * 1.25} ${x + rx * 0.35} ${y - ry * 0.85}Q${x + rx} ${y - ry} ${x + rx} ${y}Q${x + rx} ${y + ry} ${x + rx * 0.2} ${y + ry * 0.9}Q${x - rx * 0.3} ${y + ry * 1.2} ${x - rx * 0.6} ${y + ry * 0.8}Q${x - rx * 1.05} ${y + ry * 0.6} ${x - rx} ${y}Z`} fill="#fffdf6" />
    <circle cx={x + tail * rx * 0.55} cy={y + ry + 12} r={9} />
    <circle cx={x + tail * rx * 0.75} cy={y + ry + 32} r={5} />
  </g>
);
export const Heart: React.FC<{ s?: number }> = ({ s = 1 }) => <path d="M0 10C-18 -4 -14 -20 0 -10C14 -20 18 -4 0 10Z" transform={`scale(${s})`} fill="none" stroke={RED} strokeWidth={3.5} strokeLinejoin="round" />;
export const Star: React.FC<{ r?: number; fill?: string }> = ({ r = 10, fill = "none" }) => (
  <path d={Array.from({ length: 10 }, (_, i) => { const a = (i * Math.PI) / 5 - Math.PI / 2; const rr = i % 2 ? r * 0.45 : r; return `${i ? "L" : "M"}${(Math.cos(a) * rr).toFixed(1)} ${(Math.sin(a) * rr).toFixed(1)}`; }).join("") + "Z"} fill={fill} stroke={ORANGE} strokeWidth={2} />
);
/** ひらめきの電球（ポータルの電球と同じ描き方）。lit 0〜1 で灯る */
export const Bulb: React.FC<{ x: number; y: number; s?: number; lit: number; f: number }> = ({ x, y, s = 1, lit, f }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    {lit > 0 &&
      Array.from({ length: 9 }, (_, i) => {
        const a = (-160 + i * 17.5) * (Math.PI / 180);
        const l = 16 + ((i * 7 + Math.floor(f / 3)) % 3) * 5;
        return <path key={i} d={`M${Math.cos(a) * 30} ${Math.sin(a) * 30 - 6}l${Math.cos(a + 0.4) * l * 0.5} ${Math.sin(a + 0.4) * l * 0.5}l${Math.cos(a - 0.4) * l * 0.5} ${Math.sin(a - 0.4) * l * 0.5}`} fill="none" stroke={ORANGE} strokeWidth={3} strokeLinecap="round" opacity={lit} />;
      })}
    <path d="M-17 -14A20 20 0 1 1 17 -14Q11 -2 10 8H-10Q-11 -2 -17 -14Z" fill={lit > 0 ? `rgba(255,214,90,${0.35 + lit * 0.65})` : "#fffdf6"} stroke={lit > 0 ? PEN : "#9a9a9a"} strokeWidth={3} strokeLinejoin="round" />
    <path d="M-5 -6L0 -15L5 -6" fill="none" stroke={lit > 0 ? "#c98b12" : "#999"} strokeWidth={2.5} />
    <path d="M-10 8H10M-9 13H9M-7 18H7" stroke={PEN} strokeWidth={3} strokeLinecap="round" />
  </g>
);
/** 横長のゲーム機（ロゴ・名前・本物のゲームの絵は描かない。画面の中は四角と点だけ） */
const Console: React.FC<{ t: number; f: number }> = ({ t, f }) => {
  const dpad = t >= 29.5 && t < 29.9;
  const btn = (t >= 30.0 && t < 30.3) || (t >= 31.0 && t < 31.15) || (t >= 31.25 && t < 31.4);
  const play = prog(t, 30.5, 0.3);
  const dot = interpolate(t, [30.5, 32.5], [0, 1], clamp);
  const bright = prog(t, 32.0, 0.2);
  return (
    <g strokeLinejoin="round">
      <rect x={-40} y={-30} width={22} height={8} rx={3} fill="#fffdf6" stroke={PEN} strokeWidth={2.5} />
      <rect x={18} y={-30} width={22} height={8} rx={3} fill="#fffdf6" stroke={PEN} strokeWidth={2.5} />
      <rect x={-62} y={-26} width={124} height={54} rx={22} fill="#fffdf6" stroke={PEN} strokeWidth={3} />
      <rect x={-28} y={-18} width={56} height={38} rx={3} fill={bright > 0 ? `rgba(255,250,200,${bright})` : "#fffdf6"} stroke={PEN} strokeWidth={2.5} />
      {play > 0 && (
        <g opacity={play}>
          {Array.from({ length: 12 }, (_, i) => <rect key={i} x={-25 + (i % 6) * 8.6} y={-6 + Math.floor(i / 6) * 9} width={7} height={7} fill="#5aa152" />)}
          <circle cx={-22 + dot * 44} cy={-11} r={2.6} fill={PEN} />
        </g>
      )}
      {/* 十字キー（右を押すとへこむ） */}
      <g transform="translate(-44 1)">
        <path d="M-4 -11h8v7h7v8h-7v7h-8v-7h-7v-8h7Z" fill={PEN} />
        {dpad && <rect x={4} y={-3} width={7} height={6} fill="#777" />}
      </g>
      <circle cx={40} cy={6} r={5.5} fill={btn ? RED : "#fffdf6"} stroke={PEN} strokeWidth={2.5} transform={btn ? "translate(0 1)" : undefined} />
      <circle cx={51} cy={-4} r={5.5} fill="#fffdf6" stroke={PEN} strokeWidth={2.5} />
      {/* 「ポチ」 */}
      {dpad && <text x={-70} y={-34} fontFamily={FONT_PEN} fontSize={13} fill={PEN}>ポチ</text>}
      {t >= 30.0 && t < 30.45 && <text x={44} y={-34} fontFamily={FONT_PEN} fontSize={13} fill={PEN}>ポチ</text>}
      {t >= 31.0 && t < 31.6 && <text x={40} y={-36} fontFamily={FONT_PEN} fontSize={13} fill={PEN}>ポチポチ</text>}
      {[31.0, 31.5, 32.0].map((s, i) => {
        const p = prog(t, s, 0.45);
        if (p <= 0) return null;
        return <g key={s} transform={`translate(${-6 + i * 10 + p * (i - 1) * 16} ${-22 - p * 26}) rotate(${p * 90 + f})`} opacity={Math.min(1, 2.2 - p * 1.2)}><Star r={5} /></g>;
      })}
    </g>
  );
};
/** ピクトグラムの人（アプリの部品をそのまま読む） */
export const picto = (o: { angles: Angles; x: number; ground: number; h: number; facing?: "left" | "right"; headwear?: HeadwearKind | "none" }) =>
  characterSvg({ angles: o.angles, x: o.x, groundY: o.ground, height: o.h, facing: o.facing ?? "right", view: "quarter", role: "new", headwear: o.headwear ?? "none" });

// ---- 描く手（右下から入る。線で描いた右手と黒いマーカー） ----
const PANEL = WW;
/** [描き始めの秒, 巻紙の上の x, y, マーカーの色] */
const STROKES: [number, number, number, string?][] = [
  [19.0, 200, 140], [19.5, 200, 250], [20.0, 450, 150], [20.5, 450, 260], [21.0, 160, 80], [21.5, 500, 80], [22.0, 325, 200, RED],
  [22.5, PANEL + 180, 110], [23.0, PANEL + 214, 268, RED], [23.5, PANEL + 340, 270], [24.0, PANEL + 340, 210], [24.5, PANEL + 420, 255], [25.0, PANEL + 440, 250],
  [26.5, PANEL * 2 + 400, 80], [27.0, PANEL * 2 + 300, 200], [27.5, PANEL * 2 + 300, 120], [28.0, PANEL * 2 + 232, 176],
  [28.5, PANEL * 3 + 230, 290], [33.0, PANEL * 3 + 206, 120],
];
const HAND_HIDE: [number, number][] = [[29.0, 32.5], [34.5, 999]];
const DrawHand: React.FC<{ t: number; sx: number }> = ({ t, sx }) => {
  if (t < 18.7) return null;
  const hidden = HAND_HIDE.some(([a, b]) => t >= a && t < b);
  let i = -1;
  for (let k = 0; k < STROKES.length; k++) if (STROKES[k][0] <= t) i = k;
  const out: [number, number] = [WW + 140, WH + 160];
  let pos: [number, number] = out;
  let color = PEN;
  if (i >= 0 && !hidden) {
    const [t0, x, y, c] = STROKES[i];
    const prev = i > 0 ? STROKES[i - 1] : null;
    const mv = prog(t, t0 - 0.12, 0.12);
    const from: [number, number] = !prev || t0 - prev[0] > 0.6 ? out : [prev[1] - sx, prev[2]];
    const target: [number, number] = [x - sx + Math.sin(t * 40) * 3, y + Math.cos(t * 33) * 3];
    pos = [from[0] + (target[0] - from[0]) * mv, from[1] + (target[1] - from[1]) * mv];
    // 描き終えて 0.42 秒たったら右下へ引っ込む
    const back = prog(t, t0 + 0.42, 0.25);
    pos = [pos[0] + (out[0] - pos[0]) * back, pos[1] + (out[1] - pos[1]) * back];
    color = c ?? PEN;
  }
  if (pos[0] > WW + 120 && pos[1] > WH + 140) return null;
  return (
    <g transform={`translate(${pos[0]} ${pos[1]})`}>
      {/* マーカー（先が線の先） */}
      <g transform="rotate(-35)">
        <rect x={-7} y={6} width={14} height={78} rx={4} fill="#fffdf6" stroke={PEN} strokeWidth={2.5} />
        <rect x={-7} y={6} width={14} height={14} fill={color} />
        <path d="M-5 6L0 -2L5 6Z" fill={color} />
      </g>
      {/* 右手と袖（線で描く） */}
      <path d="M20 26C10 22 6 34 14 40C8 48 16 56 26 52C34 64 52 62 58 52C74 54 84 40 76 28C66 14 40 14 30 22C26 20 22 22 20 26Z" fill="#f6e7cf" stroke={PEN} strokeWidth={3} strokeLinejoin="round" />
      <path d="M62 56L120 120M82 34L150 96" fill="none" stroke={PEN} strokeWidth={3} strokeLinecap="round" />
    </g>
  );
};

// ---- むかしむかしの巻紙（0:19〜0:36） ----
/** 巻紙の流れ（窓の左の端が巻紙のどこか）: 場面の替わり目で 0.5 秒かけて流れ、場面の中はゆっくり流れ続ける */
const scrollAt = (t: number) => interpolate(t, [19, 22.5, 23.0, 25.8, 26.2, 28.2, 28.6], [0, 30, PANEL, PANEL + 30, PANEL * 2, PANEL * 2 + 30, PANEL * 3], clamp);
/** ゲーム機へ寄る（紙の上の絵だけ。枠は動かさない）: [倍率, 寄る所 x, y] */
const KID_X = 200;
const zoomAt = (t: number): [number, number, number] => {
  const z = interpolate(t, [28.95, 29.3, 32.4, 32.7, 33.0, 33.3], [1, 3, 3, 2.2, 2.2, 1], { ...clamp, easing: ease });
  const fx = interpolate(t, [29.3, 32.4, 32.7], [KID_X + 165, KID_X + 165, KID_X + 60], clamp);
  const fy = interpolate(t, [29.3, 32.4, 32.7], [PG - 40, PG - 40, PG - 46], clamp);
  return [z, fx, fy];
};

/** むかしむかしから冒険の支度・ポータルまで（0:19〜0:52.5）の、枠の中の紙の上 */
export const StoryStrip: React.FC<{ t: number; f: number }> = ({ t, f }) => {
  const sx = scrollAt(t);
  const [z, fx, fy] = t >= 28.9 ? zoomAt(t) : [1, 0, 0];
  const camera = z !== 1 ? `translate(${WW / 2} ${WH / 2}) scale(${z}) translate(${-fx} ${-fy})` : "";
  const grey = interpolate(t, [27.95, 28.05, 28.4, 28.55], [0, 0.22, 0.22, 0], clamp);
  return (
    <g>
      <g transform={camera}>
        <g transform={`translate(${-sx} 0)`}>
          {t < 23.2 && <Parents t={t} />}
          {t > 22.3 && t < 26.5 && <Birth t={t} />}
          {t > 25.8 && t < 29.2 && <School t={t} />}
          {t > 28.3 && <g transform={`translate(${PANEL * 3} 0)`}><GameAndAdventure t={t} f={f} /></g>}
        </g>
      </g>
      {grey > 0 && <rect width={WW} height={WH} fill="#8a8a8a" opacity={grey} style={{ mixBlendMode: "multiply" }} />}
      <DrawHand t={t} sx={sx} />
    </g>
  );
};

/** 〈両親が出会う 0:19.0〜0:22.5〉 */
const Parents: React.FC<{ t: number }> = ({ t }) => {
  const near = prog(t, 22.0, 0.3) * 18;
  const tilt = prog(t, 22.0, 0.3);
  return (
    <g>
      <Stick x={200 + near} g={PG} h={180} hair="dad" head={prog(t, 19.0, 0.4)} body={prog(t, 19.5, 0.45)} face={t >= 19.4 ? "smile" : "none"} />
      <Stick x={450 - near} g={PG} h={170} hair="mom" head={prog(t, 20.0, 0.4)} body={prog(t, 20.5, 0.45)} face={t >= 20.4 ? "smile" : "none"} />
      <Pop t={t} at={21.0} x={160 + tilt * 30} y={74}>
        <g transform={`rotate(${tilt * 12})`}>
          <Thought x={0} y={0} tail={1} />
          <path d={JAPAN} transform="translate(-34 -46)" fill="none" stroke={PEN} strokeWidth={3.5} strokeLinecap="round" />
        </g>
      </Pop>
      <Pop t={t} at={21.5} x={500 - tilt * 30} y={74}>
        <g transform={`rotate(${-tilt * 12})`}>
          <Thought x={0} y={0} tail={-1} />
          <path d={VIETNAM} transform="translate(-14 -44) scale(0.62)" fill="none" stroke={PEN} strokeWidth={5} />
        </g>
      </Pop>
      <Pop t={t} at={22.0} x={325} y={200}><Heart s={1.6} /></Pop>
    </g>
  );
};
/** 〈ホーチミンで生まれる 0:22.5〜0:25.5〉 */
const Birth: React.FC<{ t: number }> = ({ t }) => {
  const grow = prog(t, 24.0, 0.4);
  const flip = prog(t, 25.0, 0.35);
  const parentsO = 1 - prog(t, 24.0, 0.4);
  return (
    <g transform={`translate(${PANEL} 0)`}>
      <g transform="translate(150 20) scale(2.05)">
        <Draw t={t} at={22.5} d={VIETNAM} dur={0.45} w={2} />
      </g>
      <Pop t={t} at={23.0} x={214} y={268}><circle r={7} fill={RED} /></Pop>
      {/* 端のお父さんとお母さん（にっこり） */}
      {parentsO > 0 && t >= 23.5 && (
        <g opacity={parentsO} transform={`translate(${-grow * 60} 0)`}>
          <Stick x={560} g={PG} h={100} hair="dad" />
          <Stick x={610} g={PG} h={94} hair="mom" />
        </g>
      )}
      {/* 赤ちゃん → 子ども */}
      <g opacity={1 - grow}>
        <Pop t={t} at={23.5} x={0} y={0}><Stick x={340} g={PG} h={60} hair="baby" /></Pop>
      </g>
      {grow > 0 && <Stick x={340} g={PG} h={118} hair="kid" body={grow} />}
      {/* 開いた本: ABC → ă ơ ư */}
      <Pop t={t} at={24.5} x={420} y={260}>
        <path d="M-50 -30Q-25 -38 0 -28Q25 -38 50 -30V20Q25 12 0 22Q-25 12 -50 20Z" fill="#fffdf6" stroke={PEN} strokeWidth={3} />
        <path d="M0 -28V22" stroke={PEN} strokeWidth={2.5} />
        <g transform={`scale(${Math.abs(Math.cos(flip * Math.PI))} 1)`}>
          <text x={flip < 0.5 ? -25 : 25} y={2} textAnchor="middle" fontFamily={FONT_PEN} fontSize={18} fill={flip < 0.5 ? PEN : RED}>{flip < 0.5 ? "ABC" : "ă ơ ư"}</text>
        </g>
        {flip >= 1 && <text x={-25} y={2} textAnchor="middle" fontFamily={FONT_PEN} fontSize={18} fill={PEN}>ABC</text>}
      </Pop>
      <Pop t={t} at={25.5} x={330} y={110}>
        <ellipse rx={62} ry={30} fill="#fffdf6" stroke={PEN} strokeWidth={3} />
        <path d="M-6 28L-14 46L8 29" fill="#fffdf6" stroke={PEN} strokeWidth={3} />
        <text x={-22} y={7} textAnchor="middle" fontFamily={FONT_PEN} fontSize={20} fill={PEN}>ABC</text>
        <text x={26} y={7} textAnchor="middle" fontFamily={FONT_PEN} fontSize={22} fill={RED}>ă</text>
      </Pop>
    </g>
  );
};
/** 〈七歳、ハノイの日本人学校 0:26.0〜0:28.5〉 */
const School: React.FC<{ t: number }> = ({ t }) => {
  const jump = prog(t, 26.0, 0.5);
  const sad = t >= 28.0;
  const a = jump * Math.PI;
  return (
    <g transform={`translate(${PANEL * 2} 0)`}>
      {/* 小さな地図: 点が南から北へ点線の弧で跳ぶ */}
      <g transform="translate(40 60) scale(1.3)">
        <path d={VIETNAM} fill="none" stroke={PEN} strokeWidth={2.5} />
        <path d="M28 122Q70 60 30 14" fill="none" stroke={RED} strokeWidth={2} strokeDasharray="4 5" opacity={jump} />
        <circle cx={28 + Math.sin(a) * 30} cy={122 - jump * 108} r={5} fill={RED} />
      </g>
      {/* 黒板（字の代わりにうねった線）と机 */}
      <Pop t={t} at={26.5} x={0} y={0}>
        <rect x={250} y={28} width={300} height={110} rx={6} fill="none" stroke={PEN} strokeWidth={4} />
        {[0, 1, 2].map((i) => <path key={i} d={`M270 ${58 + i * 28}q15 -12 30 0t30 0t30 0t30 0t30 0t30 0`} fill="none" stroke={PEN} strokeWidth={2.5} />)}
        {[300, 430, 540].map((x) => <path key={x} d={`M${x - 40} ${PG - 52}h80M${x - 34} ${PG - 52}v52M${x + 34} ${PG - 52}v52`} stroke={PEN} strokeWidth={4} fill="none" />)}
      </Pop>
      <Pop t={t} at={27.0} x={0} y={0}>
        <Stick x={300} g={PG} h={138} hair="kid" pose={sad ? "droop" : "stand"} face={sad ? "flat" : "none"} />
        <Stick x={430} g={PG} h={130} hair="dad" />
        <Stick x={540} g={PG} h={134} hair="mom" />
        {[430, 540].map((x) => (
          <g key={x}>
            <ellipse cx={x + 14} cy={150} rx={42} ry={24} fill="#fffdf6" stroke={PEN} strokeWidth={3} />
            <path d={`M${x - 14} 150c8 -14 12 10 20 -4s10 12 18 0 10 10 16 -2`} fill="none" stroke={PEN} strokeWidth={2.5} />
          </g>
        ))}
      </Pop>
      <Pop t={t} at={27.5} x={300} y={122}>
        <text textAnchor="middle" fontFamily={FONT_PEN} fontSize={56} fontWeight={700} fill={RED}>?</text>
      </Pop>
      <Pop t={t} at={28.0} x={232} y={176}>
        <ellipse rx={22} ry={14} fill="#fffdf6" stroke={PEN} strokeWidth={2.5} />
        <text y={5} textAnchor="middle" fontFamily={FONT_PEN} fontSize={16} fill={PEN}>…</text>
      </Pop>
    </g>
  );
};

/** 〈ゲーム機 0:28.5〜0:33.0〉〈ひらめき → ピクトグラム 0:33.0〜0:36.0〉〈冒険の支度とポータル 0:36.0〜0:45.5〉 */
const SCROLLS = ["vietnamese/SKILL.md", "japanese/SKILL.md"];
export const PORTAL = { x: 520, y: 172, rx: 74, ry: 104 };
/** ふちが波打った、縦長のいびつな丸（2 重の線）。k は大きさ */
export const portalPath = (k: number, phase = 0) => {
  const n = 28;
  return (
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const wob = 1 + 0.07 * Math.sin(a * 5 + phase) + 0.04 * Math.sin(a * 9 + 1.3);
      const squash = 1 - 0.12 * Math.max(0, Math.sin(a)) * Math.cos(a * 2);
      return `${i ? "L" : "M"}${(Math.cos(a) * PORTAL.rx * k * wob * squash).toFixed(1)} ${(Math.sin(a) * PORTAL.ry * k * wob).toFixed(1)}`;
    }).join("") + "Z"
  );
};
const GameAndAdventure: React.FC<{ t: number; f: number }> = ({ t, f }) => {
  // 子ども: うつぶせ（〜33.0）→ 起き上がって座る → 0:34.5〜0:35.5 にピクトグラムの人になる
  const lying = t < 33.0;
  const morph = prog(t, 34.5, 1.0);
  const headUp = prog(t, 34.0, 0.25);
  const bulbOn = t >= 33.0 && t < 36.0;
  const lit = prog(t, 33.5, 0.15);
  const pocket = prog(t, 35.5, 0.4);
  // 冒険の支度
  const heroX = KID_X;
  const pack = prog(t, 36.0, 0.3);
  const shoulder = prog(t, 38.0, 0.5);
  const run = interpolate(t, [42.0, 42.5], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const hx = heroX + run * (PORTAL.x - PORTAL.rx - 30 - heroX);
  const hh = 170;
  const hg = PG;
  const nod = t >= 41.5 && t < 41.9 ? Math.sin(((t - 41.5) / 0.4) * Math.PI) * 4 : 0;
  const squat = t >= 38.0 && t < 38.5 ? Math.sin(((t - 38) / 0.5) * Math.PI) : 0;
  const reach = t >= 42.4;
  const angles: Angles = run > 0 && run < 1 ? gait("run", t / 0.16) : reach ? ({ ...POSES.stand, arm_near_upper: 85, arm_near_lower: 0 } as Angles) : squat > 0 ? mixAngles(POSES.stand, POSES.squat, squat * 0.6) : POSES.stand;
  const heroOn = t >= 34.5;
  const px = interpolate(shoulder, [0, 1], [heroX + 92, heroX - 34]);
  const packX = hx + (shoulder >= 1 ? -34 : px - heroX);
  const packTopY = hg - 170;
  // 相棒: 0:38.5 に左から跳んでリュックの一番上へ
  const hop = prog(t, 38.5, 0.4);
  const partX = interpolate(hop, [0, 1], [-30, packX]);
  const partY = interpolate(hop, [0, 1], [PG, packTopY]) - Math.sin(hop * Math.PI) * 80;
  const blink = (t >= 39.0 && t < 39.1) || (t >= 48.0 && t < 48.1);
  // ポータル
  const outer = prog(t, 39.0, 0.5);
  const inner = prog(t, 39.5, 0.5);
  const bulbP = prog(t, 40.0, 0.25);
  const portalLit = prog(t, 40.5, 0.2) * (1 - prog(t, 48.5, 1.0));
  const swell = t >= 44.0 && t < 44.5 ? 1 + 0.1 * Math.sin(((t - 44) / 0.5) * Math.PI) : 1;
  const shrink = interpolate(t, [45.0, 45.4], [1, 0.9], clamp);
  const flashIn = t >= 44.0 && t < 44.7 ? Math.sin(((t - 44) / 0.7) * Math.PI) : 0;
  const flicker = t >= 45.0 && t < 45.25 && Math.floor(t * 20) % 2 === 0 ? 0.2 : 1;
  const leftWhite = prog(t, 44.5, 0.3);
  // ドット: 0:42.5 にのばした手がふちに触れた所からほどけ、0:44.0 に最後のドットが入る
  const dis = interpolate(t, [42.5, 44.0], [0, 1], clamp);
  const boxes = [
    ...bodyBoxes(hx, hg, hh, -1).map((b, i) => ({ ...b, colors: i === 3 ? ["#8a5a2b", "#a46c36", "#4e7a55", "#3d240f"] : ["#2b2550", "#ffffff", "#f3ead6"] })),
    { x0: packX - 26, y0: packTopY - 30, x1: packX + 26, y1: packTopY, colors: ["#d97757", "#a9502f"] },
    { x0: hx, y0: hg - hh * 0.75, x1: hx + hh * 0.42, y1: hg - hh * 0.6, colors: ["#2b2550", "#ffffff"] },
  ];
  return (
    <g>
      {/* 家の床 */}
      {t < 35.5 && <Draw t={t} at={28.5} d={`M20 ${PG + 2}H640`} w={3} dur={0.3} />}
      {/* 子ども（棒人間） */}
      {morph < 1 && t < 35.6 && (
        <g opacity={1 - morph}>
          {lying ? (
            <g transform={`rotate(90 ${KID_X} ${PG - 14})`}>
              <Stick x={KID_X} g={PG - 14 + 60} h={140} hair="kid" face={t >= 32.5 ? "smile" : "flat"} sparkle={t >= 32.5} />
            </g>
          ) : (
            <Stick x={KID_X} g={PG} h={150} hair="kid" pose={morph > 0 ? "stand" : "sit"} face={headUp > 0 ? "open" : "flat"} headUp={headUp} />
          )}
        </g>
      )}
      {/* ゲーム機 */}
      {pocket < 1 && t >= 28.5 && (
        <g transform={lying ? `translate(${KID_X + 185} ${PG - 40})` : `translate(${KID_X + 34 - pocket * 20} ${PG - 70 + pocket * 20}) scale(${0.55 * (1 - pocket)})`}>
          <Console t={t} f={f} />
        </g>
      )}
      {/* ひらめきの電球 */}
      {bulbOn && (
        <g opacity={1 - prog(t, 35.5, 0.4)}>
          <Bulb x={KID_X + 6} y={PG - 196} lit={lit} f={f} s={1.1} />
        </g>
      )}
      {/* ピクトグラムの主人公（リュック・相棒）。0:42.5 からドットにほどける */}
      {heroOn && dis < 1 && (
        <Dissolve id="hero-dots" p={dis} boxes={boxes} to={[PORTAL.x, PORTAL.y]} cell={5}>
          <g opacity={morph}>
            {pack > 0 && (
              <g transform={`translate(${packX} ${shoulder >= 1 ? hg : interpolate(pack, [0, 1], [-120, PG])})`}>
                <BigPack h={170} />
              </g>
            )}
            <g transform={`translate(0 ${nod})`} dangerouslySetInnerHTML={{ __html: picto({ angles, x: hx, ground: hg, h: hh }) }} />
            {hop > 0 && <Clawd x={hop >= 1 ? packX : partX} y={hop >= 1 ? packTopY : partY} s={38} blink={blink} look={t >= 41.0 ? 1 : 0} />}
          </g>
        </Dissolve>
      )}
      {/* 巻物の札と矢印 */}
      {SCROLLS.map((s, i) => {
        const p = prog(t, 36.5 + i * 0.5, 0.35);
        if (p <= 0) return null;
        const x = interpolate(p, [0, 1], [-160, 120]);
        const y = 34 + i * 40;
        const toPack = prog(t, 37.5, 0.45);
        const outline = leftWhite > 0;
        return (
          <g key={s}>
            <g transform={`translate(${x} ${y})`} opacity={outline ? 0.35 : 1}>
              <rect x={-104} y={-15} width={208} height={30} rx={6} fill={outline ? "none" : "#fffdf6"} stroke={PEN} strokeWidth={3} />
              <rect x={-112} y={-9} width={10} height={18} rx={3} fill="none" stroke={PEN} strokeWidth={2.5} />
              <rect x={102} y={-9} width={10} height={18} rx={3} fill="none" stroke={PEN} strokeWidth={2.5} />
              {!outline && <text y={7} textAnchor="middle" fontFamily="Consolas, monospace" fontSize={17} fill={PEN}>{s}</text>}
            </g>
            {toPack > 0 && toPack < 1 && (
              <g transform={`translate(${interpolate(toPack, [0, 1], [120 + i * 20, heroX + 92])} ${interpolate(toPack, [0, 1], [y + 16, PG - 120]) - Math.sin(toPack * Math.PI) * 30})`}>
                <rect x={-14} y={-6} width={28} height={12} rx={5} fill="#f4e4b8" stroke={PEN} strokeWidth={2} />
              </g>
            )}
            {t >= 37.5 && t < 38.5 && <Draw t={t} at={37.5} d={`M${150 + i * 20} ${y + 16}Q${heroX + 140} ${y + 30} ${heroX + 96} ${PG - 140}`} w={2.5} dur={0.3} />}
          </g>
        );
      })}
      {/* ポータル（紙の右 1/3）: 外の線 → 内の線 → 電球 → 灯る・後ろから赤い細い線 */}
      {outer > 0 && (
        <g transform={`translate(${PORTAL.x} ${PORTAL.y}) scale(${swell * shrink})`}>
          {portalLit > 0 &&
            Array.from({ length: 16 }, (_, i) => {
              const a = (40 + i * 11) * (Math.PI / 180); // 主に下と左
              return <path key={i} d={`M${Math.cos(a) * 70} ${Math.sin(a) * 96}L${Math.cos(a) * (150 + (i % 3) * 30)} ${Math.sin(a) * (170 + (i % 3) * 30)}`} stroke="#e8836f" strokeWidth={1.5} opacity={portalLit * 0.6} />;
            })}
          <path d={portalPath(1, 0)} fill={flashIn > 0 ? `rgba(255,255,255,${0.5 + flashIn * 0.5})` : "#fffefa"} stroke={PEN} strokeWidth={4} pathLength={1} strokeDasharray={`${outer} 1`} />
          {inner > 0 && <path d={portalPath(0.8, 1.7)} fill="none" stroke={PEN} strokeWidth={3} pathLength={1} strokeDasharray={`${inner} 1`} />}
          {flashIn > 0 && <ellipse rx={PORTAL.rx * 0.8} ry={PORTAL.ry * 0.8} fill="#fff" opacity={flashIn} filter="url(#soft-light)" />}
          {bulbP > 0 && (
            <g transform={`translate(0 ${-PORTAL.ry - 26}) scale(${popK(bulbP)})`}>
              <Bulb x={0} y={0} lit={portalLit * flicker} f={f} s={1} />
            </g>
          )}
        </g>
      )}
      {/* 吸い込まれたあと、紙の左半分が白く抜ける（札はふちだけ残る） */}
      {leftWhite > 0 && <path d={`M-10 0H${WW * 0.52}L${WW * 0.5} ${WH * 0.3}L${WW * 0.53} ${WH * 0.6}L${WW * 0.5} ${WH}H-10Z`} fill="#fff" opacity={leftWhite * 0.92} />}
      {/* 走るほこり */}
      {run > 0 && run < 1 && [0, 1, 2].map((i) => <circle key={i} cx={hx - 30 - i * 18} cy={PG - 6} r={6 + i * 2} fill="#d8cfbf" opacity={0.6 - i * 0.15} />)}
    </g>
  );
};

/** 背丈ほどある大きな冒険のリュック（足元が原点、上が -h）。丸めた敷物・ポケット・はみ出た定規と懐中電灯 */
export const BigPack: React.FC<{ h: number }> = ({ h }) => {
  const sw = Math.max(2, h * 0.016);
  const w = h * 0.4;
  return (
    <g stroke="#3d240f" strokeWidth={sw} strokeLinejoin="round">
      <rect x={-w * 0.32} y={-h * 1.02} width={h * 0.05} height={h * 0.2} fill="#f4e4b8" transform={`rotate(-12 ${-w * 0.3} ${-h})`} />
      <rect x={w * 0.12} y={-h * 1.04} width={h * 0.06} height={h * 0.16} rx={h * 0.01} fill="#5d6d86" />
      <rect x={w * 0.11} y={-h * 1.06} width={h * 0.08} height={h * 0.04} fill="#ffe27a" />
      <rect x={-w / 2} y={-h * 0.9} width={w} height={h * 0.84} rx={h * 0.06} fill="#8a5a2b" />
      <rect x={-w * 0.56} y={-h * 0.93} width={w * 1.12} height={h * 0.11} rx={h * 0.05} fill="#4e7a55" />
      <path d={`M${-w * 0.44} ${-h * 0.7}H${w * 0.44}V${-h * 0.52}Q0 ${-h * 0.46} ${-w * 0.44} ${-h * 0.52}Z`} fill="#a46c36" />
      <rect x={-w * 0.36} y={-h * 0.38} width={w * 0.72} height={h * 0.22} rx={h * 0.03} fill="#a46c36" />
      <rect x={-w * 0.6} y={-h * 0.6} width={w * 0.16} height={h * 0.3} rx={h * 0.03} fill="#93603a" />
      <circle cx={0} cy={-h * 0.5} r={h * 0.02} fill="#e8c56a" />
    </g>
  );
};

/**
 * 赤い相棒（Claude のキャラクター。非公式のファン作品として自分たちで描く）。名前とロゴは出さない。
 * 角の立った横長の四角い体に縦長の黒い目、左右の小さな手、下に 4 本の短い足。s は体の横幅、(x, y) は足元
 */
const CLAWD = "#d97757";
const CLAWD_DARK = "#a9502f";
export const Clawd: React.FC<{ x: number; y: number; s?: number; blink?: boolean; look?: number; down?: number; rot?: number }> = ({ x, y, s = 34, blink, look = 0, down = 0, rot = 0 }) => {
  const u = s / 10;
  const bodyH = 6 * u;
  const legH = 1.6 * u;
  const ex = look * 0.6 * u;
  const ey = down * 0.8 * u;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot} 0 ${-bodyH / 2})`}>
      {[-4, -2, 1, 3].map((lx) => <rect key={lx} x={lx * u} y={-legH} width={u} height={legH} fill={CLAWD_DARK} />)}
      <rect x={-s / 2 - 1.4 * u} y={-legH - bodyH * 0.62} width={1.4 * u} height={1.6 * u} fill={CLAWD} />
      <rect x={s / 2} y={-legH - bodyH * 0.62} width={1.4 * u} height={1.6 * u} fill={CLAWD} />
      <rect x={-s / 2} y={-legH - bodyH} width={s} height={bodyH} fill={CLAWD} />
      <rect x={-2.6 * u + ex} y={-legH - bodyH * 0.74 + ey + (blink ? 0.9 * u : 0)} width={u} height={blink ? 0.3 * u : 2 * u} fill="#1d1d1d" />
      <rect x={1.6 * u + ex} y={-legH - bodyH * 0.74 + ey + (blink ? 0.9 * u : 0)} width={u} height={blink ? 0.3 * u : 2 * u} fill="#1d1d1d" />
    </g>
  );
};
export { INK };
