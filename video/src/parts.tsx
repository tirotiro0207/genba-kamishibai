// 場面をまたいで使う部品: 時計 2 つ・木の紙芝居の枠・ライト
import React from "react";
import { useCurrentFrame } from "remotion";
import { FACE, LAP_FILLS } from "../../src/shared/clock-laps";
import { CLOCKS, FPS, INK } from "./timeline";

const JP = "BIZ UDPGothic, Yu Gothic, Meiryo, sans-serif";
export const FONT_JP = JP;

/**
 * 時計の針の角度（度）。数は出さず、針の動きだけを見せる（止まる数は 11/6 の結果のあとに本物を入れる）。
 * カードの針が先に止まり、文書の針は回り続ける。g は冒頭からのコマ
 */
export const CARD_STOP = 1.4 * FPS;
export const handDeg = (side: "text" | "card", g: number) => {
  const per = 80 / FPS; // 1 コマで 2.67 度（数ではなく、見た目の速さ）
  return side === "card" ? Math.min(g, CARD_STOP) * per : g * per;
};

const Dial: React.FC<{ cx: number; deg: number; done: boolean; label: string; underline?: number; opacity?: number }> = ({ cx, deg, done, label, underline = 0, opacity = 1 }) => {
  const { r, y, labelY } = CLOCKS;
  const a = ((deg - 90) * Math.PI) / 180;
  const hx = cx + Math.cos(a) * (r - 14);
  const hy = y + Math.sin(a) * (r - 14);
  // アプリの時計と同じく、1 周を越えたら前の周を下に塗り、今の周を 1 段濃い色で重ねる
  const lap = Math.floor(deg / 360);
  const rest = deg - lap * 360;
  const large = rest > 180 ? 1 : 0;
  const sweep = rest <= 0 ? "" : `M${cx} ${y}L${cx} ${y - r}A${r} ${r} 0 ${large} 1 ${cx + Math.cos(a) * r} ${y + Math.sin(a) * r}Z`;
  const under = lap > 0 ? LAP_FILLS[Math.min(lap - 1, LAP_FILLS.length - 1)] : "";
  const over = LAP_FILLS[Math.min(lap, LAP_FILLS.length - 1)];
  const w = 168;
  return (
    <g opacity={opacity}>
      <text x={cx} y={labelY} textAnchor="middle" fontFamily={JP} fontSize={34} fontWeight={700} fill={INK}>
        {label}
      </text>
      {underline > 0 && <rect x={cx - w / 2} y={labelY + 14} width={w * underline} height={6} rx={3} fill={INK} />}
      <circle cx={cx} cy={y} r={r} fill={FACE} stroke={INK} strokeWidth={5} />
      {under && <circle cx={cx} cy={y} r={r - 2.5} fill={under} />}
      {sweep && <path d={sweep} fill={over} />}
      {Array.from({ length: 12 }, (_, i) => {
        const t = (i * 30 * Math.PI) / 180;
        return <line key={i} x1={cx + Math.sin(t) * (r - 12)} y1={y - Math.cos(t) * (r - 12)} x2={cx + Math.sin(t) * (r - 2)} y2={y - Math.cos(t) * (r - 2)} stroke={INK} strokeWidth={4} />;
      })}
      <line x1={cx} y1={y} x2={hx} y2={hy} stroke={done ? LAP_FILLS[3] : INK} strokeWidth={done ? 9 : 6} strokeLinecap="round" />
      <circle cx={cx} cy={y} r={9} fill={done ? LAP_FILLS[3] : INK} />
    </g>
  );
};

/** 時計 2 つ（g は冒頭からのコマ） */
export const Clocks: React.FC<{ g: number; underline?: number; opacity?: number }> = ({ g, underline = 0, opacity = 1 }) => (
  <g>
    <Dial cx={CLOCKS.text} deg={handDeg("text", g)} done={false} label="文書で読む" underline={underline} opacity={opacity} />
    <Dial cx={CLOCKS.card} deg={handDeg("card", g)} done={g >= CARD_STOP} label="絵のカードで読む" opacity={opacity} />
  </g>
);

// ---- 木の紙芝居の枠（両開きの扉つき） ----

// 11/5 夜の直し: 枠は画面の主役。横幅の約 6 割・高さの約 6 割で上に寄せ、0:13 から 3:00 まで同じ所に置く
export const FRAME = { w: 768, h: 432, cy: 262, inset: 30 };
/** 床（画面の下の約 3 割）の上の端 */
export const FLOOR_Y = 504;
export const FLOOR = "#3a316c";
const WOOD = "#8a5a32";
const WOOD_DARK = "#5c3a1e";
const WOOD_DOOR = "#b07a46";

