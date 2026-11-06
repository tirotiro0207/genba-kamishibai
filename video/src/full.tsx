// 3 分の通しの仮版 v4（11/5 夜 作者の台本 v4: 枠を大きく・扉は外へ・ライトを下ろす・棒人間の父母・ドットで吸い込み・光と一緒に放り出し・ヘルメットをもらって現場へ）。
// 0:13 から 2:54 まで、木の枠と光の輪は同じ所・同じ大きさで毎コマ出す（2:54 に扉が閉じ、2:56 からカメラが引いて机の上の小さな紙芝居だと分かる）。
// カットは使わない。替わり方は「紙が横へ流れる」「紙芝居の抜き」「白く光る」「粒にほどけて組み直す」の 4 つだけ。
// 0:00〜1:16 は 0.5 秒に 1 つずつ、1:16 からは 1〜2 秒に 1 つずつ新しいものが出る。字幕は画面の下の帯に 1 行、吹き出しは床の人の頭の上に 1 行。
// 1280×720 の座標で描き、1.5 倍の 1920×1080 で書き出す。素材の無い場面は「仮」の札で埋める。動画・画像は書き出しのときに git の外から写して読む（render-full.mjs）
import React from "react";
import { AbsoluteFill, Easing, Freeze, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { characterSvg } from "../../src/shared/picto/character";
import { guideLook, guidePose } from "../../src/shared/picto/guide";
import { INDUSTRY_DRAFTS } from "../../src/shared/picto/industry-drafts";
import { type Angles, POSES } from "../../src/shared/picto/poses";
import { Dissolve } from "./dissolve";
import { Intro, INTRO_FRAMES } from "./intro";
import { L, LayerCtx } from "./layers";
import { gait, mixAngles } from "./paper";
import { BrushPaper, doorCover, doorDeg, FLOOR, FLOOR_Y, FONT_JP, FONT_PEN, FRAME, LightRings, StageFrame, StageLamps, WIN, WobbleDefs } from "./parts";
import { SCENE_COMPONENTS } from "./scenes";
import { BigPack, Clawd, picto, StoryStrip } from "./story";
import { FPS, H, INK, PURPLE, SCENES, startOf, TOTAL, W } from "./timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const sec = (s: number) => Math.round(s * FPS);
const ease = Easing.inOut(Easing.quad);
const prog = (t: number, t0: number, d = 0.3) => interpolate(t, [t0, t0 + d], [0, 1], clamp);
/** a から d 秒の山（0→1→0） */
const bump = (t: number, a: number, d: number) => (t >= a && t < a + d ? Math.sin(((t - a) / d) * Math.PI) : 0);
const hash = (i: number) => {
  const s = Math.sin(i * 91.7 + 17.3) * 43758.5453;
  return s - Math.floor(s);
};

// ---- 場面の表（秒は台本 v4） ----
export interface Seg { id: string; title: string; at: number; len: number; kari?: string }
export const SEGS: Seg[] = [
  { id: "opening", title: "冒頭（時計・折り紙・名のり・枠・ライト・開演・題）", at: 0, len: 19 },
  { id: "story", title: "むかしむかし（父母・誕生・学校・ゲーム機・ひらめき）", at: 19, len: 17 },
  { id: "adventure", title: "支度とポータル（ドットで吸い込まれる）", at: 36, len: 9.5 },
  { id: "throw", title: "光と一緒に床へ放り出される", at: 45.5, len: 4 },
  { id: "guide", title: "光の粒が集まって案内人", at: 49.5, len: 4.5 },
  { id: "helmet", title: "ヘルメットをもらって現場へ", at: 54, len: 5.5 },
  { id: "hearing", title: "ヒアリング（職人さん・先輩）", at: 59.5, len: 13 },
  { id: "why", title: "なぜ作ったか（メモ）", at: 72.5, len: 3.5 },
  { id: "f-fold", title: "機能: 折りたたむ", at: 76, len: 8 },
  { id: "f-card", title: "機能: 形が崩れない理由", at: 84, len: 7 },
  { id: "f-check", title: "機能: 確かめる AI", at: 91, len: 7 },
  { id: "f-route", title: "機能: 元の文に戻る", at: 98, len: 6 },
  { id: "f-sign", title: "機能: 直して署名", at: 104, len: 7 },
  { id: "f-notrans", title: "機能: 翻訳を入れない", at: 111, len: 5, kari: "この機能の画面が入る" },
  { id: "trial", title: "試したところ", at: 116, len: 24, kari: "11/6 に撮る（当日の手元と画面・時計 2 つ。数は出さない）" },
  { id: "voice", title: "職人さんと監修者の言葉", at: 140, len: 25, kari: "11/6 に撮る・同意が先" },
  { id: "industries", title: "粒にほどけて 40 業種のカード", at: 165, len: 9 },
  { id: "end", title: "扉が閉じて、机の上の紙芝居。めでたし", at: 174, len: 6 },
];
export const FULL_FRAMES = sec(180);
export interface FullProps { [key: string]: unknown; mark?: string }

// ---- 字幕（冒頭からの秒。画面の下の帯に 1 行・34 字まで。1 字ずつ出す） ----
const CUES: [number, number, string][] = [
  [19, 22.5, "昔々、あるところにパパ郎（父）とママ郎（母）がいました。"],
  [22.5, 24.4, "長男のイチローは、ベトナムのホーチミンで生まれました。"],
  [24.4, 26, "英語の幼稚園、それからベトナムの学校へ。"],
  [26, 28.5, "七歳で、ハノイの日本人学校へ。日本語が分からず、黙っていました。"],
  [28.5, 30, "日本語が読めなくても、"],
  [30, 33, "ポケモン リーフグリーンは最後までクリアできました。"],
  [33, 36, "よい UI・UX は、ことばの壁を越える。"],
  [36, 39, "スキルの巻物をリュックに詰めて、赤い相棒と冒険へ。"],
  [39, 42, "行き先は、電気業界。"],
  [53.5, 56, "光の粒が集まって、電気工事士の妖精 TOMO が現れました。"],
  [56, 58, "現場は、ヘルメットがないと入れません。"],
  [58, 59.5, "ヘルメットをかぶって、現場に入ります。"],
  [59.5, 64.5, "TOMO と、現場で働く人に話を聞きました。"],
  [64.5, 69.5, "安全の決まりは、文字の資料と貼り紙で回っています。"],
  [69.5, 71, "文字が読めなければ、決まりは届きません。"],
  [71, 72.5, "届かなかった決まりは、けがになります。"],
  [72.5, 73.5, "日本で働く外国人は、約 257 万人。"],
  [73.5, 76, "だから、字を読まなくても分かる、絵のカードにします。"],
  [77, 84, "何ページもの資料が、1 枚・0 字のカードにたたまれます。"],
  [85, 88, "絵は Claude が数で書き、アプリが描きます。"],
  [88, 91, "だから形が崩れません。"],
  [92, 95.5, "別の Claude が、絵だけを見て読みます。"],
  [95.5, 98, "伝わらなければ赤です。"],
  [99, 104, "絵の部品をタップすると、元の文に戻れます。"],
  [105, 108, "監修者が直したいところを枠で囲み、直ったら署名します。"],
  [108, 111, "署名したカードだけが、新入社員に届きます。"],
  [111, 116, "（翻訳を入れない理由が入る）"],
  [116, 140, "（試したところ: 11/6 に撮る）"],
  [140, 165, "（職人さんと監修者の言葉: 11/6 に撮る。同意が先）"],
  [167, 174, "電気から始めて、40 の業種へ。"],
  [174, 176.5, "外国から来た新人にも、日本人の新人にも。"],
];
// 1920×1080 で帯は y 1012〜1080・字は 30 px（1280×720 では 675〜720・20 px）
const SUB_Y = 706;
const Subtitle: React.FC<{ t: number; fade: number }> = ({ t, fade }) => {
  const cue = CUES.find((c) => t >= c[0] && t < c[1]);
  if (!cue || fade <= 0) return null;
  const [a, b, text] = cue;
  const rate = Math.max(22, text.length / ((b - a) * 0.55));
  const n = Math.min(text.length, Math.floor((t - a) * rate) + 1);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, opacity: fade }}>
      <text x={W / 2} y={SUB_Y} textAnchor="middle" fontFamily={FONT_PEN} fontSize={20} fontWeight={700} fill="#fffaf0" stroke="#241c45" strokeWidth={5} strokeLinejoin="round" style={{ paintOrder: "stroke" }}>
        <tspan>{text.slice(0, n)}</tspan>
        <tspan fill="none" stroke="none">{text.slice(n)}</tspan>
      </text>
    </svg>
  );
};
/** 「仮」の札 */
const Kari: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ position: "absolute", left: 16, top: 14, maxWidth: 236, display: "flex", alignItems: "flex-start", gap: 8, background: "#fff7d6", border: "3px solid #c0392b", borderRadius: 10, padding: "6px 10px", fontFamily: FONT_JP, fontSize: 15, fontWeight: 700, color: "#8e1f16", lineHeight: 1.3 }}>
    <span style={{ background: "#c0392b", color: "#fff", borderRadius: 6, padding: "0 7px", flexShrink: 0 }}>仮</span>
    {text}
  </div>
);
const Draft: React.FC = () => <div style={{ position: "absolute", right: 16, top: 12, fontFamily: FONT_JP, fontSize: 15, color: "#fff", background: "rgba(0,0,0,0.45)", borderRadius: 6, padding: "2px 10px" }}>通しの仮版 v4</div>;

