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
  const t = Math.max(0, g - 2.5 * FPS); // 時計を描き終えた 0:02.5 から針が動く
  return side === "card" ? Math.min(t, CARD_STOP) * per : t * per;
};

/** labelP は見出しの字を何割まで書いたか、drawP は時計の線を何割まで描いたか（0:00〜0:03 に鉛筆で 1 つずつ描く） */
const Dial: React.FC<{ cx: number; deg: number; done: boolean; label: string; underline?: number; opacity?: number; labelP?: number; drawP?: number }> = ({ cx, deg, done, label, underline = 0, opacity = 1, labelP = 1, drawP = 1 }) => {
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
      <text x={cx} y={labelY} textAnchor="middle" fontFamily={JP} fontSize={34} fontWeight={700} fill={INK} opacity={labelP > 0 ? 1 : 0}>
        <tspan>{label.slice(0, Math.ceil(label.length * labelP))}</tspan>
        <tspan fill="transparent">{label.slice(Math.ceil(label.length * labelP))}</tspan>
      </text>
      {drawP < 1 ? (
        <circle cx={cx} cy={y} r={r} fill="none" stroke={INK} strokeWidth={5} pathLength={1} strokeDasharray={`${drawP} 1`} transform={`rotate(-90 ${cx} ${y})`} opacity={drawP > 0 ? 1 : 0} />
      ) : (
        <g>
      {underline > 0 && <rect x={cx - w / 2} y={labelY + 14} width={w * underline} height={6} rx={3} fill={INK} />}
      <circle cx={cx} cy={y} r={r} fill={FACE} />
      {under && <circle cx={cx} cy={y} r={r - 2.5} fill={under} />}
      {sweep && <path d={sweep} fill={over} />}
      {/* 外の枠線は、進んだ時間の色の上に描く（色が枠線を埋めて線が細く薄く見えないように。11/5 作者の指摘） */}
      <circle cx={cx} cy={y} r={r} fill="none" stroke={INK} strokeWidth={5} />
      {Array.from({ length: 12 }, (_, i) => {
        const t = (i * 30 * Math.PI) / 180;
        return <line key={i} x1={cx + Math.sin(t) * (r - 12)} y1={y - Math.cos(t) * (r - 12)} x2={cx + Math.sin(t) * (r - 2)} y2={y - Math.cos(t) * (r - 2)} stroke={INK} strokeWidth={4} />;
      })}
      <line x1={cx} y1={y} x2={hx} y2={hy} stroke={done ? LAP_FILLS[3] : INK} strokeWidth={done ? 9 : 6} strokeLinecap="round" />
      <circle cx={cx} cy={y} r={9} fill={done ? LAP_FILLS[3] : INK} />
      <text x={cx} y={y + r + 46} textAnchor="middle" fontFamily={FONT_PEN} fontSize={30} fill={INK} opacity={0.75}>〜秒</text>
        </g>
      )}
    </g>
  );
};

/** 時計 2 つ（g は冒頭からのコマ） */
export const Clocks: React.FC<{ g: number; underline?: number; opacity?: number; draw?: [number, number, number, number] }> = ({ g, underline = 0, opacity = 1, draw = [1, 1, 1, 1] }) => (
  <g>
    <Dial cx={CLOCKS.text} deg={handDeg("text", g)} done={false} label="文書で読む" underline={underline} opacity={opacity} labelP={draw[0]} drawP={draw[2]} />
    <Dial cx={CLOCKS.card} deg={handDeg("card", g)} done={g - 2.5 * FPS >= CARD_STOP} label="絵のカードで読む" opacity={opacity} labelP={draw[1]} drawP={draw[3]} />
  </g>
);

// ---- 木の紙芝居の枠（両開きの扉つき） ----