/** open は扉の開き（0 で閉じる、1 で開ききる）。children は扉の奥の絵（題など）。線は手で描いたように少し揺らす（WobbleDefs が要る） */
export const StageFrame: React.FC<{ cx: number; open?: number; children?: React.ReactNode }> = ({ cx, open = 0, children }) => {
  const { w, h, cy, inset } = FRAME;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  const ix = x0 + inset;
  const iy = y0 + inset;
  const half = iw / 2;
  // 扉は蝶番の側を軸に回る。見かけの幅は cos で縮み、開くほど暗くなる
  const sw = Math.cos((open * Math.PI) / 2 * 0.98);
  const door = (side: -1 | 1) => {
    const hinge = side < 0 ? ix : ix + iw;
    const dw = half * sw;
    const x = side < 0 ? hinge : hinge - dw;
    const shade = 1 - open * 0.45;
    return (
      <g>
        <rect x={x} y={iy} width={Math.max(0.5, dw)} height={ih} fill={WOOD_DOOR} stroke={WOOD_DARK} strokeWidth={4} style={{ filter: `brightness(${shade})` }} />
        {dw > 30 && <rect x={x + dw * 0.12} y={iy + 26} width={dw * 0.76} height={ih - 52} fill="none" stroke={WOOD_DARK} strokeWidth={3} opacity={0.55} />}
        {dw > 30 && <circle cx={side < 0 ? x + dw - 22 : x + 22} cy={cy} r={9} fill="#e8d6a8" stroke={WOOD_DARK} strokeWidth={3} />}
      </g>
    );
  };
  return (
    <g filter="url(#wobble)">
      {/* 枠の上の飾り（ゆるい山形） */}
      <path d={`M${x0 + 40} ${y0}Q${cx} ${y0 - 70} ${x0 + w - 40} ${y0}Z`} fill={WOOD} stroke={WOOD_DARK} strokeWidth={5} />
      <rect x={x0} y={y0} width={w} height={h} rx={10} fill={WOOD} stroke={WOOD_DARK} strokeWidth={6} />
      {/* 木目 */}
      {[0.25, 0.5, 0.75].map((t) => (
        <path key={t} d={`M${x0 + 8} ${y0 + 12 + t * 6}H${x0 + w - 8}`} stroke={WOOD_DARK} strokeWidth={2} opacity={0.35} />
      ))}
      <rect x={ix} y={iy} width={iw} height={ih} fill="#2a1b0e" />
      <svg x={ix} y={iy} width={iw} height={ih} viewBox={`0 0 ${iw} ${ih}`}>
        {children}
      </svg>
      {door(-1)}
      {door(1)}
      <rect x={x0 + 20} y={y0 + h} width={w - 40} height={16} fill={WOOD_DARK} />
    </g>
  );
};

/** ライト 1 つ（やわらかい丸い光） */
export const Light: React.FC<{ x: number; y: number; r: number; opacity: number; id: string }> = ({ x, y, r, opacity, id }) => (
  <g>
    <defs>
      <radialGradient id={id}>
        <stop offset="0%" stopColor="#fff4cf" stopOpacity={0.95} />
        <stop offset="55%" stopColor="#f2dfa0" stopOpacity={0.5} />
        <stop offset="100%" stopColor="#f2dfa0" stopOpacity={0} />
      </radialGradient>
    </defs>
    <circle cx={x} cy={y} r={r} fill={`url(#${id})`} opacity={opacity} filter="url(#soft-light)" style={{ mixBlendMode: "screen" }} />
  </g>
);

/**
 * 手で描いた線の揺れ（11/5 夜の指示: 絵コンテの手描きの紙芝居の調子）。線を細かいノイズで少しずらし、4 コマごとに 3 通りの揺れを替える（線が「ふるえる」手描きアニメの見え方）。
 * 筆でこすった紙（brush-paper）は、横に長いノイズで白い紙にかすれを付ける。どちらも SVG のフィルターだけで描く（外の部品は使わない）
 */
export const WobbleDefs: React.FC = () => {
  const f = useCurrentFrame();
  const seed = Math.floor(f / 4) % 3;
  return (
    <defs>
      <filter id="wobble" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={seed + 1} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={4} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="wobble-strong" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves={2} seed={seed + 4} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={7} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="brush-paper" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.004 0.09" numOctaves={3} seed={7} result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.86  0 0 0 0 0.83  0 0 0 0 0.76  0 0 0 -2.2 1.35" result="streak" />
        <feComposite in="streak" in2="SourceGraphic" operator="in" result="s2" />
        <feMerge>
          <feMergeNode in="SourceGraphic" />
          <feMergeNode in="s2" />
        </feMerge>
      </filter>
      <filter id="soft-light" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="18" />
      </filter>
    </defs>
  );
};

/** 筆でこすったような白い紙（題の紙）。ふちはかすれて、少し傾く */
export const BrushPaper: React.FC<{ x: number; y: number; w: number; h: number; rot?: number; children?: React.ReactNode }> = ({ x, y, w, h, rot = -1.2, children }) => (
  <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
    <g filter="url(#wobble-strong)">
      <rect x={x} y={y} width={w} height={h} fill="#fffdf4" filter="url(#brush-paper)" />
    </g>
    {children}
  </g>
);

/** 手書きの文字の字体（題・めでたし） */
export const FONT_HAND = "Segoe Print, Comic Sans MS, cursive";