// ---- 画面の置き場（0:13 から変えない） ----
const G = 670; // 床の人の足元（1080 では 1005）
const HH = 133; // 床の人の背（1080 では 200）
const CRH = 140; // 職人さん（1080 では 210）
/** 紙芝居の抜き: 前の紙を左へしっかり抜き切る秒（PULL）と、次の紙を上から差し込む秒（DROP）。差し込みは抜き始めて DROP_AT 秒あとから */
const PULL = 0.55;
const DROP = 0.45;
const DROP_AT = 0.4;
const PAPER = "#fffdf6";
// 紙の中は 660 幅の座標で描く（むかしむかしの巻紙と同じ）。下の 39（1080 では 70 px）は吹き出しのために空ける
const VW = 660;
const VH = (WIN.h * VW) / WIN.w;
const VB = `0 0 ${VW} ${VH}`;
const STORY_DY = (VH - 350) / 2;

// ---- 枠の中の紙 ----
const Paper: React.FC<{ children?: React.ReactNode; wobble?: boolean }> = ({ children, wobble = true }) => (
  <svg width={WIN.w} height={WIN.h} viewBox={VB} style={{ position: "absolute", inset: 0 }}>
    <rect width={VW} height={VH} fill={PAPER} filter="url(#brush-paper)" />
    <g filter={wobble ? "url(#wobble)" : undefined}>{children}</g>
  </svg>
);
/** 1 字ずつ書く見出し */
const Written: React.FC<{ text: string; p: number; x: number; y: number; size?: number; color?: string; anchor?: "middle" | "start" }> = ({ text, p, x, y, size = 40, color = INK, anchor = "middle" }) => {
  const n = Math.ceil(text.length * p);
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={FONT_PEN} fontSize={size} fontWeight={700} fill={color}>
      <tspan>{text.slice(0, n)}</tspan>
      <tspan fill="none">{text.slice(n)}</tspan>
    </text>
  );
};
const Stamp: React.FC<{ p: number; x: number; y: number; text: string }> = ({ p, x, y, text }) => {
  if (p <= 0) return null;
  const k = interpolate(p, [0, 0.5, 1], [1.8, 0.92, 1], clamp);
  return (
    <g transform={`translate(${x} ${y}) rotate(-12) scale(${k})`} opacity={Math.min(1, p * 2) * 0.88}>
      <circle r={42} fill="none" stroke="#c0392b" strokeWidth={5} />
      <circle r={35} fill="none" stroke="#c0392b" strokeWidth={2} />
      <text y={8} textAnchor="middle" fontFamily={FONT_PEN} fontSize={text.length > 2 ? 19 : 24} fontWeight={700} fill="#c0392b">{text}</text>
    </g>
  );
};
// p が 0 のときは描かない（丸い線の端だけが点になって残るため）
const draw = (p: number) => ({ pathLength: 1, strokeDasharray: `${p} 1`, opacity: p > 0 ? 1 : 0 });
const ink = { fill: "none", stroke: INK, strokeWidth: 4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
/** 斜線（塗りの代わり）。clip の中に引く */
const Hatch: React.FC<{ id: string; p: number; clip: React.ReactNode; color?: string }> = ({ id, p, clip, color = "#8a7a60" }) => (
  <>
    <clipPath id={id}>{clip}</clipPath>
    <g clipPath={`url(#${id})`} stroke={color} strokeWidth={2.5} opacity={0.7}>
      {Array.from({ length: Math.floor(48 * p) }, (_, i) => <path key={i} d={`M${i * 18 - 120} 380L${i * 18 + 80} 0`} />)}
    </g>
  </>
);
/** 白い安全帽の絵（紙の上・床の上で使う。(x, y) はつばの真ん中） */
const HelmetIcon: React.FC<{ x: number; y: number; s?: number; stroke?: string }> = ({ x, y, s = 1, stroke = INK }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M-15 0Q-15 -18 0 -18Q15 -18 15 0Z" fill="#fff" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" />
    <path d="M-20 0H20" stroke={stroke} strokeWidth={3} strokeLinecap="round" />
    <path d="M0 -18V-6" stroke={stroke} strokeWidth={1.5} opacity={0.6} />
  </g>
);

/** 1 枚目「電気の現場」（0:52.75〜1:02）。白 → 空の色 → 柱 3 本 → 電線 → 日と稲妻 → 斜線 → 判 */
const SiteSheet: React.FC<{ t: number }> = ({ t }) => {
  const sky = prog(t, 56.5, 0.4);
  const poles = [57.0, 57.5, 58.0].map((a) => prog(t, a, 0.4));
  const wire = prog(t, 58.5, 0.4);
  const sun = prog(t, 59.0, 0.3);
  const hatch = prog(t, 59.5, 0.5);
  return (
    <Paper>
      {sky > 0 && <rect width={VW} height={VH * 0.62} fill="#cfe6f5" opacity={sky * 0.7} />}
      <Hatch id="site-h" p={hatch} clip={<path d="M0 300Q200 282 330 292T660 288V330H0Z" />} />
      {[150, 330, 510].map((x, j) => <path key={x} d={`M${x} 300V${110 + j * 6}M${x - 50} ${128 + j * 6}H${x + 50}`} {...ink} {...draw(poles[j])} />)}
      {[-34, 0, 34].map((dx) => <path key={dx} d={`M${150 + dx} 128Q${240 + dx} 165 ${330 + dx} 134Q${420 + dx} 170 ${510 + dx} 140`} {...ink} strokeWidth={2.5} {...draw(wire)} />)}
      {sun > 0 && (
        <g opacity={sun}>
          <circle cx={84} cy={70} r={26} fill="#ffe08a" stroke={INK} strokeWidth={3} />
          <path d="M600 60L570 130H600L580 200L640 110H608L630 60Z" fill="#ffd24a" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
        </g>
      )}
      <Written text="電気の現場" p={prog(t, 59.5, 0.5)} x={VW / 2} y={52} size={34} />
      <Stamp p={prog(t, 60.0, 0.25)} x={584} y={268} text="現場" />
    </Paper>
  );
};
/** 2 枚目 貼り紙（1:02〜1:06）。A3 の外の線 → 赤い見出しの帯 → 文字の線の半分 → 全部と注意の三角（ぼかす・「イメージ」）→ 判 */
const PosterSheet: React.FC<{ t: number }> = ({ t }) => {
  const outline = prog(t, 62.5, 0.4);
  const band = prog(t, 63.0, 0.3);
  const half = prog(t, 63.5, 0.3);
  const all = prog(t, 64.0, 0.3);
  const px = 230;
  const py = 30;
  const pw = 200;
  const ph = 283;
  return (
    <Paper>
      <Hatch id="post-h" p={prog(t, 64.5, 0.4)} clip={<rect x={px + pw + 20} y={py + 40} width={150} height={200} />} />
      <rect x={px} y={py} width={pw} height={ph} fill="#fff" stroke={INK} strokeWidth={4} {...draw(outline)} />
      {band > 0 && <rect x={px + 10} y={py + 12} width={(pw - 20) * band} height={38} fill="#c0392b" />}
      <defs><filter id="post-blur"><feGaussianBlur stdDeviation={1.6} /></filter></defs>
      <g filter="url(#post-blur)">
        {Array.from({ length: 16 }, (_, i) => {
          const p = i < 8 ? half : all;
          if (p <= 0) return null;
          const w = (pw - 30) * (0.55 + 0.45 * hash(i));
          return <rect key={i} x={px + 15} y={py + 64 + i * 13} width={w * p} height={5} rx={2} fill="#666" />;
        })}
        {all > 0 && <path d={`M${px + pw - 48} ${py + ph - 18}l22 -38l22 38Z`} fill="#ffd24a" stroke={INK} strokeWidth={3} opacity={all} />}
      </g>
      {all > 0 && <text x={px + pw / 2} y={py + ph + 20} textAnchor="middle" fontFamily={FONT_JP} fontSize={13} fill="#777" opacity={all}>イメージ</text>}
      <Stamp p={prog(t, 65.0, 0.25)} x={540} y={250} text="字だけ" />
    </Paper>
  );
};
/** 3 枚目 朝礼（1:06〜1:08.5）。後ろ姿の 4 人 → 話す人と、なぐり書きの吹き出し → 「?」と判 */
const ChoreiSheet: React.FC<{ t: number }> = ({ t }) => {
  const backs = prog(t, 66.5, 0.4);
  const speaker = prog(t, 67.0, 0.35);
  const q = prog(t, 67.5, 0.3);
  return (
    <Paper>
      {[150, 260, 370, 480].map((x, i) => (
        <g key={x} opacity={Math.min(1, backs * 1.6 - i * 0.15)}>
          <circle cx={x} cy={238} r={26} {...ink} />
          <path d={`M${x - 46} 320Q${x - 46} 268 ${x} 268Q${x + 46} 268 ${x + 46} 320`} {...ink} />
        </g>
      ))}
      {speaker > 0 && (
        <g opacity={speaker}>
          <circle cx={318} cy={86} r={20} {...ink} />
          <path d="M318 106V160M318 120L292 146M318 120L350 96" {...ink} />
          <path d="M370 40H520V100H410L392 118L396 100H370Z" fill="#fff" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
          <path d="M384 62q10 -10 20 0t20 0t20 0t20 0t20 0t20 0M384 82q10 -10 20 0t20 0t20 0t20 0t20 0" fill="none" stroke="#666" strokeWidth={2.5} />
        </g>
      )}
      {q > 0 && [210, 420].map((x) => <text key={x} x={x} y={200} textAnchor="middle" fontFamily={FONT_PEN} fontSize={44} fontWeight={700} fill="#c0392b" opacity={q}>?</text>)}
      <Stamp p={prog(t, 67.5, 0.25)} x={584} y={250} text="朝礼" />
    </Paper>
  );
};
/** 4 枚目 焼けた作業服（1:08.5〜1:12.5）。外の線 → 焼けの斜線 → 穴と 3 本の煙 → 判 */
const JacketSheet: React.FC<{ t: number }> = ({ t }) => {
  const line = prog(t, 69.0, 0.45);
  const burn = prog(t, 69.5, 0.4);
  const hole = prog(t, 70.0, 0.3);
  const jacket = "M250 70L300 54Q330 72 360 54L410 70L470 150L440 172L410 140V300H250V140L220 172L190 150Z";
  return (
    <Paper>
      <Hatch id="jk-h" p={burn} color="#3a2a1a" clip={<ellipse cx={392} cy={186} rx={52} ry={44} />} />
      <path d={jacket} {...ink} {...draw(line)} />
      <path d="M330 72V300" {...ink} strokeWidth={2.5} {...draw(line)} />
      {hole > 0 && (
        <g opacity={hole}>
          <path d="M378 170q14 -8 26 4q6 14 -6 22q-14 6 -24 -6q-4 -12 4 -20Z" fill="#2a1b0e" />
          {[0, 1, 2].map((i) => <path key={i} d={`M${380 + i * 12} 160q-10 -18 0 -32t0 -32`} fill="none" stroke="#888" strokeWidth={2.5} {...draw(hole)} />)}
        </g>
      )}
      <Stamp p={prog(t, 71.0, 0.25)} x={560} y={260} text="けが" />
    </Paper>
  );
};
/** 5 枚目 メモ（1:12.5〜1:15.25）。数が 0 から数え上がる → 安全帽と ✓ → 矢印 → カードの枠 → カードが広がる */
const MemoSheet: React.FC<{ t: number }> = ({ t }) => {
  const n = Math.round(interpolate(t, [73.0, 73.8], [0, 257], { ...clamp, easing: Easing.out(Easing.cubic) }));
  const row = [73.5, 73.75, 74.0].map((a) => prog(t, a, 0.25));
  const grow = interpolate(t, [74.5, 75.0], [0, 1], { ...clamp, easing: ease });
  const card = { x: 430 + (14 - 430) * grow, y: 214 + (12 - 214) * grow, w: 70 + (VW - 28 - 70) * grow, h: 86 + (VH - 24 - 86) * grow };
  return (
    <Paper wobble={false}>
      <rect width={VW} height={VH} fill="#fffbe8" />
      {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M30 ${44 + i * 34}H630`} stroke="#bcd3ea" strokeWidth={1.5} />)}
      <path d="M70 0V340" stroke="#e7a3a3" strokeWidth={1.5} />
      <Written text="日本で働く外国人" p={prog(t, 72.5, 0.45)} x={96} y={70} size={30} anchor="start" />
      <text x={96} y={140} fontFamily={FONT_PEN} fontSize={58} fontWeight={700} fill={INK} opacity={prog(t, 73.0, 0.15)}>約 {n} 万人</text>
      <text x={96} y={172} fontFamily={FONT_JP} fontSize={11} fill="#555" opacity={prog(t, 73.0, 0.3)}>厚生労働省「外国人雇用状況」の届出状況まとめ（令和 7 年 10 月末）。数を丸めた</text>
      {row[0] > 0 && (
        <g opacity={row[0]}>
          <HelmetIcon x={200} y={268} s={1.6} />
          <path d="M236 240l10 12l20 -26" fill="none" stroke="#2e8b57" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {row[1] > 0 && <path d="M300 250H390M372 236L392 250L372 264" {...ink} {...draw(row[1])} />}
      {row[2] > 0 && (
        <g>
          <rect x={card.x} y={card.y} width={card.w} height={card.h} rx={8} fill="#fff" stroke={INK} strokeWidth={4} opacity={row[2]} />
          {grow < 0.3 && <HelmetIcon x={card.x + card.w / 2} y={card.y + card.h * 0.62} s={1.1 * (1 - grow)} />}
        </g>
      )}
    </Paper>
  );
};
/** 見出しだけの白い紙（録画の前に 1 秒） */
const HeadSheet: React.FC<{ text: string; lt: number }> = ({ text, lt }) => (
  <Paper>
    <Written text={text} p={prog(lt, 0.05, 0.55)} x={VW / 2} y={VH / 2 - 10} size={44} />
  </Paper>
);
const KariPaper: React.FC<{ text: string; children?: React.ReactNode }> = ({ text, children }) => (
  <svg width={WIN.w} height={WIN.h} viewBox={VB} style={{ position: "absolute", inset: 0 }}>
    <defs>
      <pattern id="kari-st" width={30} height={30} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width={30} height={30} fill="#fbf3dc" />
        <rect width={15} height={30} fill="#f3e8c8" />
      </pattern>
    </defs>
    <rect width={VW} height={VH} fill="url(#kari-st)" />
    {children}
    <g transform={`translate(${VW / 2} ${children ? 300 : VH / 2 - 20})`}>
      <rect x={-text.length * 10 - 50} y={-24} width={text.length * 20 + 100} height={44} rx={8} fill="#fffdf6" stroke="#c0392b" strokeWidth={3} />
      <rect x={-text.length * 10 - 42} y={-17} width={30} height={30} rx={6} fill="#c0392b" />
      <text x={-text.length * 10 - 27} y={5} textAnchor="middle" fontFamily={FONT_JP} fontSize={17} fontWeight={700} fill="#fff">仮</text>
      <text x={15} y={6} textAnchor="middle" fontFamily={FONT_JP} fontSize={18} fontWeight={700} fill={INK}>{text}</text>
    </g>
  </svg>
);
/** 時計 2 つと「正」の数え（数は出さない。1:08〜2:20 の仮） */
const ClocksKari: React.FC<{ t: number }> = ({ t }) => (
  <KariPaper text="時計 2 つ（数は 11/6 のあとに入れる）">
    {[200, 460].map((cx, j) => {
      const deg = Math.min(j === 1 ? 140 : 9999, (t - 128) * 60);
      const a = ((deg - 90) * Math.PI) / 180;
      return (
        <g key={cx}>
          <circle cx={cx} cy={130} r={78} fill="#fff" stroke={INK} strokeWidth={4} />
          <path d={`M${cx} 130L${cx + Math.cos(a) * 62} ${130 + Math.sin(a) * 62}`} stroke={j ? "#2e8b57" : "#c0392b"} strokeWidth={5} strokeLinecap="round" />
          <text x={cx} y={248} textAnchor="middle" fontFamily={FONT_PEN} fontSize={20} fontWeight={700} fill={INK}>{j ? "カードで" : "文書で"}</text>
          {Array.from({ length: Math.min(j ? 2 : 4, Math.floor((t - 129) / 2) + 1) }, (_, k) => (
            <text key={k} x={cx - 40 + k * 28} y={276} fontFamily={FONT_PEN} fontSize={24} fill={INK}>正</text>
          ))}
        </g>
      );
    })}
  </KariPaper>
);

/** 録画を紙いっぱいに流す（紙も録画も 16:9 なので黒い余白は出ない）。足りなければ遅くし（半分の速さまで）、それでも足りなければ最後のコマで止める */
interface ClipPart { src: string; dur: number; from?: number; slot: number }
const Clip: React.FC<{ part: ClipPart; extra: number }> = ({ part, extra }) => {
  const slotF = sec(part.slot) + extra;
  const speed = Math.max(0.5, part.dur / part.slot);
  const play = Math.min(sec(part.slot), Math.floor((part.dur / speed) * FPS));
  const v = <OffthreadVideo src={staticFile(part.src)} startFrom={sec(part.from ?? 0)} playbackRate={speed} muted style={{ width: "100%", height: "100%", objectFit: "contain", background: "#111" }} />;
  return (
    <>
      <Sequence durationInFrames={play} layout="none">{v}</Sequence>
      {play < slotF && (
        <Sequence from={play} durationInFrames={slotF - play} layout="none">
          <Freeze frame={Math.max(0, play - 2)}>{v}</Freeze>
        </Sequence>
      )}
    </>
  );
};
const Clips: React.FC<{ parts: ClipPart[]; stamp?: boolean }> = ({ parts, stamp }) => {
  const f = useCurrentFrame();
  const total = parts.reduce((a, p) => a + sec(p.slot), 0);
  let at = 0;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#111" }}>
      {parts.map((p, i) => {
        const from = at;
        at += sec(p.slot);
        const extra = i === parts.length - 1 ? sec(PULL) : 0;
        return (
          <Sequence key={i} from={from} durationInFrames={sec(p.slot) + extra} layout="none">
            <div style={{ position: "absolute", inset: 0 }}>
              <Clip part={p} extra={extra} />
            </div>
          </Sequence>
        );
      })}
      {stamp && (
        <svg width={WIN.w} height={WIN.h} viewBox={VB} style={{ position: "absolute", inset: 0 }}>
          <Stamp p={interpolate(f, [total - sec(0.9), total - sec(0.6)], [0, 1], clamp)} x={VW - 70} y={VH - 90} text="署名" />
        </svg>
      )}
    </div>
  );
};
// 機能の場面の録画（runs-video。dur は使う長さの秒、from は使い始めの秒）。どの場面も頭の 1 秒は見出しの紙
const CLIPS: Record<string, ClipPart[]> = {
  "f-fold": [{ src: "fold.mp4", dur: 6.04, slot: 7 }],
  "f-card": [{ src: "card.mp4", dur: 4.92, slot: 6 }],
  "f-check": [{ src: "danger.mp4", dur: 1.28, slot: 2 }, { src: "queue.mp4", dur: 4.6, from: 8.5, slot: 4 }], // 確認待ちの録画は頭の約 8 秒が白い画面（読み込みの間）
  // 経路の録画は、最後にスマホの幅に切り替えて確かめる所（1.95 秒から）を使わない
  "f-route": [{ src: "route.mp4", dur: 1.95, slot: 5 }],
  // 直す所の録画は、頭の約 1 秒が読み込み中の白い画面なので 1 秒から使う。署名の録画も頭の 0.5 秒が読み込み中
  "f-sign": [{ src: "fix.mp4", dur: 3.84, from: 1, slot: 3 }, { src: "sign.mp4", dur: 1.9, from: 0.5, slot: 2 }, { src: "read.mp4", dur: 1.1, from: 0.1, slot: 1 }],
};
const HEADS: Record<string, string> = { "f-fold": "折りたたむ", "f-card": "形が崩れない理由", "f-check": "確かめる AI", "f-route": "元の文に戻る", "f-sign": "直して署名", "f-notrans": "翻訳を入れない" };

/** 40 業種のカードが 0.15 秒に 1 枚ずつ、紙の真ん中から扇のように開く（2:46〜2:52）。t は冒頭からの秒 */
const IndustriesPic: React.FC<{ t: number }> = ({ t }) => {
  const cols = 10;
  const cw = 58;
  const ch = 72;
  return (
    <>
      <rect width={VW} height={VH} fill={PAPER} filter="url(#brush-paper)" />
      {INDUSTRY_DRAFTS.slice(0, 40).map((d, i) => {
        const p = prog(t, 166 + i * 0.15, 0.35);
        if (p <= 0) return null;
        const ex = 26 + (i % cols) * (cw + 3) + cw / 2;
        const ey = 10 + Math.floor(i / cols) * (ch + 6) + ch / 2;
        const x = interpolate(p, [0, 1], [VW / 2, ex]);
        const y = interpolate(p, [0, 1], [VH / 2, ey]) - Math.sin(p * Math.PI) * 30;
        const rot = interpolate(p, [0, 1], [((i % cols) - 4.5) * 12, (i % 2 ? 1 : -1) * 2]);
        const r = d.roles[0];
        const fig = characterSvg({ angles: POSES.stand, x: 0, groundY: 0, height: 46, facing: "right", view: "front", role: r.role, headwear: r.headwear, outfit: r.outfit });
        return (
          <g key={d.id} transform={`translate(${x} ${y}) rotate(${rot}) scale(${0.3 + p * 0.7})`}>
            <rect x={-cw / 2} y={-ch / 2} width={cw} height={ch} rx={6} fill="#fff" stroke="#b9ad8f" strokeWidth={2} />
            <g transform={`translate(0 ${ch / 2 - 18})`} dangerouslySetInnerHTML={{ __html: fig }} />
            <text y={ch / 2 - 5} textAnchor="middle" fontFamily={FONT_JP} fontSize={9.5} fontWeight={700} fill={INK}>{d.name.length > 6 ? `${d.name.slice(0, 6)}…` : d.name}</text>
          </g>
        );
      })}
    </>
  );
};
/** 2:33〜2:46 の仮の紙。2:45〜2:46 に粒にほどけて紙の真ん中へ集まる */
const VoiceKari2: React.FC<{ t: number }> = ({ t }) => (
  <svg width={WIN.w} height={WIN.h} viewBox={VB} style={{ position: "absolute", inset: 0 }}>
    <Dissolve id="paper-dots" p={interpolate(t, [165, 166], [0, 1], clamp)} boxes={[{ x0: 0, y0: 0, x1: VW, y1: VH, colors: ["#fbf3dc", "#f3e8c8", "#c0392b", "#fffdf6"] }]} to={[VW / 2, VH / 2]} cell={12}>
      <foreignObject width={VW} height={VH}>
        <div style={{ width: VW, height: VH, position: "relative" }}>
          <KariPaper text="監修者の言葉（11/6 に撮る・同意が先）" />
        </div>
      </foreignObject>
    </Dissolve>
  </svg>
);

// ---- 枠の中の紙の並び（紙芝居の抜き: 前の紙を左へ抜き切り、次の紙を上から差し込む。noPull は白く光る・粒にほどける替わり方） ----
interface Sheet { from: number; to: number; body: (lt: number, t: number) => React.ReactNode; noPull?: boolean; dropIn?: boolean }
const SHEETS: Sheet[] = (() => {
  const s: Sheet[] = [];
  s.push({ from: 19, to: 52.75, noPull: true, body: (_lt, t) => (
    <Paper>
      <g transform={`translate(0 ${STORY_DY})`}><StoryStrip t={t} f={Math.round(t * FPS)} /></g>
    </Paper>
  ) });
  s.push({ from: 52.75, to: 62, body: (_lt, t) => <SiteSheet t={t} /> });
  s.push({ from: 62, to: 66, body: (_lt, t) => <PosterSheet t={t} /> });
  s.push({ from: 66, to: 68.5, body: (_lt, t) => <ChoreiSheet t={t} /> });
  s.push({ from: 68.5, to: 72.5, body: (_lt, t) => <JacketSheet t={t} /> });
  s.push({ from: 72.5, to: 75.25, noPull: true, body: (_lt, t) => <MemoSheet t={t} /> });
  for (const seg of SEGS.filter((g) => g.id.startsWith("f-"))) {
    const h0 = seg.id === "f-fold" ? 75.25 : seg.at;
    s.push({ from: h0, to: seg.at + 1, body: (lt) => <HeadSheet text={HEADS[seg.id]} lt={lt} /> });
    const clip = CLIPS[seg.id];
    s.push({ from: seg.at + 1, to: seg.at + seg.len, body: () => (clip ? <Clips parts={clip} stamp={seg.id === "f-sign"} /> : <KariPaper text={seg.kari ?? ""} />) });
  }
  s.push({ from: 116, to: 128, body: () => <KariPaper text="当日の手元と画面（11/6 に撮る）" /> });
  s.push({ from: 128, to: 140, body: (_lt, t) => <ClocksKari t={t} /> });
  s.push({ from: 140, to: 153, body: () => <KariPaper text="職人さんと、壁に貼ったカードの写真（11/6）" /> });
  s.push({ from: 153, to: 166, noPull: true, body: (_lt, t) => <VoiceKari2 t={t} /> });
  s.push({ from: 165, to: 180, noPull: true, body: (_lt, t) => (<svg width={WIN.w} height={WIN.h} viewBox={VB}><IndustriesPic t={t} /></svg>) });
  // 前の紙が抜かれる紙なら、次の紙は上から差し込む
  for (let i = 1; i < s.length; i++) if (!s[i - 1].noPull) s[i].dropIn = true;
  return s;
})();
const SheetSlot: React.FC<{ sheet: Sheet }> = ({ sheet }) => {
  const f = useCurrentFrame();
  const lt = f / FPS;
  const t = sheet.from + lt;
  const len = sheet.to - sheet.from;
  // 抜く: 観客から見て左へ抜き切る（本物の紙芝居も右手で抜き、次の場面は向かって右から見え始める）
  const out = sheet.noPull ? 0 : interpolate(lt, [len, len + PULL], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  // 差す: 前の紙が抜かれる紙なら、上から差し込んで、すとんと止まる
  const drop = sheet.dropIn ? 1 - interpolate(lt, [DROP_AT, DROP_AT + DROP], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) }) : 0;
  const lift = out > 0 ? Math.sin(out * Math.PI) * 1.5 : 0;
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translate(${-out * 106}%, ${-drop * 104 - lift}%) rotate(${-out * 1.5}deg)`, boxShadow: out > 0 || drop > 0 ? "0 6px 16px rgba(0,0,0,0.35)" : undefined, overflow: "hidden" }}>
      {sheet.body(lt, t)}
    </div>
  );
};
/** 紙が白く光る（0:52.5 ポータルが消える・1:15 カードから録画へ） */
const paperFlash = (t: number) => Math.max(bump(t, 52.5, 0.5), bump(t, 75.0, 0.5));

