// 絵コンテ v6（11/7 夜）: 3:00 ちょうどの通し。段は A 事故と仕事の意味 → B 紙が紙芝居になりかけて一時停止 → C 作者の自撮り →
// D 再生・題・なぜ作ったか → E デモ → F 11/6 の現場 → G 結びとクレジット。秒は docs/video.md の「絵コンテ v6」に合わせる。
// 紙芝居の箱・紙の人・むかしむかしの絵は v4 の通し（full.tsx）を Freeze して使い、v4 の何秒を出すかは stageAt で決める。
// 窓に流す映像と写真は git の外の素材を video/prep-footage-v3.py（表は private/footage-v6.json）で out/pub/v6/ に切ったもの。
// 顔・名札・PC のシール・URL・承認欄の実名・作業服の社名は、切る段でぼかすか外してある。
// クレジットの字は書き出すときに git の外のファイルから props で受け取る（名前と社名をコードに書かない）。
import React from "react";
import demoCuts from "../demo-cuts-v6.json";
import { AbsoluteFill, Easing, Freeze, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { characterSvg } from "../../src/shared/picto/character";
import { INDUSTRY_DRAFTS } from "../../src/shared/picto/industry-drafts";
import { frameAt } from "../../src/shared/picto/motion";
import { POSES } from "../../src/shared/picto/poses";
import { renderFrame } from "../../src/shared/picto/scene";
import { MOTION } from "../../tests/fixtures/card";
import { FullLayer } from "./full";
import { IntroLook } from "./intro";
import { L, LAYERS, LayerCtx } from "./layers";
import { SheetLook } from "./origami";
import { PAPER, PAPER_EDGE, PAPER_FAR } from "./paper";
import { FONT_JP, FONT_PEN, WIN } from "./parts";
import { StoryLook } from "./story";
import { FPS, H, W } from "./timeline";
import { oldAt } from "./v3";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.inOut(Easing.quad);
const prog = (t: number, t0: number, d = 0.3) => interpolate(t, [t0, t0 + d], [0, 1], clamp);
const lin = (t: number, a: number, b: number, c: number, d: number) => interpolate(t, [a, b], [c, d], clamp);

// ---- 段の表（絵コンテ v6 の秒） ----
export interface Seg6 { id: string; title: string; at: number; len: number }
export const SEGS6: Seg6[] = [
  { id: "a-accident", title: "A 事故と、この仕事の意味", at: 0, len: 21.5 },
  { id: "b-pause", title: "B 紙が紙芝居になりかけて一時停止", at: 21.5, len: 5.8 },
  { id: "c-selfie", title: "C 作者の自撮り", at: 27.3, len: 21.2 },
  { id: "d-why", title: "D 再生・題・なぜ作ったか", at: 48.5, len: 10.5 },
  { id: "e-demo", title: "E デモ: 1 枚の事故シートが、命を守るカードになるまで", at: 59, len: 47 },
  { id: "f-site", title: "F 11/6、電気工事の現場で", at: 106, len: 32.5 },
  { id: "g-end", title: "G 結び: 職人さんが絵カードになり、ほかの仕事へ広がる", at: 138.5, len: 41.5 },
];
export const V6_FRAMES = 180 * FPS;
export interface V6Props { credits?: string[]; [key: string]: unknown }

// 仮のまま残っている所（VIDEO_FINAL=1 の書き出しは、ここが空でないと止まる）
export const KARI6 = ["自撮り（仮）", "数字の枠（仮）"];

// ---- 字幕（1 場面 1 行・22 字まで。書き出しで字の高さ 64 px 前後・白に黒の縁・画面の下 3 分の 1） ----
// かぎかっこは元の言葉どおりのときだけ（出どころは docs/video.md の字幕の一覧）
export const CUES6: [number, number, string][] = [
  [2.5, 5.0, "床に残っていたのは、焼けた作業服"],
  [5.0, 7.5, "『多分大丈夫だろう』。電気が来たまま作業した"],
  [8.0, 11.5, "別の現場。電気の事故で、顔と両手にやけど"],
  [11.5, 13.0, "皮膚を移す手術を受けた"],
  [13.0, 16.0, "それでも、電気工事士たちは今日も現場に立つ"],
  [16.0, 18.5, "街の明かりを、止めないために"],
  [18.5, 20.0, "事故の教訓は、日本語の紙 1 枚"],
  [20.0, 21.5, "読めなければ、届かない"],
  [23.5, 25.0, "AI が絵にして、別の AI が確かめる"],
  [25.0, 26.8, "人が署名したカードだけを、現場へ"],
  [27.3, 28.8, "ここで失礼します"],
  [28.8, 32.3, "作者のイチロー。普段はクリエイター"],
  [32.3, 37.8, "創業 100 年超の電気工事会社で、顧問"],
  [37.8, 41.1, "現場で話を聞き、課題をほどく毎日"],
  [41.1, 45.9, "ピクトグラムと紙芝居で、見て分かるカードに"],
  [45.9, 48.3, "しばし、紙芝居にお付き合いください"],
  [52.0, 53.5, "作者は子どものころ、日本語が分からなかった"],
  [53.5, 55.0, "それでもゲームは、最後までクリアできた"],
  [55.0, 56.8, "いい画面は、言葉を越えて伝わる"],
  [56.8, 59.0, "でも現場では、伝わらないと危ない"],
  [59.0, 62.0, "冒頭の紙を、入れる"],
  [62.0, 67.0, "AI が、守ることを 1 行ずつ取り出す"],
  [67.0, 71.0, "言葉の要らない、4 コマの絵に"],
  [71.0, 73.0, "別の AI が、絵だけを見て読む"],
  [73.0, 76.0, "AI が、逆の読み方を見つけた"],
  [76.0, 79.0, "監修者は、絵を枠で囲んで直せる"],
  [79.0, 82.0, "直した絵が、かえって危なくなった"],
  [82.0, 85.5, "「検電器が反応したら作業に進んでよい」"],
  [85.5, 88.5, "逆に読めば、電気の来た盤に手を出す"],
  [88.5, 92.0, "鳴ったら触らない。鳴らないのを確かめてから"],
  [92.0, 94.0, "直したら、もう一度確かめる"],
  [94.0, 97.5, "署名したカードだけが、現場に届く"],
  [97.5, 101.5, "命に関わるカードには、赤い縁"],
  [101.5, 106.0, "訳さず、絵とやさしい日本語で届ける"],
  [107.5, 110.0, "新入社員に、カードを試してもらった"],
  [110.0, 112.5, "一人ずつ、自分の言葉で答える"],
  [115.0, 118.0, "1 つ動いたら、1 つ確かめる"],
  [118.0, 122.0, "監修者が見て、納得したカードにだけ署名した"],
  [122.0, 124.5, "その日の夕方、設備室の壁に貼った"],
  [124.5, 126.5, "事故は、自信と過信の間で起きる"],
  [126.5, 128.5, "ベテランの職人さんに、使ってもらった"],
  [128.5, 131.5, "標識のように、ベテランにも 2 つ目のブレーキ"],
  [131.5, 132.5, "その場にいた社員の声"],
  [132.5, 135.5, "「経験が少ないものも、絵だとわかりやすい」"],
  [135.5, 138.5, "紙の絵と、本物の検電器がつながる"],
  [138.5, 142.5, "職人さんが、カードを指して話す"],
  [146.0, 148.5, "この 1 枚から"],
  [148.5, 152.5, "同じ仕組みで、ほかの現場にも"],
  [152.5, 156.5, "言葉の壁は、どの仕事にもある"],
  [160.0, 164.0, "電気工事士は、街の明かりを守っている"],
  [164.0, 167.0, "その人たちを、紙芝居で守る"],
];
const SUB_FS = 51;
const SUB_Y = 690;
const Subtitle6: React.FC<{ t: number }> = ({ t }) => {
  const cue = CUES6.find((c) => t >= c[0] && t < c[1]);
  if (!cue) return null;
  const [a, b, text] = cue;
  const rate = Math.max(30, text.length / ((b - a) * 0.35));
  const n = Math.min(text.length, Math.floor((t - a) * rate) + 1);
  const o = 1 - prog(t, b - 0.18, 0.18);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, opacity: o }}>
      <text x={W / 2} y={SUB_Y} textAnchor="middle" fontFamily={FONT_PEN} fontSize={SUB_FS} fontWeight={700} fill="#fff" stroke="#000" strokeWidth={8} strokeLinejoin="round" style={{ paintOrder: "stroke" }}>
        <tspan>{text.slice(0, n)}</tspan>
        <tspan fill="none" stroke="none">{text.slice(n)}</tspan>
      </text>
    </svg>
  );
};
/** 右上の「通しの仮版」の札（自撮りと数字が入って仮が無くなったら外す） */
const DraftTag: React.FC = () => (
  <div style={{ position: "absolute", right: 14, top: 12, padding: "4px 10px", background: "rgba(0,0,0,0.55)", color: "#fff", fontFamily: FONT_JP, fontSize: 16, borderRadius: 4 }}>通しの仮版</div>
);