// 11/5 夜 v4（作者の「枠を大きく」）: 枠の外側は横 200〜1080・縦 36.5〜563.5（1920×1080 では 300〜1620・55〜845。横幅の 69%）。屋根の山は y=10 まで。
// 窓（紙）は 786.7×442.7（1080 では 1180×664。ちょうど 16:9 で、録画が余白なしで入る）。0:13 から 3:00 まで同じ所に置く
export const FRAME = { w: 880, h: 527, cy: 300, inset: 46.67, insetY: 42 };
/** 枠の窓（紙の入る所） */
export const WIN = { x: 640 - FRAME.w / 2 + FRAME.inset, y: FRAME.cy - FRAME.h / 2 + FRAME.insetY, w: FRAME.w - FRAME.inset * 2, h: FRAME.h - FRAME.insetY * 2 };
/** 床（1080 では 850 より下）の上の端 */
export const FLOOR_Y = 566.7;
export const FLOOR = "#3a316c";
const WOOD = "#8a5a32";
const WOOD_DARK = "#5c3a1e";
const WOOD_DOOR = "#b07a46";
const WOOD_INNER = "#d9a96f";

/**
 * 扉の開く角度（11/5 夜 v4 作者の「実際の木の箱は外側にパカッと開く」）。lt は開き始めからの秒。
 * 0〜0.35 秒で 0°→90°（こちらへ回って外の面が細くなる）、0.35〜0.55 秒で 90°→125°（内の面が見えて外へ広がる）、0.55〜0.7 秒で 115° に戻る（カタッ）
 */
export const doorDeg = (lt: number) => {
  if (lt <= 0) return 0;
  if (lt < 0.35) return 90 * Math.sin((lt / 0.35) * (Math.PI / 2));
  if (lt < 0.55) return 90 + 35 * ((lt - 0.35) / 0.2);
  if (lt < 0.7) return 125 - 10 * ((lt - 0.55) / 0.15);
  return 115;
};

/** 扉が窓にかぶっている幅（片側。90° を越えると扉は窓の外なので 0）。枠の中の紙（L3）を扉の所で切り取るのに使う */
export const doorCover = (deg: number) => (WIN.w / 2) * Math.max(0, Math.cos((deg * Math.PI) / 180));