// ---- 床の人たち ----
const SPREAD = { ...POSES.stand, arm_near_upper: 140, arm_near_lower: 10, arm_far_upper: -140, arm_far_lower: -10, leg_near_upper: 28, leg_far_upper: -28 } as Angles;
/** 主人公（リュックを背負い、一番上に赤い相棒。相棒はヘルメットをかぶらない） */
const Hero: React.FC<{ x: number; ground: number; h: number; angles: Angles; facing?: "left" | "right"; hop?: number; blink?: boolean; look?: number; helmet?: boolean }> = ({ x, ground, h, angles, facing = "right", hop = 0, blink, look = 0, helmet }) => {
  const px = x + (facing === "right" ? -1 : 1) * h * 0.2;
  return (
    <g>
      <g transform={`translate(${px} ${ground}) scale(${h / 170})`}><BigPack h={170} /></g>
      <g dangerouslySetInnerHTML={{ __html: picto({ angles, x, ground, h, facing, headwear: helmet ? "helmet" : "none" }) }} />
      <Clawd x={px} y={ground - h * 0.95 - hop} s={h * 0.24} blink={blink} look={facing === "left" ? -look : look} />
    </g>
  );
};
const G_STAND = guidePose("quarter").angles;
const G_WAVE = guidePose("quarter", true).angles;
const YOUNG_OUTFIT = INDUSTRY_DRAFTS[0].roles[1].outfit;
const CRAFT_OUTFIT = INDUSTRY_DRAFTS[0].roles[0].outfit;
const SUP_OUTFIT = { ...CRAFT_OUTFIT, armband: true, sleeve: "#a4a4a4", pants: "#8c8c8c" };
/** 案内人（動画だけの特別なキャラ。見た目と短い杖は picto の guideLook が持つ）。うっすら金色のふち。rev は下から組み上がる割合。helmet でかぶる */
const Guide: React.FC<{ x: number; ground: number; h: number; angles: Angles; facing: "left" | "right"; rev?: number; helmet?: boolean; dy?: number }> = ({ x, ground, h, angles, facing, rev = 1.3, helmet = true, dy = 0 }) => (
  <g transform={`translate(0 ${dy})`}>
    <clipPath id="guide-rev"><rect x={x - h} y={ground - h * rev} width={h * 2} height={h * rev + 4} /></clipPath>
    <g clipPath="url(#guide-rev)" style={{ filter: "drop-shadow(0 0 4px rgba(255,214,110,0.9))" }}>
      <g dangerouslySetInnerHTML={{ __html: characterSvg({ ...guideLook("quarter", helmet), angles, x, groundY: ground, height: h, facing, view: "quarter" }) }} />
    </g>
  </g>
);
/** 床の線の下からポンと出る人（0.3 秒・ほこり）。out で下へ引っ込む */
const PopUp: React.FC<{ id: string; t: number; at: number; out?: number; x: number; h: number; children: React.ReactNode }> = ({ id, t, at, out = 999, x, h, children }) => {
  const p = interpolate(t, [at, at + 0.3], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
  const q = interpolate(t, [out, out + 0.3], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  if (p <= 0 || q >= 1) return null;
  const dy = (1 - p + q) * h * 1.08;
  return (
    <g>
      <clipPath id={id}><rect x={x - h} y={0} width={h * 2} height={G + 2} /></clipPath>
      <g clipPath={`url(#${id})`}><g transform={`translate(0 ${dy})`}>{children}</g></g>
      <Dust t={t} t0={at} x={x} />
      {out < 999 && <Dust t={t} t0={out} x={x} />}
    </g>
  );
};
const Dust: React.FC<{ t: number; t0: number; x: number; n?: number }> = ({ t, t0, x, n = 4 }) => {
  const p = (t - t0) / 0.6;
  if (p <= 0 || p >= 1) return null;
  return (
    <g opacity={0.65 * (1 - p)}>
      {Array.from({ length: n }, (_, i) => {
        const s = i % 2 ? 1 : -1;
        return <circle key={i} cx={x + s * (16 + p * (30 + i * 10))} cy={G - 4 - p * (6 + i * 3)} r={5 + p * 8 + i} fill="#d8cfbf" />;
      })}
    </g>
  );
};
const Person: React.FC<{ svg: string; x: number; k?: number; wide?: number }> = ({ svg, x, k = 1, wide = 1 }) => <g transform={`translate(${x} ${G}) scale(${wide * k} ${k})`} dangerouslySetInnerHTML={{ __html: svg }} />;
const craftSvg = (angles: Angles, facing: "left" | "right") => characterSvg({ angles, x: 0, groundY: 0, height: CRH, facing, view: "quarter", role: "worker", headwear: "helmet", outfit: CRAFT_OUTFIT }).split('fill="#999"').join('fill="#f2c230"');
const senpaiSvg = (angles: Angles) => characterSvg({ angles, x: 0, groundY: 0, height: HH, facing: "right", view: "quarter", role: "new", headwear: "helmet", outfit: YOUNG_OUTFIT });
const supSvg = (angles: Angles) => characterSvg({ angles, x: 0, groundY: 0, height: HH, facing: "right", view: "quarter", role: "worker", headwear: "helmet", outfit: SUP_OUTFIT }).split('fill="#999"').join('fill="#fff"');

/** 吹き出し（1920×1080 で y 720〜800・字は 24 px。出るとき 0.3 秒で 10 px 下りる） */
const BUBBLES: [number, number, "hero" | "guide" | "craft" | "senpai", string][] = [
  [54.0, 55.0, "guide", "電気工事士の妖精 TOMOだよ。"],
  [54.5, 55.4, "hero", "…こんにちは！"],
  [55.0, 56.0, "guide", "とりあえず、これかぶりなよ。"],
  [61.0, 62.3, "guide", "ここが、電気の現場。"],
  [62.5, 64.5, "craft", "貼り紙、字ばっかりで読んでもらえないんだよ。"],
  [64.5, 66.0, "hero", "なるほど、字だけだと届かないんですね。"],
  [68.5, 70.5, "senpai", "朝礼で言っても、言葉が分からない子には届かない。"],
  [70.5, 72.0, "hero", "届かないと、けがになるんですね…"],
];
const Bubble: React.FC<{ t: number; a: number; b: number; x: number; text: string }> = ({ t, a, b, x, text }) => {
  const p = prog(t, a, 0.3);
  const o = p * (1 - prog(t, b - 0.2, 0.2));
  if (o <= 0) return null;
  const w = text.length * 16 + 26;
  const bx = Math.max(10 + w / 2, Math.min(W - 10 - w / 2, x));
  const y = 482 - (1 - p) * 6.7;
  const tx = Math.max(bx - w / 2 + 16, Math.min(bx + w / 2 - 16, x));
  return (
    <g opacity={o}>
      <path d={`M${bx - w / 2} ${y}H${bx + w / 2}V${y + 40}H${tx + 8}L${tx} ${y + 51}L${tx - 8} ${y + 40}H${bx - w / 2}Z`} fill="#fff" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <text x={bx} y={y + 26} textAnchor="middle" fontFamily={FONT_JP} fontSize={16} fontWeight={700} fill={INK}>{text}</text>
    </g>
  );
};
/** 主人公のメモ帳（0.5〜2 秒に 1 行ずつ増える） */
const MEMO_T = [60.5, 61.5, 62.8, 64.0, 65.5, 67.5, 69.0, 70.0, 71.5, 130];
const Memo: React.FC<{ x: number; y: number; t: number; s?: number }> = ({ x, y, t, s = 1 }) => {
  const n = MEMO_T.filter((m) => m <= t).length;
  return (
    <g transform={`translate(${x} ${y}) rotate(-8) scale(${s})`}>
      <rect x={-12} y={-18} width={24} height={36} rx={2} fill="#fffdf2" stroke={INK} strokeWidth={2} />
      <path d="M-12 -18H12" stroke="#c0392b" strokeWidth={3} />
      {Array.from({ length: n }, (_, i) => <path key={i} d={`M-8 ${-12 + i * 3.2}h${10 + (i % 3) * 3}`} stroke="#555" strokeWidth={1.4} />)}
    </g>
  );
};

/** 時刻ごとの立ち位置（1080 の x を 2/3 にした値） */
const heroX = (t: number) => interpolate(t, [53.5, 58.0, 58.5, 59.0, 59.5, 62.0, 66.5, 68.0, 75.0, 76.0, 115.5, 116.5], [220, 220, 467, 553, 600, 767, 767, 467, 467, 347, 347, 420], clamp);
const guideX = (t: number) => interpolate(t, [49.5, 58.0, 59.0, 59.5, 62.0, 66.5, 68.0, 71.2, 71.5, 72.5, 73.0, 75.0, 76.0, 115.5, 116.5], [400, 400, 467, 553, 900, 900, 600, 600, 535, 535, 600, 600, 467, 467, 560], clamp);
const sizeK = (t: number) => interpolate(t, [75.0, 76.0, 115.5, 116.5], [1, 0.75, 0.75, 1], clamp);
const walking = (t: number) => (t >= 58.0 && t < 62.0) || (t >= 66.5 && t < 68.0) || (t >= 75.0 && t < 76.0) || (t >= 115.5 && t < 116.5);
/** 2:47 から 0.5 秒ずつずれて手を振る（監修者・主人公・相棒・案内人・職人さん） */
const waveAt = (t: number, i: number) => (t >= 167 + i * 0.5 && t < 173.6 ? 0.6 + 0.4 * Math.sin((t - 167 - i * 0.5) * 9) : -1);

const FloorActors: React.FC<{ t: number; f: number }> = ({ t, f }) => {
  if (t < 45.5) return null;
  const k = sizeK(t);
  const h = HH * k;
  const blink = t % 3.1 < 0.1 || (t >= 48.0 && t < 48.12);
  const helmetOn = t >= 56.0;
  // ---- 主人公 ----
  let heroNode: React.ReactNode = null;
  let hx = 220;
  if (t >= 46.5 && t < 47.0) {
    // 光と一緒に、左から弧を描いて 1 回転しながら飛んでくる
    const p = (t - 46.5) / 0.5;
    const x = interpolate(p, [0, 1], [-120, 220]);
    const y = G - Math.sin(p * Math.PI) * 170;
    heroNode = (
      <g transform={`rotate(${360 * p} ${x} ${y - h * 0.5})`}>
        <Hero x={x} ground={y} h={h} angles={POSES.fall} />
      </g>
    );
  } else if (t >= 47.0 && t < 53.0) {
    // ドテッ: うつぶせの大の字（頭は右）。0.85 に潰れて戻る。0:48 に頭を上げる
    const sq = interpolate(t, [47.0, 47.06, 47.3], [1, 0.85, 1], clamp);
    const lift = 10 * prog(t, 48.0, 0.3);
    const lx = 220 - h / 2;
    const ly = G - h * 0.12;
    heroNode = (
      <g transform={`translate(220 ${G}) scale(${1 + (1 - sq) * 0.6} ${sq}) translate(-220 ${-G})`}>
        <g transform={`rotate(${90 - lift} ${lx} ${ly})`}>
          <Hero x={lx} ground={ly} h={h} angles={SPREAD} blink={blink} />
        </g>
      </g>
    );
    if (t >= 52.95) heroNode = null;
  }
  if (t >= 53.0) {
    hx = heroX(t);
    const walk = walking(t);
    const jump = bump(t, 53.0, 0.3);
    let angles: Angles = POSES.stand;
    if (t < 53.5) angles = POSES.sit;
    else if (walk) angles = gait("walk", t / 0.55);
    else if (t >= 54.5 && t < 55.1) angles = POSES.phone; // 頭をかく
    else if (t >= 55.5 && t < 56.0) angles = POSES.carry; // 両手で受け取る
    else if (t >= 56.0 && t < 56.3) angles = POSES.reach_up; // かぶる
    else if (t >= 56.5 && t < 56.9) angles = POSES.phone; // 直す
    else if (t >= 59.5 && t < 72.5) angles = POSES.write;
    else if (t >= 72.5 && t < 74.0) angles = POSES.look_down;
    else if (t >= 74.0 && t < 140) angles = t >= 129.5 && t < 130.5 ? POSES.write : POSES.look_up;
    const w = waveAt(t, 1);
    if (w >= 0) angles = mixAngles(POSES.stand, POSES.wave, w);
    const facing: "left" | "right" = t >= 66.0 && t < 72.5 ? "left" : "right";
    const nod = bump(t, 65.5, 0.4) * 3 + bump(t, 71.6, 0.4) * 3;
    // 1:16〜1:56 は 2 秒ごとに小さく動く（主人公が跳ぶ・案内人がうなずく・相棒が跳ぶの順）
    const beat = t >= 76 && t < 116 ? Math.floor((t - 76) / 2) : -1;
    const small = beat >= 0 ? bump(t, 76 + beat * 2, 0.4) : 0;
    const heroHop = (beat % 3 === 0 ? small * h * 0.12 : 0) + jump * h * 0.28;
    const partHop = jump * h * 0.5 + (bump(t, 56.5, 0.3) + bump(t, 56.85, 0.3)) * h * 0.2 + (beat % 3 === 2 ? small * h * 0.2 : 0) + (waveAt(t, 2) >= 0 ? Math.abs(Math.sin((t - 168) * 6)) * h * 0.18 : 0);
    heroNode = (
      <g transform={`translate(0 ${nod - heroHop})`}>
        <Hero x={hx} ground={G} h={h} angles={angles} facing={facing} hop={partHop - heroHop} blink={blink} look={t >= 56.5 && t < 57 ? 1 : walk ? 1 : 0} helmet={helmetOn} />
        {((t >= 59.5 && t < 76) || (t >= 116 && t < 140)) && <Memo x={hx + (facing === "right" ? 1 : -1) * h * 0.26} y={G - h * 0.5} t={t} s={k} />}
      </g>
    );
  }
  // ---- 案内人 ----
  const gx = guideX(t);
  const rev = interpolate(t, [49.9, 50.0, 50.5, 51.0, 51.5, 51.8], [0, 0.1, 0.42, 0.75, 1.0, 1.3], clamp);
  const gWalk = walking(t) && t >= 58.0;
  const gFacing: "left" | "right" = t >= 57.0 && t < 66.0 ? "right" : "left";
  // 立つ姿は杖を持つ腕を GUIDE_HOLD に合わせた形、「ようこそ」（0:54.0〜0:55.0）は手を振る形（どちらも picto の guidePose）
  let gAngles: Angles = G_STAND;
  if (gWalk) gAngles = gait("walk", t / 0.6 + 0.3);
  else if (t >= 54.0 && t < 55.0) gAngles = G_WAVE;
  else if (t >= 55.0 && t < 55.6) gAngles = POSES.point; // ヘルメットを差し出す
  else if (t >= 57.2 && t < 58.0) gAngles = POSES.point; // 右を指す
  else if (t >= 71.5 && t < 72.5) gAngles = POSES.point; // 肩に手
  else if (t >= 74.0 && t < 140) gAngles = POSES.look_up;
  const gw = waveAt(t, 3);
  if (gw >= 0) gAngles = mixAngles(G_STAND, G_WAVE, gw);
  const beat = t >= 76 && t < 116 ? Math.floor((t - 76) / 2) : -1;
  const gNod = bump(t, 57.0, 0.3) * 4 + (beat % 3 === 1 ? bump(t, 76 + beat * 2, 0.4) * 3 : 0);
  // ---- 光と粒（0:45.5〜0:52.5）----
  const fanO = interpolate(t, [45.5, 45.8, 46.0, 48.5, 49.5], [0, 0.35, 0.55, 0.55, 0], clamp);
  const ring = t >= 52.5 && t < 53.0 ? (t - 52.5) / 0.5 : 0;
  const helmetPop = bump(t, 52.0, 0.3);
  // 案内人の左手の 2 つめのヘルメット（0:52.5 に粒から → 0:55 に差し出す → 0:55.5 主人公の手へ → 0:56 かぶる）
  let hel: [number, number] | null = null;
  if (t >= 52.5 && t < 56.0) {
    const hold: [number, number] = [gx + h * 0.24, G - h * 0.4];
    const out: [number, number] = [gx - h * 0.46, G - h * 0.62];
    const hand: [number, number] = [hx + h * 0.32, G - h * 0.58];
    const a = prog(t, 55.0, 0.3);
    const b = prog(t, 55.5, 0.4);
    const p0: [number, number] = [hold[0] + (out[0] - hold[0]) * a, hold[1] + (out[1] - hold[1]) * a];
    hel = [p0[0] + (hand[0] - p0[0]) * b, p0[1] + (hand[1] - p0[1]) * b];
    const up = prog(t, 55.85, 0.15);
    hel = [hel[0] + (hx - hel[0]) * up, hel[1] + (G - h * 0.93 - hel[1]) * up];
  }
  // ---- 職人さん・先輩・監修者 ----
  const craftX = interpolate(t, [142.0, 142.5], [1033, 980], clamp);
  const cAngles = (t >= 142.0 && t < 142.5) ? gait("walk", t / 0.5) : waveAt(t, 4) >= 0 ? mixAngles(POSES.stand, POSES.wave, waveAt(t, 4)) : t >= 62.5 && t < 64.5 ? POSES.point : POSES.stand;
  const sAngles = waveAt(t, 0) >= 0 ? mixAngles(POSES.stand, POSES.wave, waveAt(t, 0)) : POSES.stand;
  return (
    <g>
      {/* 左下の外から差す、やわらかいクリーム色の扇の光（1080 では (-80, 950) から）。光は地のレイヤー（L1） */}
      <L n={1}>
      {fanO > 0 && (
        <g opacity={fanO}>
          <defs>
            <radialGradient id="fan" cx={-53} cy={633} r={760} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#fff6d8" stopOpacity={1} />
              <stop offset="0.45" stopColor="#ffe9b0" stopOpacity={0.55} />
              <stop offset="1" stopColor="#ffe9b0" stopOpacity={0} />
            </radialGradient>
          </defs>
          <circle cx={-53} cy={633} r={760} fill="url(#fan)" />
        </g>
      )}
      </L>
      <L n={4}>
      {/* 金の斜めの線 3 本（0:46.5） */}
      {t >= 46.5 && t < 47.1 && [0, 1, 2].map((i) => {
        const p = (t - 46.5) / 0.6;
        return <path key={i} d={`M${-40 + i * 50 + p * 300} ${470 + i * 40}l120 60`} stroke="#ffd36a" strokeWidth={4 - i} strokeLinecap="round" opacity={1 - p} />;
      })}
      {/* 門（0:57.5 に下から立ち上がり、0:58 に遮断の棒が上がる。1:15 まで左に残る） */}
      <Gate t={t} part="back" />
      {/* 粒: 0:46 に 8 つが飛び込み、0:46.5 に 40 が散る → 漂う → 0:49.5 に x 400 へ流れて案内人になる → 残りは左手のヘルメットに */}
      {t >= 46.0 && t < 52.6 && Array.from({ length: 40 }, (_, i) => {
        const early = i < 8;
        const t0 = early ? 46.0 + i * 0.04 : 46.5;
        if (t < t0) return null;
        const sx = early ? -40 : 220 + (hash(i) - 0.5) * 60;
        const sy = early ? 600 - i * 12 : G - 60 - hash(i + 1) * 40;
        const fx = early ? 120 + hash(i) * 280 : 120 + hash(i + 2) * 420;
        const fy = G - 20 - hash(i + 3) * 200;
        const fly = Math.min(1, (t - t0) / (early ? 0.5 : 0.7));
        const fe = 1 - (1 - fly) * (1 - fly);
        let x = sx + (fx - sx) * fe + Math.sin(t * 2 + i) * 8;
        let y = sy + (fy - sy) * fe + Math.cos(t * 1.7 + i) * 6;
        // 0:49.5 から案内人の所へ（下の粒から順に）、最後の 6 つは 0:52 に左手へ
        const toHand = i >= 34;
        const tc = toHand ? 52.3 : 50.0 + (i / 34) * 1.8;
        const tx = toHand ? gx + h * 0.24 : gx + (hash(i + 4) - 0.5) * h * 0.4;
        const ty = toHand ? G - h * 0.4 : G - ((i / 34) * h * 1.05);
        const g = interpolate(t, [toHand ? 52.0 : 49.5, tc], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
        x += (tx - x) * g;
        y += (ty - y) * g;
        if (g >= 1) return null;
        return <circle key={i} cx={x} cy={y} r={2.2 + (i % 3)} fill="#ffe38a" opacity={0.65 + 0.35 * Math.sin(f / 3 + i)} />;
      })}
      {/* 着地のほこり */}
      <Dust t={t} t0={47.0} x={220} n={6} />
      {t >= 47.0 && <ellipse cx={hx} cy={G + 4} rx={h * 0.36} ry={6} fill="#000" opacity={0.2} />}
      {rev > 0 && <ellipse cx={gx} cy={G + 4} rx={h * 0.3} ry={6} fill="#000" opacity={0.2} />}
      {rev > 0 && <Guide x={gx} ground={G} h={h} angles={gAngles} facing={gFacing} rev={rev} helmet={t >= 52.0} dy={gNod} />}
      {helmetPop > 0 && <circle cx={gx} cy={G - h * 0.95} r={h * 0.12 + helmetPop * 10} fill="none" stroke="#fff3b0" strokeWidth={3} opacity={helmetPop} />}
      {ring > 0 && <ellipse cx={gx} cy={G - h * 0.5} rx={h * (0.3 + ring * 0.9)} ry={h * (0.55 + ring * 0.5)} fill="none" stroke="#fff3b0" strokeWidth={6 * (1 - ring)} opacity={1 - ring} />}
      {/* 職人さん（1:02〜1:06 は x 1033 に出て左を向く。2:21 にまた出て、一歩前へ） */}
      <PopUp id="pop-c1" t={t} at={62.0} out={66.0} x={1033} h={CRH}><Person svg={craftSvg(cAngles, "left")} x={1033} wide={1.16} /></PopUp>
      <PopUp id="pop-c2" t={t} at={141.0} x={1033} h={CRH}><Person svg={craftSvg(cAngles, "left")} x={craftX} wide={1.16} k={interpolate(t, [142.0, 142.5], [1, 1.06], clamp)} /></PopUp>
      {/* 先輩（白いヘルメット・クリップボード。杖もライトも無い。1:08〜1:12） */}
      <PopUp id="pop-s" t={t} at={68.0} out={72.0} x={320} h={HH}>
        <Person svg={senpaiSvg(POSES.stand)} x={320} />
        <g transform={`translate(${320 + HH * 0.2} ${G - HH * 0.5}) rotate(8)`}>
          <rect x={-10} y={-14} width={20} height={26} rx={2} fill="#8a5a2b" stroke={INK} strokeWidth={1.5} />
          <rect x={-7} y={-10} width={14} height={19} fill="#fff" />
        </g>
      </PopUp>
      {/* 監修者（灰色の作業服・白いヘルメット・腕章。2:34） */}
      <PopUp id="pop-v" t={t} at={154.0} x={320} h={HH}><Person svg={supSvg(sAngles)} x={320} /></PopUp>
      {heroNode}
      {/* 門の右の柱は人より手前に描く（左の柱の前を通り、右の柱の後ろを抜けて、門をくぐって見える） */}
      <Gate t={t} part="front" />
      {hel && <HelmetIcon x={hel[0]} y={hel[1]} s={h / 120} />}
      {/* わっ（0:53）・ストン（0:56） */}
      {t >= 53.0 && t < 53.6 && (
        <g opacity={1 - prog(t, 53.4, 0.2)}>
          {[-30, 0, 30].map((a, i) => <path key={i} d={`M${220 + Math.sin((a * Math.PI) / 180) * 70} ${G - h - 16 - Math.cos((a * Math.PI) / 180) * 40}l${Math.sin((a * Math.PI) / 180) * 16} ${-Math.cos((a * Math.PI) / 180) * 16}`} stroke="#fff" strokeWidth={4} strokeLinecap="round" />)}
          <text x={280} y={G - h - 30} fontFamily={FONT_PEN} fontSize={26} fontWeight={700} fill="#fff" stroke={INK} strokeWidth={4} style={{ paintOrder: "stroke" }}>わっ</text>
        </g>
      )}
      {t >= 56.0 && t < 56.7 && <text x={hx + 26} y={G - h - 18} fontFamily={FONT_PEN} fontSize={22} fontWeight={700} fill="#fff" stroke={INK} strokeWidth={4} style={{ paintOrder: "stroke" }} opacity={1 - prog(t, 56.5, 0.2)}>ストン</text>}
      {BUBBLES.map(([a, b, who, text], i) => {
        const x = who === "hero" ? heroX(a) : who === "guide" ? guideX(Math.min(t, b)) : who === "craft" ? 1033 : 320;
        return <Bubble key={i} t={t} a={a} b={b} x={x} text={text} />;
      })}
      </L>
    </g>
  );
};
/** 現場の門（柱は 1080 で x 760 と 900、足元 1005 から 800 まで。上に横木と、安全帽と ✓ の札。左の柱を軸にした黄色と黒の遮断の棒） */
const Gate: React.FC<{ t: number; part: "back" | "front" }> = ({ t, part }) => {
  const rise = interpolate(t, [57.5, 57.8], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.4)) });
  const gone = prog(t, 75.0, 0.3);
  if (rise <= 0 || gone >= 1) return null;
  const lift = prog(t, 58.0, 0.35);
  const l = 507;
  const r = 600;
  const top = 533;
  const pole = (x: number) => <rect x={x - 4} y={top} width={8} height={G - top} fill="#9a9aa6" stroke={INK} strokeWidth={2} />;
  if (part === "front") {
    return (
      <g opacity={1 - gone}>
        <clipPath id="gate-clip-f"><rect x={0} y={0} width={W} height={G + 2} /></clipPath>
        <g clipPath="url(#gate-clip-f)"><g transform={`translate(0 ${(1 - rise) * 150})`}>{pole(r)}</g></g>
      </g>
    );
  }
  return (
    <g opacity={1 - gone}>
      <clipPath id="gate-clip"><rect x={0} y={0} width={W} height={G + 2} /></clipPath>
      <g clipPath="url(#gate-clip)">
        <g transform={`translate(0 ${(1 - rise) * 150})`}>
          {pole(l)}
          <rect x={l - 10} y={top - 6} width={r - l + 20} height={10} rx={3} fill="#b9b9c4" stroke={INK} strokeWidth={2} />
          <rect x={(l + r) / 2 - 26} y={top - 44} width={52} height={36} rx={4} fill="#fff" stroke={INK} strokeWidth={2.5} />
          <HelmetIcon x={(l + r) / 2 - 8} y={top - 16} s={0.75} />
          <path d={`M${(l + r) / 2 + 8} ${top - 26}l5 6l10 -12`} fill="none" stroke="#2e8b57" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          <g transform={`rotate(${-80 * lift} ${l} ${G - 58})`}>
            <rect x={l} y={G - 62} width={r - l - 4} height={8} fill="#f2c230" stroke={INK} strokeWidth={1.5} />
            {[0, 1, 2, 3].map((i) => <rect key={i} x={l + 10 + i * 22} y={G - 62} width={10} height={8} fill="#222" />)}
          </g>
        </g>
      </g>
      <Dust t={t} t0={57.5} x={(l + r) / 2} />
    </g>
  );
};

