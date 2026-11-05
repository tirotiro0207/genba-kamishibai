// ポータル（台本 v2 の 0:35〜0:39）: 「電気業界」のポータルへ、主人公（アプリのピクトグラムの人）が歩いて入り、ワープの光になる。
// ポータルの真ん中の印は、git の外の素材（private/brand/portal-mark.svg）があれば書き出しのときにそれを読み、形も色も変えずに置く。
// 無いときは、自分で描いた円と稲妻の一般的な印を出す（許可が出るまで、公開のリポジトリに印を入れないため）
import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { characterSvg } from "../../src/shared/picto/character";
import { gait } from "./paper";
import { FONT_JP } from "./parts";
import { FPS, H, PURPLE, W } from "./timeline";

export const PORTAL_FRAMES = 4 * FPS;
export interface PortalProps { [key: string]: unknown; /** 印の SVG（data URL）。無ければ一般的な印 */ mark?: string }

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const sec = (s: number) => s * FPS;
/** 一般的な印の色（えんじ）と、ポータルの光（同じ色を少し明るく） */
const MARK = "#9b2335";
const GLOW = "#e0607a";
const GLOW_LIGHT = "#ffc4cf";
const GROUND = 620;
const PX = 900; // ポータルの中心
const PY = 400;
const RX = 140;
const RY = 190;

/** 一般的な印: 円の中に稲妻 */
const GenericMark: React.FC<{ r: number }> = ({ r }) => (
  <g>
    <circle r={r} fill="#fff" stroke={MARK} strokeWidth={r * 0.14} />
    <path d={`M${r * 0.12} ${-r * 0.72}L${-r * 0.42} ${r * 0.08}H${-r * 0.02}L${-r * 0.16} ${r * 0.72}L${r * 0.44} ${-r * 0.12}H${r * 0.04}Z`} fill={MARK} />
  </g>
);