/** deg は扉の開く角度（0 で閉じる、115 で開ききる。open を渡すと open×115）。children は扉の奥の絵（題など）。線は手で描いたように少し揺らす（WobbleDefs が要る） */
export const StageFrame: React.FC<{ cx: number; open?: number; deg?: number; children?: React.ReactNode }> = ({ cx, open = 0, deg, children }) => {
  const { w, h, cy } = FRAME;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const ix = x0 + FRAME.inset;
  const iy = y0 + FRAME.insetY;
  const iw = WIN.w;
  const ih = WIN.h;
  const half = iw / 2;
  const th = ((deg ?? open * 115) * Math.PI) / 180;
  // 扉はちょうつがい（窓の左右の端）を軸にこちらへ回る。見かけの幅は |cos θ|。自由な側の端は近づくので少し背が高くなる。90° を越えると内の面が外へ出る
  const door = (side: -1 | 1) => {
    const hinge = side < 0 ? ix : ix + iw;
    const c = Math.cos(th);
    const dw = half * Math.abs(c);
    const grow = ih * 0.054 * Math.sin(th);
    const inward = c >= 0; // まだ窓の上にかぶっている（外の面が見える）
    const fx = inward ? hinge - side * dw : hinge + side * dw;
    const pts = `${hinge},${iy} ${fx},${iy - grow / 2} ${fx},${iy + ih + grow / 2} ${hinge},${iy + ih}`;
    const shade = inward ? 1 - 0.45 * Math.sin(th) : 0.8 + 0.2 * Math.min(1, (th - Math.PI / 2) / 0.4);
    const mid = (hinge + fx) / 2;
    return (
      <g>
        <polygon points={pts} fill={inward ? WOOD_DOOR : WOOD_INNER} stroke={WOOD_DARK} strokeWidth={4} strokeLinejoin="round" style={{ filter: `brightness(${shade})` }} />
        {dw > 30 && <polygon points={`${hinge + (fx - hinge) * 0.12},${iy + 26} ${hinge + (fx - hinge) * 0.88},${iy + 26 - grow * 0.4} ${hinge + (fx - hinge) * 0.88},${iy + ih - 26 + grow * 0.4} ${hinge + (fx - hinge) * 0.12},${iy + ih - 26}`} fill="none" stroke={WOOD_DARK} strokeWidth={3} opacity={0.5} />}
        {inward && dw > 30 && <circle cx={fx + side * 22} cy={cy} r={9} fill="#e8d6a8" stroke={WOOD_DARK} strokeWidth={3} />}
        {!inward && dw > 20 && <path d={`M${mid} ${iy + 40}V${iy + ih - 40}`} stroke={WOOD_DARK} strokeWidth={2} opacity={0.3} />}
      </g>
    );
  };
  return (
    <g filter="url(#wobble)">
      {/* 枠の上の飾り（ゆるい山形。真ん中で y=10） */}
      <path d={`M${x0 + 50} ${y0}Q${cx} ${2 * 10 - y0} ${x0 + w - 50} ${y0}Z`} fill={WOOD} stroke={WOOD_DARK} strokeWidth={5} />
      <rect x={x0} y={y0} width={w} height={h} rx={12} fill={WOOD} stroke={WOOD_DARK} strokeWidth={6} />
      {/* 木目 */}
      {[0.25, 0.5, 0.75].map((t) => (
        <path key={t} d={`M${x0 + 8} ${y0 + 12 + t * 8}H${x0 + w - 8}M${x0 + 8} ${y0 + h - 30 + t * 8}H${x0 + w - 8}`} stroke={WOOD_DARK} strokeWidth={2} opacity={0.35} />
      ))}
      <rect x={ix} y={iy} width={iw} height={ih} fill="#2a1b0e" />
      <svg x={ix} y={iy} width={iw} height={ih} viewBox={`0 0 ${iw} ${ih}`}>
        {children}
      </svg>
      {door(-1)}
      {door(1)}
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

/** 手書き風の字体（字幕・見出し・めでたし） */
export const FONT_PEN = "HGKyokashotai, HG教科書体, UD Digi Kyokasho NK-R, Yu Gothic, sans-serif";

/**
 * 枠のまわりの光の輪（∞ の形に重なる横長の 2 つの輪）。0:16 から最後まで残る。
 * クリーム色・半透明・筆でこすった線（太い線と細い線を重ね、揺らす）
 */
export const LightRings: React.FC<{ o: number; k?: number; glow?: number }> = ({ o, k = 1, glow = 0 }) => {
  if (o <= 0) return null;
  const cy = 301.3;
  return (
    <g opacity={o} transform={`translate(640 ${cy}) scale(${k}) translate(-640 ${-cy})`} filter="url(#wobble-strong)" style={{ mixBlendMode: "screen" }}>
      {[-1, 1].map((s) => (
        <g key={s} transform={`rotate(${s * -3} ${640 + s * 133.3} ${cy})`}>
          <ellipse cx={640 + s * 133.3} cy={cy} rx={353} ry={253} fill="none" stroke="#efe2c0" strokeOpacity={0.3 + glow * 0.3} strokeWidth={30} />
          <ellipse cx={640 + s * 133.3} cy={cy + 6} rx={341} ry={241} fill="none" stroke="#fff6dc" strokeOpacity={0.2} strokeWidth={8} strokeDasharray="120 40 60 30" />
        </g>
      ))}
    </g>
  );
};

/**
 * 上から下りるステージライト 2 つと、その光の丸（11/5 夜 v4 作者の「ショーの前にライトがぐるぐる回って、最後に焦点が真ん中に合う」）。t は冒頭からの秒。
 * 0:13.5 に左、0:14.0 に右が下りる → 0:14.5〜0:16.0 に光が円を描いて回る → 0:16.0〜0:16.5 に真ん中で重なる → 0:17.5〜0:18.0 に輪へ溶けて消え、ライトの頭だけ残る。
 * 2:55.0 に左、2:55.5 に右が消えて上へ引き上げられる
 */
const C = { x: 640, y: 306.7 };
const LAMPS = [
  { x: 320, drop: 13.5, up: 175.0, spot: { x: 426.7, y: 200 }, dir: 1 },
  { x: 960, drop: 14.0, up: 175.5, spot: { x: 853.3, y: 200 }, dir: -1 },
];
const clampN = (v: number) => Math.min(1, Math.max(0, v));
export const lampSpot = (i: number, t: number) => {
  const L = LAMPS[i];
  const a0 = Math.atan2(L.spot.y - C.y, L.spot.x - C.x);
  const r0 = Math.hypot(L.spot.x - C.x, L.spot.y - C.y);
  const spin = clampN((t - 14.5) / 1.5);
  const shrink = clampN((t - 16.0) / 0.5);
  const ease = shrink * shrink * (3 - 2 * shrink);
  const a = a0 + L.dir * spin * Math.PI * 2;
  const r = r0 * (1 - ease);
  const on = clampN((t - L.drop - 0.4) / 0.15);
  const melt = 1 - clampN((t - 17.5) / 0.5);
  return { x: C.x + Math.cos(a) * r, y: C.y + Math.sin(a) * r, r: 173 + ease * 47, o: on * melt * (0.35 - ease * 0.05) };
};
export const StageLamps: React.FC<{ t: number }> = ({ t }) => (
  <g>
    {LAMPS.map((L, i) => {
      if (t < L.drop) return null;
      const d = clampN((t - L.drop) / 0.5);
      const bounce = t > L.drop + 0.5 && t < L.drop + 0.75 ? Math.sin(((t - L.drop - 0.5) / 0.25) * Math.PI) * 5 : 0;
      const up = clampN((t - L.up - 0.15) / 0.5);
      const y = -40 + (d * d * (3 - 2 * d)) * 60 + bounce - up * up * 90;
      const sp = lampSpot(i, t);
      const aim = t < 16.5 && sp.o > 0 ? Math.max(-15, Math.min(15, (Math.atan2(sp.y - y, sp.x - L.x) * 180) / Math.PI - 90)) : 0;
      const lit = t < L.up ? 1 : 0;
      const flick = 0.75 + 0.25 * Math.sin(t * 7 + i * 2);
      return (
        <g key={i}>
          {sp.o > 0 && <Light id={`lamp${i}`} x={sp.x} y={sp.y} r={sp.r} opacity={sp.o * 2.2} />}
          <line x1={L.x} y1={-10} x2={L.x} y2={y - 16} stroke="#20202a" strokeWidth={1.4} />
          <g transform={`translate(${L.x} ${y}) rotate(${-aim})`}>
            <rect x={-4} y={-20} width={8} height={6} fill="#2a2a33" />
            <path d="M-20 16Q-20 -16 0 -16Q20 -16 20 16Z" fill="#3b3b46" stroke="#1d1d24" strokeWidth={2} />
            <ellipse cx={0} cy={16} rx={20} ry={5} fill={lit ? "#ffe9a8" : "#555"} opacity={lit ? flick : 1} />
          </g>
        </g>
      );
    })}
  </g>
);

/** 舞台のぼかした丸い光 2 つ（0:13.5 と 0:14.0 に灯り、2:56.5 と 2:57.0 に消える）。t は冒頭からの秒 */
export const stageLights = (t: number) => {
  const on = (a: number, b: number) => Math.min(Math.max((t - a) / 0.4, 0), 1) * (1 - Math.min(Math.max((t - b) / 0.4, 0), 1));
  const settle = Math.min(Math.max((t - 16) / 1.5, 0), 1);
  return [
    { x: 470, y: 280, r: 175, o: on(13.5, 176.5) * (1 - settle * 0.5) },
    { x: 830, y: 390, r: 195, o: on(14.0, 177.0) * (1 - settle * 0.5) },
  ];
};