// ---- 共通の部品 ----
/** 中身を、焦点（割合）を止めたまま k 倍にする */
const Zoom: React.FC<{ k: number; fx: number; fy: number; children: React.ReactNode }> = ({ k, fx, fy, children }) => (
  <div style={{ position: "absolute", inset: 0, transformOrigin: `${fx * 100}% ${fy * 100}%`, transform: `scale(${k})` }}>{children}</div>
);
/** 映像の一部（from〜to の秒）を at から len 秒で流す */
const Vid: React.FC<{ src: string; at: number; len: number; from: number; to: number; fit?: "contain" | "cover" }> = ({ src, at, len, from, to, fit = "contain" }) => (
  <Sequence from={Math.round(at * FPS)} durationInFrames={Math.round(len * FPS)} layout="none">
    <OffthreadVideo src={staticFile(src)} muted startFrom={Math.round(from * FPS)} playbackRate={(to - from) / len} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit }} />
  </Sequence>
);
const Pic: React.FC<{ src: string; fit?: "contain" | "cover"; style?: React.CSSProperties }> = ({ src, fit = "contain", style }) => (
  <Img src={staticFile(src)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit, ...style }} />
);

// ---- 夜のピクトグラムの街（0:16 と 2:40）。窓の明かりは on(i) の秒から 1 つずつ灯る ----
const BUILDINGS = Array.from({ length: 15 }, (_, i) => {
  const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
  return { x: i * 88 - 10, w: 66 + r * 24, h: 150 + ((r * 7) % 1) * 260 };
});
const WINDOWS = BUILDINGS.flatMap((b, i) => Array.from({ length: Math.floor((b.h - 20) / 30) * 2 }, (_, j) => ({ b: i, j })));
const lightOrder = (k: number) => (Math.abs(Math.sin(k * 78.233) * 12543.11) % 1);
const City: React.FC<{ t: number; t0: number; t1: number; glow?: number }> = ({ t, t0, t1, glow = 0 }) => (
  <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
    <rect width={W} height={H} fill="#0e1430" />
    <circle cx={1040} cy={120} r={38} fill="#f6efc8" opacity={0.85} />
    {BUILDINGS.map((b, i) => (
      <rect key={i} x={b.x} y={H - 40 - b.h} width={b.w} height={b.h} fill="#1c2346" stroke="#2c3563" strokeWidth={2} />
    ))}
    {WINDOWS.map((wd, k) => {
      const b = BUILDINGS[wd.b];
      const on = prog(t, t0 + lightOrder(k) * (t1 - t0), 0.12);
      const x = b.x + 10 + (wd.j % 2) * (b.w / 2 - 4);
      const y = H - 40 - b.h + 14 + Math.floor(wd.j / 2) * 30;
      return (
        <g key={k} opacity={on}>
          {glow > 0 && <rect x={x - 4} y={y - 4} width={b.w / 2 - 10} height={20} rx={4} fill="#ffd968" opacity={glow * 0.25} />}
          <rect x={x} y={y} width={b.w / 2 - 18} height={12} fill="#ffd968" opacity={0.92} />
        </g>
      );
    })}
    <rect y={H - 40} width={W} height={40} fill="#141a36" />
  </svg>
);