/** 0:19 から 3:00 までの舞台 */
const Stage: React.FC = () => {
  const f = useCurrentFrame();
  const g = f + TOTAL;
  const t = g / FPS;
  const seg = [...SEGS].reverse().find((s) => t >= s.at) ?? SEGS[0];
  const endPhase = t >= 174;
  const closeDeg = doorDeg(0.7 * (1 - Math.min(1, Math.max(0, (t - 174) / 0.8))));
  const back = interpolate(t, [176, 178], [0, 1], { ...clamp, easing: ease });
  const sk = 1 - back * 0.64;
  const stageO = 1 - back;
  const write = prog(t, 178, 1.6);
  const MEDE = "めでたし、めでたし。";
  const flash = paperFlash(t);
  return (
    <AbsoluteFill>
      {/* 机の上（カメラが引くと見える）。L1 */}
      <L n={1}>
      <AbsoluteFill style={{ background: "#efe6d6" }} />
      {back > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
          <rect width={W} height={H} fill="#efe6d6" />
          <rect y={398} width={W} height={H - 398} fill="#a87a4e" />
          <rect y={398} width={W} height={7} fill="#7c5634" />
        </svg>
      )}
      {/* 紫の舞台と床はカメラと一緒に縮めず、その場で薄くする（縮めると机の上に紫の四角が残って見えるため） */}
      {stageO > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, opacity: stageO }}>
          <rect width={W} height={H} fill={PURPLE} />
          <rect y={FLOOR_Y} width={W} height={H - FLOOR_Y} fill={FLOOR} />
        </svg>
      )}
      </L>
      <div style={{ position: "absolute", inset: 0, transformOrigin: `640px ${FRAME.cy}px`, transform: `translateY(${back * 8}px) scale(${sk})` }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
          {/* フィルターの定めは、どのレイヤーでも描く（無いと、フィルターを使う絵が消えるため） */}
          <WobbleDefs />
          <L n={2}>{endPhase ? <StageFrame cx={W / 2} deg={closeDeg} /> : <StageFrame cx={W / 2} open={1} />}</L>
        </svg>
        {/* 枠の窓（L3）。2:54 に扉が閉じるときは、扉がかぶった所を切り取る（扉は下の L2 にあるため） */}
        <L n={3}>
          <div style={{ position: "absolute", left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h, overflow: "hidden", clipPath: endPhase ? `inset(0 ${doorCover(closeDeg)}px 0 ${doorCover(closeDeg)}px)` : undefined }}>
            {/* 舞台の奥の板（紙を抜いてから次の紙を差すまでの間だけ見える） */}
            {t >= 19 && <div style={{ position: "absolute", inset: 0, background: "#6b4f33", boxShadow: "inset 0 0 40px rgba(0,0,0,0.45)" }} />}
            {[...SHEETS].reverse().map((s, i) => (
              <Sequence key={i} from={sec(s.from) - TOTAL} durationInFrames={Math.max(1, sec(s.to - s.from) + (s.noPull ? 0 : sec(PULL)))} layout="none">
                <SheetSlot sheet={s} />
              </Sequence>
            ))}
            {flash > 0 && <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />}
          </div>
        </L>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
          <L n={2}>
          <LightRings o={1} />
          <StageLamps t={t} />
          {t >= 174.8 && t < 175.5 && <text x={640} y={330} textAnchor="middle" fontFamily={FONT_PEN} fontSize={44} fontWeight={700} fill="#fff" stroke={INK} strokeWidth={6} style={{ paintOrder: "stroke" }} opacity={1 - prog(t, 175.2, 0.3)}>パタン</text>}
          </L>
          <FloorActors t={t} f={f} />
        </svg>
      </div>
      {/* 鉛筆で「めでたし、めでたし。」（L3） */}
      <L n={3}>
      {write > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
          <BrushPaper x={400} y={480} w={480} h={140} rot={-2} />
          <Written text={MEDE} p={write} x={640} y={566} size={48} />
          {write < 1 && (
            <g transform={`translate(${470 + write * 340} 552) rotate(30)`}>
              <rect x={-7} y={-110} width={14} height={100} rx={3} fill="#e8b83a" stroke="#6b4a12" strokeWidth={2} />
              <path d="M-7 -10L0 8L7 -10Z" fill="#f2d7a8" stroke="#6b4a12" strokeWidth={2} />
              <path d="M-2 2L0 8L2 2Z" fill="#333" />
            </g>
          )}
        </svg>
      )}
      </L>
      <L n={5}>{seg.kari && t < 174 && <Kari text={seg.kari} />}</L>
    </AbsoluteFill>
  );
};