const Mark: React.FC<{ src?: string; r: number }> = ({ src, r }) =>
  src ? (
    <g>
      <circle r={r * 1.08} fill="#fff" opacity={0.92} />
      <image href={src} x={-r} y={-r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMid meet" />
    </g>
  ) : (
    <GenericMark r={r} />
  );

/** 稲妻の火花（ポータルのふちで、ぱっと出て消える） */
const spark = (a: number, len: number) => {
  const x0 = PX + Math.cos(a) * RX * 1.02;
  const y0 = PY + Math.sin(a) * RY * 1.02;
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  const tx = -ny;
  const ty = nx;
  const pts = [0, 0.35, 0.6, 1].map((t, i) => [x0 + nx * len * t + tx * (i % 2 ? 10 : -6), y0 + ny * len * t + ty * (i % 2 ? 10 : -6)]);
  return `M${pts.map((p) => p.join(" ")).join("L")}`;
};

export const Portal: React.FC<PortalProps> = ({ mark }) => {
  const f = useCurrentFrame();
  const open = interpolate(f, [0, sec(0.6)], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.4)) });
  const spin = f * 4;
  // 主人公: 左から歩いてきて（0〜2.5 秒）、ポータルに入りながら小さくなって消える（2.5〜3.2 秒）
  const walkEnd = sec(2.5);
  const inEnd = sec(3.2);
  const x = f < walkEnd ? interpolate(f, [0, walkEnd], [180, PX - 150], clamp) : interpolate(f, [walkEnd, inEnd], [PX - 150, PX], { ...clamp, easing: Easing.in(Easing.quad) });
  const shrink = interpolate(f, [walkEnd, inEnd], [1, 0.15], { ...clamp, easing: Easing.in(Easing.quad) });
  const heroO = interpolate(f, [inEnd - 6, inEnd], [1, 0], clamp);
  const ground = interpolate(shrink, [0.15, 1], [PY + 30, GROUND]);
  const hero = characterSvg({ angles: gait("walk", f / sec(0.55)), x, groundY: ground, height: 300 * shrink, facing: "right", view: "quarter", role: "new", headwear: "none" });
  // ワープ: 入りきったら光の輪が広がる
  const flash = interpolate(f, [inEnd, PORTAL_FRAMES - 1], [0, 1], clamp);
  const sign = interpolate(f, [sec(0.3), sec(0.8)], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  return (
    <AbsoluteFill style={{ background: PURPLE }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <radialGradient id="portal-in">
            <stop offset="0%" stopColor={GLOW_LIGHT} />
            <stop offset="55%" stopColor={GLOW} stopOpacity={0.85} />
            <stop offset="100%" stopColor={MARK} stopOpacity={0.9} />
          </radialGradient>
          <radialGradient id="portal-halo">
            <stop offset="60%" stopColor={GLOW} stopOpacity={0.5} />
            <stop offset="100%" stopColor={GLOW} stopOpacity={0} />
          </radialGradient>
          <clipPath id="portal-clip">
            <ellipse cx={PX} cy={PY} rx={RX * open} ry={RY * open} />
          </clipPath>
        </defs>
        {/* 床 */}
        <rect x={0} y={GROUND} width={W} height={H - GROUND} fill="#3a316c" />
        {/* ポータル */}
        <ellipse cx={PX} cy={PY} rx={RX * 1.45 * open} ry={RY * 1.3 * open} fill="url(#portal-halo)" />
        <ellipse cx={PX} cy={PY} rx={RX * open} ry={RY * open} fill="url(#portal-in)" />
        <g clipPath="url(#portal-clip)">
          {Array.from({ length: 6 }, (_, i) => (
            <ellipse key={i} cx={PX} cy={PY} rx={RX * (0.3 + i * 0.13)} ry={RY * (0.3 + i * 0.13)} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={6} strokeDasharray={`${40 + i * 12} ${30 + i * 8}`} transform={`rotate(${(i % 2 ? -1 : 1) * spin * (1 + i * 0.2)} ${PX} ${PY})`} />
          ))}
        </g>
        <ellipse cx={PX} cy={PY} rx={RX * open} ry={RY * open} fill="none" stroke={GLOW_LIGHT} strokeWidth={8} />
        {/* ふちの火花（0.2 秒ごとに場所が替わる） */}
        {open > 0.9 &&
          [0, 1, 2].map((i) => {
            const k = Math.floor(f / 6) + i * 7;
            const a = ((k * 137) % 360) * (Math.PI / 180);
            return <path key={i} d={spark(a, 40 + (k % 3) * 14)} fill="none" stroke={GLOW_LIGHT} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={(f % 6) < 4 ? 0.95 : 0.2} />;
          })}
        {/* 真ん中の印（形と色は変えない） */}
        <g transform={`translate(${PX} ${PY}) scale(${open})`}>
          <Mark src={mark} r={58} />
        </g>
        {/* 「電気業界」の札 */}
        <g transform={`translate(${PX} ${PY - RY - 70}) scale(${sign})`}>
          <rect x={-120} y={-36} width={240} height={72} rx={10} fill="#8a5a32" stroke="#5c3a1e" strokeWidth={5} />
          <text y={14} textAnchor="middle" fontFamily={FONT_JP} fontSize={40} fontWeight={700} fill="#fff7e0">
            電気業界
          </text>
        </g>
        {/* 主人公（アプリのピクトグラムの人） */}
        <ellipse cx={x} cy={ground + 4} rx={60 * shrink} ry={8 * shrink} fill="#000" opacity={0.2 * heroO} />
        <g opacity={heroO} dangerouslySetInnerHTML={{ __html: hero }} />
        {/* ワープの光 */}
        {flash > 0 && (
          <>
            <ellipse cx={PX} cy={PY} rx={RX * (1 + flash * 5)} ry={RY * (1 + flash * 4)} fill="none" stroke={GLOW_LIGHT} strokeWidth={30 * (1 - flash) + 2} opacity={1 - flash * 0.8} />
            <rect width={W} height={H} fill="#fff" opacity={interpolate(flash, [0.4, 1], [0, 0.9], clamp)} />
          </>
        )}
      </svg>
    </AbsoluteFill>
  );
};