// ---- A. 事故と、この仕事の意味（0:00〜0:21.5） ----
const Vignette: React.FC<{ o?: number }> = ({ o = 1 }) => (
  <div style={{ position: "absolute", inset: 0, opacity: o, background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)" }} />
);
const SW = 1934;
const SH = 2400;
const PAGE_H = H - 40;
const PAGE_W = (PAGE_H * SW) / SH;
const PartA: React.FC<{ t: number }> = ({ t }) => {
  if (t >= 21.5) return null;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {/* 0:01.0〜0:01.2 白い閃光 */}
      {t >= 1.0 && t < 1.2 && <AbsoluteFill style={{ background: "#fff" }} />}
      {/* 0:01.2〜0:07.5 床に残った焼けた作業服。ゆっくり寄り、0:05 からヘルメットと赤い手袋の方へ右に流す */}
      {t >= 1.2 && t < 7.5 && (
        <AbsoluteFill style={{ opacity: prog(t, 1.2, 0.25) * (1 - prog(t, 7.3, 0.2)) }}>
          <Zoom k={t < 5 ? lin(t, 1.2, 5, 1.0, 1.08) : interpolate(t, [5, 7.5], [1.08, 1.15], { ...clamp, easing: ease })} fx={t < 5 ? 0.5 : interpolate(t, [5, 7.5], [0.5, 0.82], { ...clamp, easing: ease })} fy={t < 5 ? 0.5 : interpolate(t, [5, 7.5], [0.5, 0.45], { ...clamp, easing: ease })}>
            <Pic src="v6/a7.png" fit="cover" />
          </Zoom>
          <Vignette />
        </AbsoluteFill>
      )}
      {/* 0:08.0〜0:13.0 包帯の顔と両手 → 両手に寄って止める */}
      {t >= 8 && t < 13 && (
        <AbsoluteFill style={{ opacity: prog(t, 8, 0.3) * (1 - prog(t, 12.8, 0.2)) }}>
          <Zoom k={t < 11.5 ? lin(t, 8, 11.5, 1.0, 1.12) : interpolate(t, [11.5, 12.1], [1.12, 1.7], { ...clamp, easing: ease })} fx={0.5} fy={t < 11.5 ? 0.45 : interpolate(t, [11.5, 12.1], [0.45, 0.74], { ...clamp, easing: ease })}>
            <Pic src="v6/a6.jpg" />
          </Zoom>
          <Vignette o={0.6} />
        </AbsoluteFill>
      )}
      {/* 0:13.0〜0:16.0 胸ポケットから出した本物の検電器（手元だけ） */}
      {t >= 13 && t < 16 && (
        <AbsoluteFill style={{ opacity: prog(t, 13, 0.25) }}>
          <Vid src="v6/hand1.mp4" at={13} len={3} from={0} to={3} fit="cover" />
        </AbsoluteFill>
      )}
      {/* 0:16.0〜0:18.5 夜の街。窓の明かりが 1 つずつ灯る。ゆっくり引く */}
      {t >= 16 && t < 18.5 && (
        <AbsoluteFill style={{ opacity: prog(t, 16, 0.3) }}>
          <Zoom k={interpolate(t, [16, 18.5], [1.14, 1.0], { ...clamp, easing: ease })} fx={0.5} fy={0.7}>
            <City t={t} t0={16.1} t1={18.3} />
          </Zoom>
        </AbsoluteFill>
      )}
      {/* 0:18.5〜0:21.5 事例シート 06 の全体（紙 1 枚として）→ 字がにじむ */}
      {t >= 18.5 && (
        <AbsoluteFill style={{ background: "#fbfaf5", opacity: prog(t, 18.5, 0.3) }}>
          <Img src={staticFile("v6/sheet.png")} style={{ position: "absolute", left: (W - PAGE_W) / 2, top: 20, width: PAGE_W, height: PAGE_H, filter: `blur(${lin(t, 20, 21, 0, 7)}px)`, opacity: 1 - prog(t, 21.3, 0.2) }} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
// 0:21.5〜0:22.4 紙 1 枚が 2 枚の正方形に分かれて、折る置き場へ動きながら 45° 回って裏返る（v4 の 0:04 の 2 枚の紙に重なる）
const KF = 1.6 / Math.SQRT2;
const SLOTS = [{ x: 880, y: 420 }, { x: 400, y: 420 }];
const Split: React.FC<{ t: number }> = ({ t }) => {
  if (t < 21.4 || t >= 22.4) return null;
  const app = prog(t, 21.4, 0.15);
  const m = interpolate(t, [21.5, 22.4], [0, 1], { ...clamp, easing: ease });
  const side0 = PAGE_W * 0.8;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
      {SLOTS.map((s, i) => {
        const x = W / 2 + (i === 0 ? 1 : -1) * 12 * app + (s.x - W / 2) * m;
        const y = H / 2 + (s.y - H / 2) * m - Math.sin(m * Math.PI) * 40;
        const side = side0 + (200 * KF - side0) * m;
        const flip = Math.cos(m * Math.PI);
        const sx = Math.max(0.02, Math.abs(flip));
        return (
          <g key={i} opacity={app} transform={`translate(${x} ${y}) rotate(${-45 * m}) scale(${sx} 1)`}>
            {flip > 0 ? (
              <image href={staticFile("v3/fold.png")} x={-side / 2} y={-side / 2} width={side} height={side} preserveAspectRatio="xMidYMid slice" />
            ) : (
              <rect x={-side / 2} y={-side / 2} width={side} height={side} fill={PAPER_FAR} />
            )}
            <rect x={-side / 2} y={-side / 2} width={side} height={side} fill="none" stroke={PAPER_EDGE} strokeWidth={1.6} />
          </g>
        );
      })}
    </svg>
  );
};

// ---- 舞台（v4 の通しの絵）: v6 の秒 → v4 の秒 ----
interface StageView { v4: number; k?: number; fx?: number; fy?: number; noScrolls?: boolean; o?: number; only2?: boolean }
const PAUSE_V4 = 10.8; // 枠が右から 3 分の 1 ほど引き出された所
const sho = (s: number) => oldAt(s) ?? 174;
export const stageAt = (t: number): StageView | null => {
  if (t < 22.4) return null;
  if (t < 23.5) return { v4: lin(t, 22.4, 23.5, 4.0, 6.3) };
  if (t < 25.0) return { v4: lin(t, 23.5, 25.0, 7.4, 8.9) };
  if (t < 26.8) return { v4: lin(t, 25.0, 26.8, 9.0, PAUSE_V4) };
  if (t < 48.5) return { v4: PAUSE_V4 };
  if (t < 49.3) return { v4: interpolate(t, [48.5, 49.3], [PAUSE_V4, 11.6], { ...clamp, easing: ease }) };
  if (t < 50.1) return { v4: lin(t, 49.3, 50.1, 11.6, 15.5) };
  if (t < 50.7) return { v4: lin(t, 50.1, 50.7, 15.5, 17.0) };
  if (t < 52.0) return { v4: lin(t, 50.7, 52.0, 17.0, 18.8) };
  if (t < 53.5) return { v4: lin(t, 52.0, 53.5, sho(37.0), sho(38.0)) };
  if (t < 55.0) return { v4: lin(t, 53.5, 55.0, sho(38.5), sho(40.0)), k: lin(t, 53.5, 55, 1, 1.12), fx: 0.56, fy: 0.36 };
  if (t < 56.8) return { v4: lin(t, 55.0, 56.8, sho(40.5), sho(42.0)) };
  if (t < 59.0) return { v4: lin(t, 56.8, 59.0, sho(43.0), sho(44.5)), k: interpolate(t, [56.8, 59], [1, 1.3], { ...clamp, easing: ease }), fx: 0.67, fy: 0.38, noScrolls: true };
  if (t < 106) return { v4: sho(65 + ((t - 59) * 45) / 47) };
  if (t < 138.5) return { v4: sho(110 + ((t - 106) * 42) / 32.5) };
  if (t < 142.5) return { v4: sho(148 + (t - 138.5)) };
  if (t < 161.2) return { v4: sho(151.9), o: 1 - prog(t, 160.4, 0.8) };
  if (t >= 167 && t < 169.6) return { v4: interpolate(t, [167, 169], [16.7, 16.2], { ...clamp, easing: ease }), only2: true, o: 1 - prog(t, 169.3, 0.3) };
  return null;
};

// ---- B. 紙の人が掲げる赤い判のカード（0:23.7〜0:26.8） ----
const CARD_SVG = renderFrame(frameAt(MOTION, 3)).svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
const RedCard: React.FC<{ t: number; x: number; y: number; s?: number }> = ({ t, x, y, s = 1 }) => {
  const p = prog(t, 23.7, 0.35);
  return (
    <g transform={`translate(${x} ${y}) rotate(${-6 + 6 * p}) scale(${s * (0.6 + 0.4 * p)})`} opacity={p}>
      <rect x={-62} y={-62} width={124} height={124} rx={8} fill="#fff" stroke="#c0392b" strokeWidth={6} />
      <g transform="translate(-54 -54) scale(0.144)" dangerouslySetInnerHTML={{ __html: CARD_SVG }} />
      <circle cx={40} cy={40} r={19} fill="#fff" stroke="#c0392b" strokeWidth={3} />
      <text x={40} y={47} textAnchor="middle" fontFamily={FONT_JP} fontSize={18} fontWeight={700} fill="#c0392b">判</text>
    </g>
  );
};
const PartBOver: React.FC<{ t: number }> = ({ t }) => {
  if (t < 23.7 || t >= 26.8) return null;
  // 紙の人の上げた手の先（v4 の 0:07.4〜0:10.6 の紙の人に合わせる）。0:25 からは右へ歩く人と一緒に動く
  const walk = t < 25 ? 0 : interpolate(t, [25, 26.0], [0, 1], { ...clamp, easing: ease });
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
      <RedCard t={t} x={840 + walk * 520} y={190 + walk * 120} s={1 - walk * 0.3} />
    </svg>
  );
};

// ---- 一時停止と再生のマーク（0:26.8・0:48.3） ----
const PauseMark: React.FC<{ t: number }> = ({ t }) => {
  const showPause = (t >= 26.8 && t < 27.6) || (t >= 48.1 && t < 48.3);
  const showPlay = t >= 48.3 && t < 48.7;
  if (!showPause && !showPlay) return null;
  const s = H * 0.15;
  const o = showPlay ? 1 - prog(t, 48.5, 0.2) : t < 27.6 ? 1 - prog(t, 27.35, 0.25) : prog(t, 48.1, 0.1);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, opacity: o }}>
      <g transform={`translate(${W / 2} ${H / 2})`}>
        <circle r={s * 0.85} fill="rgba(0,0,0,0.35)" />
        {showPause ? (
          <>
            <rect x={-s * 0.32} y={-s / 2} width={s * 0.22} height={s} rx={4} fill="#fff" />
            <rect x={s * 0.1} y={-s / 2} width={s * 0.22} height={s} rx={4} fill="#fff" />
          </>
        ) : (
          <path d={`M${-s * 0.28} ${-s / 2}L${s * 0.5} 0L${-s * 0.28} ${s / 2}Z`} fill="#fff" />
        )}
      </g>
    </svg>
  );
};
/** 0:26.8 に走査線が 1 本だけ走る */
const ScanLine: React.FC<{ t: number }> = ({ t }) => {
  if (t < 26.8 || t >= 27.3) return null;
  const y = lin(t, 26.8, 27.3, 0, H);
  return <div style={{ position: "absolute", left: 0, top: y, width: W, height: 3, background: "rgba(255,255,255,0.7)" }} />;
};