/** 冒頭（0:00〜0:19）: 0:00〜0:13 の白地の段は intro.tsx の 1 本（地・枠・紙・紙の人を中で L1〜L4 に分ける）。開演と題（0:13〜）は場面の中でレイヤーに分ける */
const Opening: React.FC = () => (
  <>
    <Sequence durationInFrames={INTRO_FRAMES} name="冒頭の白地の段（折り紙）">
      {/* 中でレイヤーに分けてある（地 L1・枠 L2・紙 L3・紙の人 L4） */}
      <Intro />
    </Sequence>
    {SCENES.filter((s) => s.id === "s7-curtain" || s.id === "s8-title").map((s) => {
      const C = SCENE_COMPONENTS[s.id];
      return (
        <Sequence key={s.id} from={startOf(s.id)} durationInFrames={s.frames} name={s.title}>
          <C />
        </Sequence>
      );
    })}
  </>
);
const Subtitles: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  return <Subtitle t={t} fade={1 - prog(t, 176.5, 0.5)} />;
};

/** layer が 0 なら全部を 1 度に描く。1〜5 ならそのレイヤーだけを描き、ほかは透明のまま（L1 だけは白地を塗る） */
export const FullLayer: React.FC<{ layer: number }> = ({ layer }) => (
  <LayerCtx.Provider value={layer}>
    <AbsoluteFill style={{ background: layer === 0 ? "#000" : layer === 1 ? "#fff" : undefined }}>
      <Sequence durationInFrames={TOTAL} name="冒頭">
        <Opening />
      </Sequence>
      <Sequence from={TOTAL} durationInFrames={FULL_FRAMES - TOTAL} name="舞台">
        <Stage />
      </Sequence>
      <L n={5}>
        <Subtitles />
        <Draft />
      </L>
    </AbsoluteFill>
  </LayerCtx.Provider>
);
export const Full: React.FC<FullProps> = () => <FullLayer layer={0} />;