// ---- C. 作者の自撮り（0:27.3〜0:48.5）。自撮りが届くまでは灰色の仮の画 ----
const SELFIE_LINES: [number, number, string][] = [
  [27.3, 28.8, "ここで失礼します。"],
  [28.8, 32.3, "作者のイチローです。普段は、ブランドや Web のデザインをしているクリエイターです。"],
  [32.3, 37.8, "今は、創業 100 年を超える電気工事会社の顧問として、外国人の受け入れや AI の相談に乗っています。"],
  [37.8, 41.1, "毎日、現場や先生たちに話を聞いて、課題をほどいています。"],
  [41.1, 45.9, "そこから、ピクトグラムと紙芝居をヒントに、見るだけで伝わる安全のカードを作りました。"],
  [45.9, 48.5, "しばし、紙芝居にお付き合いください。"],
];
const SelfieKari: React.FC<{ t: number; note: string }> = ({ t, note }) => {
  const line = SELFIE_LINES.find((l) => t >= l[0] && t < l[1])?.[2] ?? "";
  return (
    <AbsoluteFill style={{ background: "#8d8d8d", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 18, padding: 50 }}>
      <div style={{ fontFamily: FONT_JP, fontSize: 54, fontWeight: 700, color: "#fff" }}>{KARI6[0]}</div>
      <div style={{ fontFamily: FONT_JP, fontSize: 22, color: "#f2f2f2" }}>{note}</div>
      <div style={{ fontFamily: FONT_JP, fontSize: 26, color: "#fff", textAlign: "center", lineHeight: 1.5, maxWidth: 820 }}>{line}</div>
    </AbsoluteFill>
  );
};
const PW = W * 0.8;
const PH = H * 0.8;
const Tape: React.FC<{ x: number; y: number; r: number }> = ({ x, y, r }) => (
  <div style={{ position: "absolute", left: x - 45, top: y - 14, width: 90, height: 28, background: "rgba(238,226,190,0.88)", transform: `rotate(${r}deg)`, boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
);
const PartC: React.FC<{ t: number }> = ({ t }) => {
  if (t < 27.3 || t >= 48.9) return null;
  const inP = interpolate(t, [27.3, 27.7], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const outP = interpolate(t, [48.5, 48.9], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const top = (H - PH) / 2 + (1 - inP) * H - outP * H;
  let body: React.ReactNode;
  if (t < 32.3) body = <SelfieKari t={t} note="胸から上" />;
  else if (t < 34.5) body = <Zoom k={1.1} fx={0.5} fy={0.4}><SelfieKari t={t} note="胸から上（1.1 倍のジャンプカット）" /></Zoom>;
  else if (t < 37.8) body = <Vid src="v6/pc1.mp4" at={34.5} len={3.3} from={0} to={3.3} fit="cover" />;
  else if (t < 41.1)
    body = (
      <Zoom k={1.2} fx={lin(t, 37.8, 41.1, 0.2, 0.8)} fy={0.45}>
        <Vid src="v3/trial.mp4" at={37.8} len={3.3} from={6} to={11} fit="cover" />
      </Zoom>
    );
  else if (t < 43.5)
    body = (
      <Zoom k={lin(t, 41.1, 43.5, 1.5, 1.65)} fx={0.51} fy={0.46}>
        <Vid src="v3/trial.mp4" at={41.1} len={2.4} from={0} to={2.4} fit="cover" />
      </Zoom>
    );
  else if (t < 45.9) body = <Zoom k={1.15} fx={0.5} fy={0.35}><SelfieKari t={t} note="寄り" /></Zoom>;
  else body = <SelfieKari t={t} note="言い終わりに、画面の外のボタンを押すしぐさ" />;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: (W - PW) / 2, top, width: PW, height: PH, background: "#fff", padding: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.45)" }}>
        <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#222" }}>{body}</div>
        <Tape x={0} y={0} r={-35} />
        <Tape x={PW} y={0} r={35} />
        <Tape x={0} y={PH} r={35} />
        <Tape x={PW} y={PH} r={-35} />
      </div>
    </AbsoluteFill>
  );
};

// ---- 窓の中に流す物（E・F・G） ----
interface Shot { at: number; len: number; src?: string; from?: number; to?: number; img?: boolean; z?: [number, number]; zd?: number; f?: [[number, number], [number, number]]; blink?: boolean; extra?: (t: number) => React.ReactNode; body?: (t: number) => React.ReactNode }
const DEMO = "v6/demo.mp4";
const VOICE = "v3/voice.mp4";
// 1:22.0〜1:25.5 赤の説明の「なぜ」の 2 行目の、確かめる AI が書いた文に引く黄色い線（録画の画面に対する割合）
const Underline = (t: number) => {
  const p = interpolate(t, [82.3, 83.3], [0, 1], { ...clamp, easing: ease });
  return <div style={{ position: "absolute", left: "35%", top: "34.2%", width: `${40 * p}%`, height: "1.6%", background: "rgba(255,214,0,0.75)", mixBlendMode: "multiply" }} />;
};
// 1:07.0〜1:11.0 4 コマがコマごとに 1 秒で現れる（コマの左端の割合）
const PANEL_X = [0, 0.253, 0.505, 0.757];
const PanelReveal = (t: number) => (
  <>
    {PANEL_X.map((x, i) => {
      const o = 1 - prog(t, 67 + i * 1.0, 0.25);
      return o > 0 ? <div key={i} style={{ position: "absolute", left: `${x * 100}%`, top: 0, width: "25.3%", height: "100%", background: "#fff", opacity: o }} /> : null;
    })}
  </>
);
const TitleCard = (text: string, sub?: string) => () => (
  <AbsoluteFill style={{ background: "#241c45", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
    <div style={{ fontFamily: FONT_PEN, fontSize: 46, fontWeight: 700, color: "#fff" }}>{text}</div>
    {sub && <div style={{ fontFamily: FONT_JP, fontSize: 22, color: "#d8d2f2" }}>{sub}</div>}
  </AbsoluteFill>
);
const NumbersKari = () => (
  <AbsoluteFill style={{ background: PAPER, alignItems: "center", justifyContent: "center" }}>
    <div style={{ fontFamily: FONT_JP, fontSize: 40, color: "#8a8270" }}>（数字はあとで）</div>
    <div style={{ position: "absolute", left: 16, top: 12, fontFamily: FONT_JP, fontSize: 16, color: "#b0a890" }}>{KARI6[1]}</div>
  </AbsoluteFill>
);
// 2:04.5〜2:06.5 現場の門（黄色と黒の遮断の棒が 1.5 秒で下りる）を白い紙に大きく
const INK = "#2b2b2b";
const GateBig = (t: number) => {
  const down = interpolate(t, [124.6, 126.1], [0, 1], { ...clamp, easing: Easing.out(Easing.bounce) });
  const l = 230;
  const r = 560;
  const top = 120;
  const g = 390;
  const ang = -80 * (1 - down);
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <svg width={WIN.w} height={WIN.h} viewBox={`0 0 ${WIN.w} ${WIN.h}`} style={{ position: "absolute", inset: 0 }}>
        <line x1={20} y1={g} x2={WIN.w - 20} y2={g} stroke={INK} strokeWidth={4} />
        <rect x={l - 10} y={top} width={20} height={g - top} fill="#9a9aa6" stroke={INK} strokeWidth={3} />
        <rect x={r - 10} y={top} width={20} height={g - top} fill="#9a9aa6" stroke={INK} strokeWidth={3} />
        <rect x={l - 26} y={top - 14} width={r - l + 52} height={22} rx={6} fill="#b9b9c4" stroke={INK} strokeWidth={3} />
        <rect x={(l + r) / 2 - 64} y={top - 104} width={128} height={86} rx={8} fill="#fff" stroke={INK} strokeWidth={4} />
        <path d={`M${(l + r) / 2 - 48} ${top - 40}a30 30 0 0 1 60 0z`} fill="#fff" stroke={INK} strokeWidth={4} />
        <rect x={(l + r) / 2 - 54} y={top - 42} width={72} height={8} rx={3} fill={INK} />
        <path d={`M${(l + r) / 2 + 22} ${top - 66}l12 14l22 -28`} fill="none" stroke="#2e8b57" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
        <g transform={`rotate(${ang} ${l} ${g - 130})`}>
          <rect x={l} y={g - 142} width={r - l - 14} height={24} rx={4} fill="#f2c230" stroke={INK} strokeWidth={3} />
          {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={l + 22 + i * 50} y={g - 142} width={24} height={24} fill="#222" />)}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
// 2:08.5〜2:11.5 道路の標識のピクトグラム 2 つ（カーブ注意・徐行）が 0.3 秒ずつ並ぶ
const RoadSigns = (t: number) => {
  const a = prog(t, 128.7, 0.3);
  const b = prog(t, 129.0, 0.3);
  return (
    <svg width={WIN.w} height={WIN.h} viewBox={`0 0 ${WIN.w} ${WIN.h}`} style={{ position: "absolute", inset: 0 }}>
      <g transform={`translate(${WIN.w - 95} 120) scale(${a})`} opacity={a}>
        <rect x={-55} y={-55} width={110} height={110} rx={10} transform="rotate(45)" fill="#f7c600" stroke="#111" strokeWidth={6} />
        <path d="M-14 34L-14 -6Q-14 -24 6 -24L10 -24" fill="none" stroke="#111" strokeWidth={10} strokeLinecap="round" />
        <path d="M6 -40L28 -24L6 -8Z" fill="#111" />
      </g>
      <g transform={`translate(${WIN.w - 95} 300) scale(${b})`} opacity={b}>
        <path d="M-66 -46L66 -46L0 68Z" fill="#fff" stroke="#d01f1f" strokeWidth={12} strokeLinejoin="round" />
        <text y={-4} textAnchor="middle" fontFamily={FONT_JP} fontSize={34} fontWeight={700} fill="#1f3c9a">徐行</text>
      </g>
    </svg>
  );
};
// 2:22.5〜2:26.0 実写の上に線が描かれ、写真が消えて白黒のピクトグラムの人が残る → 1 枚のカード「電気工事」に縮む
const CRAFT = INDUSTRY_DRAFTS[0].roles[0];
const CRAFT_SVG = characterSvg({ angles: { ...POSES.stand, arm_near_upper: 75, arm_near_lower: 70 }, x: 0, groundY: 0, height: 300, facing: "left", view: "quarter", role: CRAFT.role, headwear: CRAFT.headwear, outfit: CRAFT.outfit });
const ToPicto = (t: number) => {
  const draw = interpolate(t, [142.5, 144.0], [0, 1], { ...clamp, easing: ease });
  const photo = 1 - prog(t, 143.6, 0.7);
  const shrink = interpolate(t, [144.5, 146.0], [0, 1], { ...clamp, easing: ease });
  const k = 1 - shrink * 0.45;
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <Img src={staticFile("v6/g_last.png")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", opacity: photo }} />
      <svg width={WIN.w} height={WIN.h} viewBox={`0 0 ${WIN.w} ${WIN.h}`} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <clipPath id="draw-wipe"><rect x={0} y={0} width={WIN.w} height={WIN.h * draw} /></clipPath>
        </defs>
        <g transform={`translate(${WIN.w / 2} ${WIN.h / 2}) scale(${k})`}>
          <rect x={-120} y={-170} width={240} height={330} rx={14} fill="#fff" stroke="#b9ad8f" strokeWidth={4} opacity={shrink} />
          <g clipPath="url(#draw-wipe)" transform={`translate(${-WIN.w / 2} ${-WIN.h / 2})`}>
            <g transform={`translate(${WIN.w / 2 + 20} ${WIN.h / 2 + 130})`} dangerouslySetInnerHTML={{ __html: CRAFT_SVG }} />
          </g>
          <text y={150} textAnchor="middle" fontFamily={FONT_JP} fontSize={30} fontWeight={700} fill={INK} opacity={shrink}>電気工事</text>
        </g>
      </svg>
    </AbsoluteFill>
  );
};

// ---- G. 電気工事のカードから、ほかの仕事のカードが飛び出す（2:26〜2:40） ----
const FIRST = ["電気工事", "建設", "解体", "内装", "塗装", "警備", "ビルの清掃", "介護", "厨房", "食品の工場", "工場の製造", "農業", "物流倉庫", "自動車運送", "宿泊"];
const ORDER = [...FIRST.map((n) => INDUSTRY_DRAFTS.find((d) => d.name === n)!), ...INDUSTRY_DRAFTS.filter((d) => !FIRST.includes(d.name))].slice(0, 40);
const CW = 68;
const CH = 92;
const GX = (WIN.w - (10 * CW + 9 * 7)) / 2;
const GY = (WIN.h - (4 * CH + 3 * 9)) / 2;
const slot = (i: number) => ({ x: GX + (i % 10) * (CW + 7) + CW / 2, y: GY + Math.floor(i / 10) * (CH + 9) + CH / 2 });
const outAt = (i: number) => {
  if (i === 0) return 156.5;
  if (i <= 6) return 148.5 + (i - 1) * 0.5;
  if (i <= 14) { const k = (i - 7) / 8; return 152.5 + 3.4 * (1 - (1 - k) * (1 - k)); }
  return 156.5 + (i - 15) * 0.07;
};
const FIGS = ORDER.map((d) => {
  const r = d.roles[0];
  return characterSvg({ angles: POSES.stand, x: 0, groundY: 0, height: 58, facing: "right", view: "front", role: r.role, headwear: r.headwear, outfit: r.outfit });
});
const CardFan = (t: number) => {
  const zoom = interpolate(t, [146, 156.5, 160], [1.18, 1.12, 1.0], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <svg width={WIN.w} height={WIN.h} viewBox={`0 0 ${WIN.w} ${WIN.h}`} style={{ position: "absolute", inset: 0 }}>
        <g transform={`translate(${WIN.w / 2} ${WIN.h / 2}) scale(${zoom}) translate(${-WIN.w / 2} ${-WIN.h / 2})`}>
          {ORDER.map((d, i) => {
            const s = slot(i);
            const t0 = outAt(i);
            let x: number, y: number, k: number, rot: number;
            if (i === 0) {
              const p = interpolate(t, [156.5, 157.2], [0, 1], { ...clamp, easing: ease });
              x = interpolate(p, [0, 1], [WIN.w / 2, s.x]);
              y = interpolate(p, [0, 1], [WIN.h / 2, s.y]);
              k = interpolate(p, [0, 1], [2.4, 1]);
              rot = 0;
            } else {
              const p = interpolate(t, [t0, t0 + 0.45], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
              if (p <= 0) return null;
              x = interpolate(p, [0, 1], [WIN.w / 2, s.x]);
              y = interpolate(p, [0, 1], [WIN.h / 2, s.y]) - Math.sin(p * Math.PI) * 40;
              k = 0.4 + 0.6 * p;
              rot = (1 - p) * ((i % 2 ? 1 : -1) * 25);
            }
            // 2:39.6 からカードが 1 枚ずつ灯る（夜の街の窓に重なる）
            const lit = prog(t, 159.6 + lightOrder(i) * 1.0, 0.15);
            return (
              <g key={d.id} transform={`translate(${x} ${y}) rotate(${rot}) scale(${k})`}>
                <rect x={-CW / 2} y={-CH / 2} width={CW} height={CH} rx={7} fill={lit > 0 ? `rgba(255,217,104,${0.25 + lit * 0.75})` : "#fff"} stroke={i === 0 ? "#c0392b" : "#b9ad8f"} strokeWidth={i === 0 ? 3 : 2} />
                <g transform={`translate(0 ${CH / 2 - 20})`} dangerouslySetInnerHTML={{ __html: FIGS[i] }} />
                <text y={CH / 2 - 6} textAnchor="middle" fontFamily={FONT_JP} fontSize={10} fontWeight={700} fill={INK}>{d.name.length > 6 ? `${d.name.slice(0, 6)}…` : d.name}</text>
              </g>
            );
          }).reverse()}
        </g>
      </svg>
    </AbsoluteFill>
  );
};

// E の段の切り出しは 1 か所（demo-cuts-v6.json）にまとめる
const E_SRC: Record<string, { src: string; img?: boolean }> = { demo: { src: DEMO }, notrans: { src: "v6/notrans.mp4" }, panels: { src: "v6/panels.png", img: true }, e9: { src: "v6/e9.png", img: true } };
const E_EXTRA: Record<string, (t: number) => React.ReactNode> = { PanelReveal, Underline };
const E_SHOTS: Shot[] = (demoCuts.shots as Array<Omit<Shot, "src" | "extra" | "z" | "f"> & { src: string; extra?: string; z?: number[]; f?: number[][] }>).map(({ src, extra, z, f, ...r }) => ({
  ...r, ...E_SRC[src], z: z as Shot["z"], f: f as Shot["f"], extra: extra ? E_EXTRA[extra] : undefined,
}));
const SHOTS: Shot[] = [
  // E. デモ（秒は video/demo-cuts-v6.json。録画を撮り直したら表を直して prep-demo-v6.py を流す）
  ...E_SHOTS,
  // F. 11/6、電気工事の現場で
  { at: 106, len: 1.5, body: TitleCard("11 月 6 日、電気工事の現場で") },
  { at: 107.5, len: 2.5, src: "v6/t1.mp4", from: 0, to: 2.5, z: [1, 1.1], f: [[0.5, 0.5], [0.5, 0.42]] },
  { at: 110, len: 2.5, src: "v6/t2.mp4", from: 0, to: 2.5, z: [1, 1.08], f: [[0.55, 0.5], [0.55, 0.5]] },
  { at: 112.5, len: 2.5, body: NumbersKari },
  { at: 115, len: 3, src: "v6/pc2.mp4", from: 0, to: 3, z: [1, 1.12], f: [[0.5, 0.5], [0.4, 0.5]] },
  { at: 118, len: 4, src: "v6/sign.mp4", from: 0, to: 4, z: [1, 1.2], f: [[0.45, 0.5], [0.45, 0.5]] },
  { at: 122, len: 2.5, src: VOICE, from: 0, to: 1.7, z: [1, 1.08] },
  { at: 124.5, len: 2, body: GateBig },
  { at: 126.5, len: 2, src: VOICE, from: 3.5, to: 5.5 },
  { at: 128.5, len: 1.5, src: VOICE, from: 5.5, to: 7, extra: RoadSigns },
  { at: 130, len: 1.5, src: VOICE, from: 9.5, to: 11, extra: RoadSigns },
  { at: 131.5, len: 1, src: VOICE, from: 0, to: 0.4, z: [1.7, 1.75], f: [[0.38, 0.27], [0.38, 0.27]] },
  { at: 132.5, len: 3, src: VOICE, from: 0.4, to: 1.6, z: [1.75, 2.0], f: [[0.38, 0.27], [0.38, 0.27]] },
  { at: 135.5, len: 3, src: "v6/hand2.mp4", from: 0, to: 3 },
  // G. 結び
  { at: 138.5, len: 4, src: VOICE, from: 18, to: 22 },
  { at: 142.5, len: 3.5, body: ToPicto },
  { at: 146, len: 15.2, body: CardFan },
];
const ShotView: React.FC<{ t: number; s: Shot }> = ({ t, s }) => {
  const [z0, z1] = s.z ?? [1, 1];
  const [[fx0, fy0], [fx1, fy1]] = s.f ?? [[0.5, 0.5], [0.5, 0.5]];
  const zd = s.zd ?? s.len;
  const k = interpolate(t, [s.at, s.at + zd], [z0, z1], { ...clamp, easing: ease });
  const fx = interpolate(t, [s.at, s.at + s.len], [fx0, fx1], { ...clamp, easing: ease });
  const fy = interpolate(t, [s.at, s.at + s.len], [fy0, fy1], { ...clamp, easing: ease });
  const blink = s.blink ? 0.55 + 0.45 * Math.abs(Math.cos((t - s.at) * Math.PI * 2)) : 1;
  return (
    <Zoom k={k} fx={fx} fy={fy}>
      <div style={{ position: "absolute", inset: 0, opacity: blink }}>
        {s.body ? s.body(t) : s.img ? <Pic src={s.src!} /> : <Vid src={s.src!} at={s.at} len={s.len} from={s.from!} to={s.to!} />}
      </div>
      {s.extra?.(t)}
    </Zoom>
  );
};
const WinShots: React.FC<{ t: number }> = ({ t }) => {
  const s = SHOTS.find((x) => t >= x.at && t < x.at + x.len);
  if (!s) return null;
  // 2:40.4 から街へ替わる所は薄くして消す
  const o = (t < 59.4 ? prog(t, 59, 0.4) : 1) * (1 - prog(t, 160.4, 0.8));
  return (
    <div style={{ position: "absolute", left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h, background: "#fff", overflow: "hidden", opacity: o }}>
      <ShotView t={t} s={s} />
    </div>
  );
};
// 0:59.0〜1:00.0 冒頭の事例シートが、アプリの画面（添付の欄）へ吸い込まれる
const SheetIn: React.FC<{ t: number }> = ({ t }) => {
  if (t < 58.8 || t >= 60.2) return null;
  const p = interpolate(t, [58.8, 60.0], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const k = interpolate(p, [0, 1], [0.9, 0.06]);
  const x = interpolate(p, [0, 1], [W / 2, WIN.x + WIN.w * 0.2]);
  const y = interpolate(p, [0, 1], [H / 2, WIN.y + WIN.h * 0.88]);
  return (
    <Img src={staticFile("v6/sheet.png")} style={{ position: "absolute", left: x - (PAGE_W * k) / 2, top: y - (PAGE_H * k) / 2, width: PAGE_W * k, height: PAGE_H * k, opacity: 1 - prog(t, 59.9, 0.3), boxShadow: "0 6px 18px rgba(0,0,0,0.35)" }} />
  );
};
// 0:51.2〜0:52.0 題の下に「現場の紙芝居」
const TitleSub: React.FC<{ t: number }> = ({ t }) => {
  if (t < 51.0 || t >= 52.05) return null;
  return (
    <div style={{ position: "absolute", left: WIN.x, top: WIN.y + WIN.h * 0.62, width: WIN.w, textAlign: "center", fontFamily: FONT_JP, fontSize: 34, color: "#2b2b4a", opacity: prog(t, 51.0, 0.4) * (1 - prog(t, 51.85, 0.2)) }}>現場の紙芝居</div>
  );
};

// ---- G の終わり: 題とクレジット（2:49.5〜3:00） ----
const isAscii = (c: string) => c.charCodeAt(0) < 128;
const textW = (s: string, fs: number) => [...s].reduce((a, c) => a + (isAscii(c) ? fs * 0.55 : fs), 0);
const Credits: React.FC<{ t: number; lines: string[] }> = ({ t, lines }) => {
  const o = prog(t, 175.2, 0.5);
  if (o <= 0 || lines.length < 6) return null;
  const [l1, l2, l3, ...rest] = lines;
  // 4〜6 行目: 「役割　名前」。6 行目は頭の空白を外して、5 行目の名前と頭をそろえる
  const split = (s: string) => {
    const m = s.match(/^([^　]*)　+(.*)$/);
    return m ? { role: m[1], name: m[2] } : { role: "", name: s.replace(/^　+/, "") };
  };
  const rows = rest.slice(0, 3).map(split);
  const FS = 24;
  const roleW = FS * 3;
  const blockW = roleW + Math.max(...rows.map((r) => textW(r.name, FS)));
  const x0 = W / 2 - blockW / 2;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, opacity: o }}>
      <text x={W / 2} y={190} textAnchor="middle" fontFamily={FONT_JP} fontSize={29} fill="#fff">{l1}</text>
      <text x={W / 2} y={270} textAnchor="middle" fontFamily={FONT_JP} fontSize={43} fontWeight={700} fill="#fff">
        {(() => { const r = split(l2); return <><tspan fill="#9a9aa6" fontSize={29}>{r.role}　</tspan><tspan>{r.name}</tspan></>; })()}
      </text>
      <text x={W / 2} y={320} textAnchor="middle" fontFamily={FONT_JP} fontSize={21} fill="#9a9aa6">{l3}</text>
      {rows.map((r, i) => (
        <g key={i}>
          <text x={x0} y={420 + i * 44} fontFamily={FONT_JP} fontSize={FS} fill="#9a9aa6">{r.role}</text>
          <text x={x0 + roleW} y={420 + i * 44} fontFamily={FONT_JP} fontSize={FS} fill="#fff">{r.name}</text>
        </g>
      ))}
    </svg>
  );
};
const EndTitle: React.FC<{ t: number; credits: string[] }> = ({ t, credits }) => {
  if (t < 169.3) return null;
  const title = prog(t, 169.8, 1.0) * (1 - prog(t, 174.6, 0.4));
  const sub = prog(t, 170.8, 1.0) * (1 - prog(t, 174.6, 0.4));
  return (
    <AbsoluteFill style={{ background: "#000", opacity: prog(t, 169.3, 0.3) }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
        <g opacity={title}>
          <text x={W / 2} y={300} textAnchor="middle" fontFamily={FONT_PEN} fontSize={72} fontWeight={700} fill="#fffaf0">Genba-Kamishibai</text>
          <text x={W / 2} y={352} textAnchor="middle" fontFamily={FONT_JP} fontSize={30} fill="#e8e2ff">現場の紙芝居</text>
        </g>
        <text x={W / 2} y={450} textAnchor="middle" fontFamily={FONT_PEN} fontSize={34} fill="#fff" opacity={sub}>事故を、1 件でも減らすために</text>
      </svg>
      <Credits t={t} lines={credits} />
    </AbsoluteFill>
  );
};

// ---- 1 つのレイヤー ----
export const V6Layer: React.FC<{ layer: number; credits?: string[] }> = ({ layer, credits = [] }) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const st = stageAt(t);
  const dark = t >= 26.8 && t < 48.5 ? 0.42 * prog(t, 26.8, 0.2) * (1 - prog(t, 48.3, 0.2)) : 0;
  return (
    <LayerCtx.Provider value={layer}>
      <AbsoluteFill style={{ background: layer === 1 ? "#000" : undefined }}>
        {/* B の頭: 紙が 2 枚の正方形に分かれる所は、白地の上 */}
        {layer === 1 && t >= 21.3 && t < 22.4 && <AbsoluteFill style={{ background: "#fbfaf5" }} />}
        {layer === 3 && <Split t={t} />}
        {/* 2:40 からの夜の街（戸が閉じる所は、街の上に紙芝居の箱だけを重ねる） */}
        {layer === 1 && t >= 160.4 && t < 169.6 && (
          <AbsoluteFill style={{ opacity: prog(t, 160.4, 0.8) }}>
            <City t={t} t0={161.0} t1={164.0} glow={lin(t, 164, 167, 0, 1)} />
          </AbsoluteFill>
        )}
        {/* 舞台（v4 の通しの絵。字幕と札の L5 は出さない） */}
        {st && layer >= 1 && layer <= 4 && (!st.only2 || layer === 2) && (
          <AbsoluteFill style={{ opacity: st.o ?? 1 }}>
            <Zoom k={st.k ?? 1} fx={st.fx ?? 0.5} fy={st.fy ?? 0.5}>
              <SheetLook.Provider value={{ image: staticFile("v3/fold.png") }}>
                <IntroLook.Provider value={{ bubble: "この紙を、紙芝居にします", bare: true }}>
                  <StoryLook.Provider value={{ noScrolls: st.noScrolls }}>
                    <Freeze frame={Math.round(st.v4 * FPS)}>
                      <FullLayer layer={layer} />
                    </Freeze>
                  </StoryLook.Provider>
                </IntroLook.Provider>
              </SheetLook.Provider>
            </Zoom>
          </AbsoluteFill>
        )}
        {layer === 4 && (
          <>
            <PartA t={t} />
            <PartBOver t={t} />
            {dark > 0 && <AbsoluteFill style={{ background: "#000", opacity: dark }} />}
            <ScanLine t={t} />
            <PartC t={t} />
            <PauseMark t={t} />
            <TitleSub t={t} />
            <WinShots t={t} />
            <SheetIn t={t} />
            <EndTitle t={t} credits={credits} />
          </>
        )}
        <L n={5}>
          <Subtitle6 t={t} />
          {KARI6.length > 0 && t < 169.3 && <DraftTag />}
        </L>
      </AbsoluteFill>
    </LayerCtx.Provider>
  );
};

/** 全部（L1〜L5 を下から重ねる。静止画と mp4 用） */
export const V6: React.FC<V6Props> = ({ credits }) => (
  <AbsoluteFill>
    {LAYERS.map((l) => (
      <AbsoluteFill key={l.id}>
        <V6Layer layer={l.n} credits={credits} />
      </AbsoluteFill>
    ))}
  </AbsoluteFill>
);