/** 場面の一覧（場面ごとの真ん中のコマの静止画を並べ、時刻と場面名を付ける。静止画は render-full.mjs が先に書き出す） */
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}${s % 1 ? `.${Math.round((s % 1) * 10)}` : ""}`;
export const FullIndex: React.FC = () => {
  const cols = 6;
  const cw = 320;
  const ch = 180;
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      {SEGS.map((s, i) => {
        const x = (i % cols) * (cw + 10) + 10;
        const y = Math.floor(i / cols) * (ch + 56) + 10;
        return (
          <div key={s.id} style={{ position: "absolute", left: x, top: y, width: cw }}>
            <div style={{ width: cw, height: ch, overflow: "hidden", position: "relative", border: "1px solid #ccc" }}>
              <Img src={staticFile(`scenes/${String(i + 1).padStart(2, "0")}-${s.id}.png`)} style={{ width: cw, height: ch }} />
            </div>
            <div style={{ fontFamily: FONT_JP, fontSize: 14, color: INK, marginTop: 4, lineHeight: 1.25 }}>
              <b>{`${String(i + 1).padStart(2, "0")}  ${mmss(s.at)}〜${mmss(s.at + s.len)}`}</b>
              <br />
              {s.title}
              {s.kari ? "（仮）" : ""}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
