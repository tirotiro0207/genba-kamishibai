// 3 分の通しの仮版 v3（11/5 夜 作者の絵コンテと場面ごとの細かい台本）。
// 0:13 から 3:00 まで、木の枠と光の輪は同じ所・同じ大きさで毎コマ出す（2:57.5 からだけ、カメラが引いて机の上の小さな紙芝居だと分かる）。
// カットは使わない。替わり方は「枠の中の紙が横へ流れる」「紙芝居の抜き（紙を横へ抜く）」「白く光る」の 3 つだけ。
// お話の所（0:00〜0:52）は 0.5 秒に 1 つずつ新しいものが出る（2 つ同時に出さない）。字幕は手書き風の字体で 1 字ずつ、床に重ねる。
// 素材の無い場面は「仮」の札で埋める。動画・画像は書き出しのときに git の外から写して読む（render-full.mjs）
import React from "react";
import { AbsoluteFill, Easing, Freeze, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { characterSvg } from "../../src/shared/picto/character";
import { INDUSTRY_DRAFTS } from "../../src/shared/picto/industry-drafts";
import { type Angles, POSES } from "../../src/shared/picto/poses";
import { gait, mixAngles } from "./paper";
import { BrushPaper, FLOOR, FLOOR_Y, FONT_JP, FONT_PEN, FRAME, Light, LightRings, StageFrame, stageLights, WobbleDefs } from "./parts";
import { SCENE_COMPONENTS, TitlePaper } from "./scenes";
import { BigPack, Bulb, Clawd, picto, StoryStrip } from "./story";
import { FPS, H, INK, PURPLE, SCENES, startOf, TOTAL, W } from "./timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const sec = (s: number) => Math.round(s * FPS);
const ease = Easing.inOut(Easing.quad);
const prog = (t: number, t0: number, d = 0.3) => interpolate(t, [t0, t0 + d], [0, 1], clamp);

// ---- 場面の表（秒は台本 v3） ----
export interface Seg { id: string; title: string; at: number; len: number; kari?: string }
export const SEGS: Seg[] = [
  { id: "opening", title: "冒頭（時計・折り紙・名のり・枠・開演・題）", at: 0, len: 17 },
  { id: "story", title: "むかしむかし（出会い・誕生・学校・ゲーム機・ひらめき）", at: 17, len: 17.5 },
  { id: "adventure", title: "枠の中の冒険（リュック・巻物・相棒・ポータル）", at: 34.5, len: 8 },
  { id: "throw", title: "床へ放り出される", at: 42.5, len: 5 },
  { id: "guide", title: "光の粒が集まって案内人", at: 47.5, len: 4.5 },
  { id: "hearing", title: "ヒアリング（5 枚を抜いて替える・職人さん）", at: 52, len: 16, kari: "吹き出しの中身が入る" },
  { id: "why", title: "なぜ作ったか", at: 68, len: 8, kari: "作者の言葉が入る" },
  { id: "f-fold", title: "機能: 折りたたむ", at: 76, len: 8 },
  { id: "f-card", title: "機能: 形が崩れない理由", at: 84, len: 7 },
  { id: "f-check", title: "機能: 確かめる AI", at: 91, len: 7 },
  { id: "f-route", title: "機能: 元の文に戻る", at: 98, len: 6 },
  { id: "f-sign", title: "機能: 直して署名", at: 104, len: 7 },
  { id: "f-notrans", title: "機能: 翻訳を入れない", at: 111, len: 5, kari: "この機能の画面が入る" },
  { id: "trial", title: "試したところ", at: 116, len: 24, kari: "11/6 に撮る（当日の手元と画面・時計 2 つ。数は出さない）" },
  { id: "voice", title: "職人さんと監修者の言葉", at: 140, len: 25, kari: "11/6 に撮る・同意が先" },
  { id: "industries", title: "40 業種のカードが開く", at: 165, len: 10 },
  { id: "end", title: "扉が閉じて、机の上の紙芝居。めでたし", at: 175, len: 5 },
];
export const FULL_FRAMES = sec(180);
export interface FullProps { [key: string]: unknown; mark?: string }

// ---- 字幕（冒頭からの秒。1 字ずつ出す） ----
const CUES: [number, number, string][] = [
  [10, 13, "現場の安全の貼り紙や決まりを、紙芝居にします"],
  [17, 20, "むかしむかし、日本人のお父さんと、ベトナム人のお母さんが出会いました。"],
  [20, 21.8, "長男のイチローは、ベトナムのホーチミンで生まれました。"],
  [21.8, 23.5, "英語の幼稚園、それからベトナムの学校へ。"],
  [23.5, 26.5, "七歳で、ハノイの日本人学校へ。日本語が分からず、しばらく黙っていました。"],
  [26.5, 31, "日本語が読めなくても、ポケモン リーフグリーンは最後までクリアできました。"],
  [31, 34.5, "よい UI・UX は、ことばの壁を越える。"],
  [34.5, 38.5, "スキルの巻物をリュックに詰めて、赤い相棒と冒険へ。"],
  [38.5, 40.5, "行き先は、電気業界。"],
  [47.5, 52, "光の粒が集まって、電気工事の案内人が現れました。"],
  [52, 56, "案内人と、現場の職人さんに話を聞きました。"],
  [56, 60, "電気の現場の安全の決まりは、文字の資料と貼り紙で回っています。"],
  [60, 64, "文字が読めなければ、決まりは届きません。届かなかった決まりは、けがになります。"],
  [64, 68, "（聞いたことのまとめが入る）"],
  [68, 76, "（なぜ作ったか: 作者の言葉が入る）"],
  [77, 84, "何ページもの資料が、1 枚・0 字のカードにたたまれます。"],
  [85, 91, "絵は Claude が数で書き、アプリが描きます。だから形が崩れません。"],
  [92, 98, "別の Claude が、絵だけを見て読みます。伝わらなければ赤です。"],
  [99, 104, "絵の部品をタップすると、元の文に戻れます。"],
  [105, 108, "監修者が直したいところを枠で囲み、直ったら署名します。"],
  [108, 111, "署名したカードだけが、新入社員に届きます。"],
  [111, 116, "（翻訳を入れない理由が入る）"],
  [116, 140, "（試したところ: 11/6 に撮る）"],
  [140, 165, "（職人さんと監修者の言葉: 11/6 に撮る。同意が先）"],
  [165, 175, "電気から始めて、40 の業種へ。"],
  [175, 178.5, "外国から来た新人にも、日本人の新人にも。"],
];
const SUB_Y = 694;
const Subtitle: React.FC<{ t: number; fade: number }> = ({ t, fade }) => {
  const cue = CUES.find((c) => t >= c[0] && t < c[1]);
  if (!cue || fade <= 0) return null;
  const [a, b, text] = cue;
  const rate = Math.max(22, text.length / ((b - a) * 0.55));
  const n = Math.min(text.length, Math.floor((t - a) * rate) + 1);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, opacity: fade }}>
      <text x={W / 2} y={SUB_Y} textAnchor="middle" fontFamily={FONT_PEN} fontSize={text.length > 34 ? 25 : 28} fontWeight={700} fill="#fffaf0" stroke="#241c45" strokeWidth={6} strokeLinejoin="round" style={{ paintOrder: "stroke" }}>
        <tspan>{text.slice(0, n)}</tspan>
        <tspan fill="none" stroke="none">{text.slice(n)}</tspan>
      </text>
    </svg>
  );
};
/** 「仮」の札 */
const Kari: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ position: "absolute", left: 16, top: 14, maxWidth: 236, display: "flex", alignItems: "flex-start", gap: 8, background: "#fff7d6", border: "3px solid #c0392b", borderRadius: 10, padding: "6px 10px", fontFamily: FONT_JP, fontSize: 17, fontWeight: 700, color: "#8e1f16", lineHeight: 1.3 }}>
    <span style={{ background: "#c0392b", color: "#fff", borderRadius: 6, padding: "0 7px", flexShrink: 0 }}>仮</span>
    {text}
  </div>
);
const Draft: React.FC = () => <div style={{ position: "absolute", right: 16, top: 12, fontFamily: FONT_JP, fontSize: 15, color: "#fff", background: "rgba(0,0,0,0.45)", borderRadius: 6, padding: "2px 10px" }}>通しの仮版 v3</div>;

// ---- 画面の置き場（0:13 から 3:00 まで変えない） ----
const WIN = { x: W / 2 - FRAME.w / 2 + FRAME.inset, y: FRAME.cy - FRAME.h / 2 + FRAME.inset, w: FRAME.w - FRAME.inset * 2, h: FRAME.h - FRAME.inset * 2 };
const GROUND = 676;
const CH = 136;
const PULL = 0.4;
const PAPER = "#fffdf6";

// ---- 枠の中の紙 ----
const Paper: React.FC<{ children?: React.ReactNode; wobble?: boolean }> = ({ children, wobble = true }) => (
  <svg width={WIN.w} height={WIN.h} viewBox={`0 0 ${WIN.w} ${WIN.h}`} style={{ position: "absolute", inset: 0 }}>
    <rect width={WIN.w} height={WIN.h} fill={PAPER} filter="url(#brush-paper)" />
    <g filter={wobble ? "url(#wobble)" : undefined}>{children}</g>
  </svg>
);
/** 1 字ずつ書く見出し */
const Written: React.FC<{ text: string; p: number; x: number; y: number; size?: number; color?: string }> = ({ text, p, x, y, size = 40, color = INK }) => {
  const n = Math.ceil(text.length * p);
  return (
    <text x={x} y={y} textAnchor="middle" fontFamily={FONT_PEN} fontSize={size} fontWeight={700} fill={color}>
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
      <text y={9} textAnchor="middle" fontFamily={FONT_PEN} fontSize={24} fontWeight={700} fill="#c0392b">{text}</text>
    </g>
  );
};
const draw = (p: number) => ({ pathLength: 1, strokeDasharray: `${p} 1` });
/** 斜線（塗りの代わり）。clip の中に引く */
const Hatch: React.FC<{ id: string; p: number; clip: React.ReactNode }> = ({ id, p, clip }) => (
  <>
    <clipPath id={id}>{clip}</clipPath>
    <g clipPath={`url(#${id})`} stroke="#8a7a60" strokeWidth={2.5} opacity={0.7}>
      {Array.from({ length: Math.floor(48 * p) }, (_, i) => <path key={i} d={`M${i * 18 - 120} 360L${i * 18 + 80} 0`} />)}
    </g>
  </>
);

/** ヒアリングの 5 枚（見出しを 1 字ずつ → 線画 → 斜線 → 赤い判） */
const HEAR = ["電気の業界", "工事", "危ないもの", "朝礼と貼り紙", "焼けた作業服"];
const HearSheet: React.FC<{ i: number; lt: number }> = ({ i, lt }) => {
  const head = prog(lt, 0.1, 0.7);
  const line = prog(lt, 0.8, 0.7);
  const hatch = prog(lt, 1.5, 0.6);
  const stamp = prog(lt, 2.3, 0.25);
  const ink = { fill: "none", stroke: INK, strokeWidth: 4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  let pic: React.ReactNode = null;
  if (i === 0) {
    pic = (
      <g>
        <Hatch id="h0" p={hatch} clip={<path d="M0 330Q200 300 330 320T660 310V350H0Z" />} />
        {[150, 330, 510].map((x, j) => <path key={x} d={`M${x} 320V${110 + j * 6}M${x - 50} ${128 + j * 6}H${x + 50}`} {...ink} {...draw(line)} />)}
        {[-34, 0, 34].map((dx) => <path key={dx} d={`M${150 + dx} 128Q${240 + dx} 165 ${330 + dx} 134Q${420 + dx} 170 ${510 + dx} 140`} {...ink} strokeWidth={2.5} {...draw(line)} />)}
        <path d="M600 90L570 160H600L580 230L640 140H608L630 90Z" fill={hatch > 0 ? "#ffd24a" : "none"} stroke={INK} strokeWidth={4} {...draw(line)} />
      </g>
    );
  } else if (i === 1) {
    pic = (
      <g>
        <Hatch id="h1" p={hatch} clip={<rect x={360} y={110} width={220} height={210} />} />
        <path d="M360 320V110H580V320M360 180H580M360 250H580M420 110V320" {...ink} {...draw(line)} />
        <path d="M200 320L250 110M260 320L310 110M206 296H264M216 254H274M226 212H284M236 170H294M246 128H304" {...ink} {...draw(line)} />
        <path d="M380 150Q470 120 470 200T560 280" {...ink} strokeWidth={3} stroke="#c0392b" {...draw(line)} />
        <path d="M100 280l40 -40m-46 34a10 10 0 1 1 12 12" {...ink} {...draw(line)} />
      </g>
    );
  } else if (i === 2) {
    pic = (
      <g>
        {[130, 330, 530].map((x, j) => (
          <g key={x}>
            <Hatch id={`h2${j}`} p={hatch} clip={<path d={`M${x} 120L${x + 90} 290H${x - 90}Z`} />} />
            <path d={`M${x} 120L${x + 90} 290H${x - 90}Z`} {...ink} strokeWidth={6} stroke="#c0392b" {...draw(line)} />
          </g>
        ))}
        <path d="M136 175L116 225H136L124 268L152 212H134L148 175Z" fill={INK} opacity={line} />
        <path d="M310 270L350 190M330 270L372 196M316 252H342M326 230H352" {...ink} opacity={line} />
        <path d="M530 270C500 250 515 225 530 205C530 230 550 225 545 200C565 225 565 255 530 270Z" fill={INK} opacity={line} />
      </g>
    );
  } else {
    const src = i === 3 ? "poster.png" : "jacket.png";
    pic = (
      <g>
        <rect x={180} y={92} width={300} height={232} fill="none" stroke={INK} strokeWidth={4} {...draw(line)} />
        <image href={staticFile(src)} x={184} y={96} width={292} height={224} preserveAspectRatio="xMidYMid meet" opacity={hatch} />
      </g>
    );
  }
  return (
    <Paper>
      <Written text={HEAR[i]} p={head} x={WIN.w / 2} y={64} size={42} />
      {pic}
      <Stamp p={stamp} x={590} y={290} text="聞いた" />
    </Paper>
  );
};
/** なぜ作ったか: 数が数え上がる */
const WhySheet: React.FC<{ lt: number }> = ({ lt }) => {
  const a = Math.round(interpolate(lt, [0.5, 2.5], [0, 257], { ...clamp, easing: Easing.out(Easing.cubic) }));
  const b = Math.round(interpolate(lt, [3.0, 5.0], [0, 61], { ...clamp, easing: Easing.out(Easing.cubic) }));
  return (
    <Paper wobble={false}>
      <Written text="日本で働く外国人" p={prog(lt, 0, 0.5)} x={WIN.w / 2} y={74} size={34} />
      <text x={WIN.w / 2} y={150} textAnchor="middle" fontFamily={FONT_PEN} fontSize={70} fontWeight={700} fill={INK} opacity={prog(lt, 0.5, 0.2)}>約 {a} 万人</text>
      <Written text="うちベトナム" p={prog(lt, 2.5, 0.5)} x={WIN.w / 2} y={214} size={30} />
      <text x={WIN.w / 2} y={282} textAnchor="middle" fontFamily={FONT_PEN} fontSize={60} fontWeight={700} fill="#c0392b" opacity={prog(lt, 3.0, 0.2)}>約 {b} 万人</text>
      <text x={WIN.w / 2} y={330} textAnchor="middle" fontFamily={FONT_JP} fontSize={13} fill="#555" opacity={prog(lt, 5.2, 0.4)}>厚生労働省「外国人雇用状況」の届出状況まとめ（令和 7 年 10 月末）。数を丸めた</text>
    </Paper>
  );
};
/** 見出しだけの白い紙（録画の前に 1 秒） */
const HeadSheet: React.FC<{ text: string; lt: number }> = ({ text, lt }) => (
  <Paper>
    <Written text={text} p={prog(lt, 0.05, 0.55)} x={WIN.w / 2} y={WIN.h / 2 + 16} size={52} />
  </Paper>
);
const KariSheet: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_JP, fontSize: 27, fontWeight: 700, color: INK, textAlign: "center", padding: 30, background: "repeating-linear-gradient(45deg,#fbf3dc 0 22px,#f3e8c8 22px 44px)" }}>
    <span style={{ background: "#c0392b", color: "#fff", borderRadius: 8, padding: "2px 12px", marginRight: 14 }}>仮</span>
    {text}
  </div>
);

/** 録画を枠の中いっぱいに流す。足りなければ遅くし（半分の速さまで）、それでも足りなければ最後のコマで止める */
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
        <svg width={WIN.w} height={WIN.h} style={{ position: "absolute", inset: 0 }}>
          <Stamp p={interpolate(f, [total - sec(0.9), total - sec(0.6)], [0, 1], clamp)} x={WIN.w - 70} y={WIN.h - 70} text="署名" />
        </svg>
      )}
    </div>
  );
};
// 機能の場面の録画（runs-video。dur は使う長さの秒、from は使い始めの秒）。どの場面も頭の 1 秒は見出しの紙
const CLIPS: Record<string, ClipPart[]> = {
  "f-fold": [{ src: "fold.mp4", dur: 6.04, slot: 7 }],
  "f-card": [{ src: "card.mp4", dur: 4.92, slot: 6 }],
  "f-check": [{ src: "danger.mp4", dur: 1.28, slot: 2 }, { src: "queue.mp4", dur: 10.6, from: 2.5, slot: 4 }], // 確認待ちの録画は頭の約 2 秒が白い画面
  // 経路の録画は、最後にスマホの幅に切り替えて確かめる所（1.95 秒から）を使わない
  "f-route": [{ src: "route.mp4", dur: 1.95, slot: 5 }],
  // 直す所の録画は、頭の約 1 秒が読み込み中の白い画面なので 1 秒から使う
  "f-sign": [{ src: "fix.mp4", dur: 3.84, from: 1, slot: 3 }, { src: "sign.mp4", dur: 2.4, slot: 2 }, { src: "read.mp4", dur: 1.2, slot: 1 }],
};
const HEADS: Record<string, string> = { "f-fold": "折りたたむ", "f-card": "形が崩れない理由", "f-check": "確かめる AI", "f-route": "元の文に戻る", "f-sign": "直して署名", "f-notrans": "翻訳を入れない" };

/** 40 業種のカードが 0.22 秒に 1 枚ずつ開く（扇のように広がる）。t は冒頭からの秒 */
const IndustriesPic: React.FC<{ t: number }> = ({ t }) => {
  const cols = 10;
  const cw = 62;
  const ch = 78;
  return (
    <>
      <rect width={WIN.w} height={WIN.h} fill={PAPER} filter="url(#brush-paper)" />
      {INDUSTRY_DRAFTS.slice(0, 40).map((d, i) => {
        const p = prog(t, 165.3 + i * 0.22, 0.35);
        if (p <= 0) return null;
        const ex = 20 + (i % cols) * (cw + 2) + cw / 2;
        const ey = 14 + Math.floor(i / cols) * (ch + 6) + ch / 2;
        const x = interpolate(p, [0, 1], [WIN.w / 2, ex]);
        const y = interpolate(p, [0, 1], [WIN.h + 40, ey]) - Math.sin(p * Math.PI) * 30;
        const rot = interpolate(p, [0, 1], [((i % cols) - 4.5) * 9, (i % 2 ? 1 : -1) * 2]);
        const r = d.roles[0];
        const fig = characterSvg({ angles: POSES.stand, x: 0, groundY: 0, height: 50, facing: "right", view: "front", role: r.role, headwear: r.headwear, outfit: r.outfit });
        return (
          <g key={d.id} transform={`translate(${x} ${y}) rotate(${rot})`}>
            <rect x={-cw / 2} y={-ch / 2} width={cw} height={ch} rx={6} fill="#fff" stroke="#b9ad8f" strokeWidth={2} />
            <g transform={`translate(0 ${ch / 2 - 20})`} dangerouslySetInnerHTML={{ __html: fig }} />
            <text y={ch / 2 - 6} textAnchor="middle" fontFamily={FONT_JP} fontSize={10} fontWeight={700} fill={INK}>{d.name.length > 6 ? `${d.name.slice(0, 6)}…` : d.name}</text>
          </g>
        );
      })}
    </>
  );
};

// ---- 枠の中の紙の並び（紙芝居の抜き: 前の紙を右へ抜くと、次の紙が見える） ----
interface Sheet { from: number; to: number; body: (lt: number, t: number) => React.ReactNode; noPull?: boolean }
const SHEETS: Sheet[] = (() => {
  const s: Sheet[] = [];
  s.push({ from: 17, to: 17, body: () => (<svg width={WIN.w} height={WIN.h} viewBox={`0 0 ${WIN.w} ${WIN.h}`}><TitlePaper iw={WIN.w} ih={WIN.h} /></svg>) });
  s.push({ from: 17, to: 52, body: (_lt, t) => (
    <svg width={WIN.w} height={WIN.h} viewBox={`0 0 ${WIN.w} ${WIN.h}`} style={{ position: "absolute", inset: 0 }}>
      <rect width={WIN.w} height={WIN.h} fill={PAPER} filter="url(#brush-paper)" />
      <g filter="url(#wobble)"><StoryStrip t={t} f={Math.round(t * FPS)} /></g>
    </svg>
  ) });
  HEAR.forEach((_, i) => s.push({ from: 52 + i * 3.2, to: 52 + (i + 1) * 3.2, body: (lt) => <HearSheet i={i} lt={lt} /> }));
  s.push({ from: 68, to: 76, body: (lt) => <WhySheet lt={lt} /> });
  for (const seg of SEGS.filter((g) => g.id.startsWith("f-"))) {
    s.push({ from: seg.at, to: seg.at + 1, body: (lt) => <HeadSheet text={HEADS[seg.id]} lt={lt} /> });
    const clip = CLIPS[seg.id];
    s.push({ from: seg.at + 1, to: seg.at + seg.len, body: () => (clip ? <Clips parts={clip} stamp={seg.id === "f-sign"} /> : <KariSheet text={seg.kari ?? ""} />) });
  }
  s.push({ from: 116, to: 140, body: () => <KariSheet text="試したところ（11/6 に撮る）" /> });
  s.push({ from: 140, to: 165, body: () => <KariSheet text="職人さんと監修者の言葉（11/6 に撮る・同意が先）" /> });
  s.push({ from: 165, to: 175, noPull: true, body: (_lt, t) => (<svg width={WIN.w} height={WIN.h} viewBox={`0 0 ${WIN.w} ${WIN.h}`}><IndustriesPic t={t} /></svg>) });
  return s;
})();
const SheetSlot: React.FC<{ sheet: Sheet }> = ({ sheet }) => {
  const f = useCurrentFrame();
  const lt = f / FPS;
  const t = sheet.from + lt;
  const len = sheet.to - sheet.from;
  const out = sheet.noPull ? 0 : interpolate(lt, [len, len + PULL], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translateX(${out * 104}%) rotate(${out * 2}deg)`, boxShadow: out > 0 ? "-8px 0 14px rgba(0,0,0,0.35)" : undefined, overflow: "hidden" }}>
      {sheet.body(lt, t)}
    </div>
  );
};

// ---- 床の人たち ----
const SPREAD = { ...POSES.stand, arm_near_upper: 140, arm_near_lower: 10, arm_far_upper: -140, arm_far_lower: -10, leg_near_upper: 28, leg_far_upper: -28 } as Angles;
/** 主人公（リュックを背負い、一番上に赤い相棒） */
const Hero: React.FC<{ x: number; ground: number; h: number; angles: Angles; facing?: "left" | "right"; hop?: number; blink?: boolean; look?: number }> = ({ x, ground, h, angles, facing = "right", hop = 0, blink, look = 0 }) => {
  const px = x + (facing === "right" ? -1 : 1) * h * 0.2;
  return (
    <g>
      <g transform={`translate(${px} ${ground}) scale(${h / 170})`}><BigPack h={170} /></g>
      <g dangerouslySetInnerHTML={{ __html: picto({ angles, x, ground, h, facing }) }} />
      <Clawd x={px} y={ground - h * 0.95 - hop} s={h * 0.24} blink={blink} look={look} />
    </g>
  );
};
const GUIDE_OUTFIT = { ...INDUSTRY_DRAFTS[0].roles[1].outfit, toolBelt: true };
const CRAFT_OUTFIT = INDUSTRY_DRAFTS[0].roles[0].outfit;
/** 電気工事の案内人（白いヘルメットの前に小さなライト・長袖の作業服・腰の道具・安全靴・電球の杖・うっすら金色のふち）。rev は下から組み上がる割合 */
const Guide: React.FC<{ x: number; ground: number; h: number; angles: Angles; facing: "left" | "right"; rev?: number; f: number }> = ({ x, ground, h, angles, facing, rev = 1.2, f }) => {
  const dir = facing === "right" ? 1 : -1;
  const sx = x + dir * h * 0.32;
  return (
    <g>
      <clipPath id="guide-rev"><rect x={x - h} y={ground - h * rev} width={h * 2} height={h * rev + 4} /></clipPath>
      <g clipPath="url(#guide-rev)" style={{ filter: "drop-shadow(0 0 5px rgba(255,214,110,0.95))" }}>
        <line x1={sx} y1={ground} x2={sx} y2={ground - h * 0.92} stroke="#8a5a1e" strokeWidth={Math.max(3, h * 0.028)} strokeLinecap="round" />
        <g dangerouslySetInnerHTML={{ __html: characterSvg({ angles, x, groundY: ground, height: h, facing, view: "quarter", role: "new", headwear: "helmet", outfit: GUIDE_OUTFIT }) }} />
        <circle cx={x + dir * h * 0.16} cy={ground - h * 0.9} r={h * 0.03} fill="#fff59a" stroke="#555" strokeWidth={1.5} />
        <Bulb x={sx} y={ground - h * 1.02} s={h / 300} lit={1} f={f} />
      </g>
    </g>
  );
};
/** 職人さん（黄色いヘルメット・年上でがっしり） */
const Craftsman: React.FC<{ x: number; ground: number; h: number; angles: Angles; facing: "left" | "right"; k?: number }> = ({ x, ground, h, angles, facing, k = 1 }) => {
  const svg = characterSvg({ angles, x: 0, groundY: 0, height: h, facing, view: "quarter", role: "worker", headwear: "helmet", outfit: CRAFT_OUTFIT }).split('fill="#999"').join('fill="#f2c230"');
  return <g transform={`translate(${x} ${ground}) scale(${1.16 * k} ${k})`} dangerouslySetInnerHTML={{ __html: svg }} />;
};
const PicBubble: React.FC<{ x: number; y: number; o: number; children: React.ReactNode; tail: "left" | "right" }> = ({ x, y, o, children, tail }) => {
  if (o <= 0) return null;
  const tx = tail === "right" ? 46 : -46;
  return (
    <g transform={`translate(${x} ${y}) scale(${0.6 + o * 0.4})`} opacity={o}>
      <path d={`M-70 -40H70V30H${tx + 10}L${tx + (tail === "right" ? 34 : -34)} 52L${tx - 10} 30H-70Z`} fill="#fff" stroke={INK} strokeWidth={3.5} strokeLinejoin="round" />
      {children}
      <rect x={-64} y={-34} width={26} height={22} rx={4} fill="#c0392b" />
      <text x={-51} y={-17} textAnchor="middle" fontFamily={FONT_JP} fontSize={14} fontWeight={700} fill="#fff">仮</text>
    </g>
  );
};

const HERO_X = 230;
const GUIDE_DX = 96;
const FloorActors: React.FC<{ t: number; f: number }> = ({ t, f }) => {
  if (t < 42.5) return null;
  const h = interpolate(t, [75.6, 76.2, 115.6, 116.2], [CH, 98, 98, CH], clamp);
  const gx = HERO_X + GUIDE_DX * (h / CH);
  const walking = t >= 52 && t < 58;
  const blink = t % 3.1 < 0.1;
  // 放り出される（0:42.5〜0:47.5）→ 座る → 0:51 に立つ
  let heroNode: React.ReactNode;
  if (t < 44.0) {
    const p = interpolate(t, [42.5, 43.5], [0, 1], clamp);
    const roll = interpolate(t, [43.5, 44.0], [0, 1], clamp);
    const x = interpolate(p, [0, 1], [-110, 190]) + roll * 50;
    const y = GROUND - Math.sin(p * Math.PI) * 170;
    const rot = 360 * p + 360 * roll;
    heroNode = (
      <g transform={`rotate(${rot} ${x} ${y - h * 0.5})`}>
        <Hero x={x} ground={y} h={h} angles={POSES.fall} />
      </g>
    );
  } else if (t < 45.0) {
    heroNode = (
      <g transform={`rotate(-90 ${HERO_X + 10} ${GROUND - 18})`}>
        <Hero x={HERO_X + 10} ground={GROUND - 18 + h * 0.22} h={h} angles={SPREAD} blink />
      </g>
    );
  } else if (t < 51.0) {
    const shake = t < 45.6 ? Math.sin(((t - 45) / 0.6) * Math.PI * 4) * 6 : 0;
    heroNode = (
      <g transform={`rotate(${shake} ${HERO_X} ${GROUND - h * 0.3})`}>
        <Hero x={HERO_X} ground={GROUND} h={h} angles={POSES.sit} blink={blink} />
      </g>
    );
  } else {
    const angles = walking ? gait("walk", t / 0.55) : t >= 68 && t < 116 ? POSES.look_up : t >= 170 && t < 172.5 ? mixAngles(POSES.stand, POSES.wave, 0.6 + 0.4 * Math.sin(t * 9)) : POSES.stand;
    const bump = (a: number, d: number) => (t >= a && t < a + d ? Math.sin(((t - a) / d) * Math.PI) : 0);
    const hop = bump(51.5, 0.4) + bump(170.5, 0.5) + bump(171.2, 0.5);
    heroNode = <Hero x={HERO_X} ground={GROUND} h={h} angles={angles} hop={hop * h * 0.3} blink={blink} look={walking ? 1 : 0} />;
  }
  // 光（画面の左の外から、床の高さ）と粒
  const lightO = interpolate(t, [42.5, 42.8, 45.5, 46.5], [0, 1, 1, 0], clamp);
  const rev = interpolate(t, [47.5, 48.0, 48.5, 49.0, 49.5, 49.9], [0, 0.14, 0.46, 0.76, 0.96, 1.2], clamp);
  const flash = t >= 50 && t < 50.6 ? (t - 50) / 0.6 : 0;
  const gAngles = t >= 50.5 && t < 51.0 ? POSES.wave : walking ? gait("walk", t / 0.6 + 0.3) : t >= 68 && t < 116 ? POSES.look_up : t >= 170.2 && t < 172.5 ? mixAngles(POSES.stand, POSES.wave, 0.6 + 0.4 * Math.sin(t * 9 + 1)) : POSES.stand;
  // 職人さん: 0:58 に右から来て話し、1:08 に右へ帰る。2:20 にまた来て、一歩前へ出る
  const cx = interpolate(t, [58, 60, 68, 70, 140, 142, 142.5, 143], [1400, 960, 960, 1420, 1420, 920, 920, 880], clamp);
  const ck = interpolate(t, [142.5, 143], [1, 1.1], clamp);
  const cOn = (t >= 58 && t < 70) || t >= 140;
  const cWalk = (t >= 58 && t < 60) || (t >= 68 && t < 70) || (t >= 140 && t < 142) || (t >= 142.5 && t < 143);
  const cFacing: "left" | "right" = t >= 68 && t < 70 ? "right" : "left";
  const bub = (a: number, b: number) => interpolate(t, [a, a + 0.3, b - 0.3, b], [0, 1, 1, 0], clamp);
  return (
    <g>
      {/* 歩く間（0:52〜0:58）、床の線が左へ流れる */}
      {t >= 51.5 && t < 58.5 && [600, 640, 690].map((y, i) => (
        <path key={y} d={`M0 ${y}H${W}`} stroke="#5a4f96" strokeWidth={3 + i} strokeDasharray={`${60 + i * 30} ${90 + i * 20}`} strokeDashoffset={Math.min(6, Math.max(0, t - 52)) * (180 + i * 40)} opacity={0.8} />
      ))}
      {lightO > 0 && <Light id="throwl" x={-40} y={GROUND - 50} r={340} opacity={lightO} />}
      {t < 49.9 &&
        Array.from({ length: 48 }, (_, i) => {
          const fx = -30 + ((i * 61 + (t - 42.5) * (t < 46.5 ? 300 : 60)) % 560);
          const fy = GROUND - 14 - ((i * 37) % 170) + Math.sin(t * 3 + i) * 6;
          // 0:47.5 から下から順に案内人の所へ集まる
          const ty = GROUND - ((i % 12) / 12) * h * 1.1;
          const gp = interpolate(t, [47.5 + (i % 12) * 0.18, 47.9 + (i % 12) * 0.18], [0, 1], clamp);
          const x = fx + (gx + Math.cos(i) * 22 - fx) * gp;
          const y = fy + (ty - fy) * gp;
          const o = interpolate(t, [42.6, 43.0], [0, 1], clamp) * (gp >= 1 ? 0 : 1);
          return <circle key={i} cx={x} cy={y} r={2.4 + (i % 3)} fill="#ffe38a" opacity={o * (0.6 + 0.4 * Math.sin(f / 3 + i))} />;
        })}
      {t >= 43.9 && <ellipse cx={HERO_X} cy={GROUND + 4} rx={h * 0.34} ry={6} fill="#000" opacity={0.2} />}
      {rev > 0 && <ellipse cx={gx} cy={GROUND + 4} rx={h * 0.3} ry={6} fill="#000" opacity={0.2} />}
      {rev > 0 && <Guide x={gx} ground={GROUND} h={h} angles={gAngles} facing="right" rev={rev} f={f} />}
      {flash > 0 && <ellipse cx={gx} cy={GROUND - h * 0.5} rx={h * (0.3 + flash * 0.9)} ry={h * (0.55 + flash * 0.5)} fill="none" stroke="#fff3b0" strokeWidth={6 * (1 - flash)} opacity={1 - flash} />}
      {cOn && <Craftsman x={cx} ground={GROUND} h={h} angles={cWalk ? gait("walk", t / 0.62) : POSES.stand} facing={cFacing} k={ck} />}
      {heroNode}
      {/* 絵の吹き出し（仮） */}
      <PicBubble x={cx - 150} y={GROUND - h * 0.78} o={bub(60.3, 63.8)} tail="right">
        <rect x={-26} y={-26} width={40} height={50} fill="#fffdf6" stroke={INK} strokeWidth={2.5} />
        {[0, 1, 2].map((r) => <path key={r} d={`M-20 ${-16 + r * 12}h28`} stroke="#999" strokeWidth={3} />)}
        <text x={36} y={12} textAnchor="middle" fontFamily={FONT_PEN} fontSize={34} fontWeight={700} fill="#c0392b">?</text>
      </PicBubble>
      <PicBubble x={HERO_X + 150} y={GROUND - h * 0.78} o={bub(64.2, 67.8)} tail="left">
        <text x={10} y={10} textAnchor="middle" fontFamily={FONT_PEN} fontSize={30} fill={INK}>…!</text>
      </PicBubble>
    </g>
  );
};

/** 0:17 から 3:00 まで変わらない舞台 */
const Stage: React.FC = () => {
  const f = useCurrentFrame();
  const g = f + TOTAL;
  const t = g / FPS;
  const seg = [...SEGS].reverse().find((s) => t >= s.at) ?? SEGS[0];
  const doors = interpolate(t, [175, 176], [1, 0], { ...clamp, easing: ease });
  const back = interpolate(t, [177.5, 178.5], [0, 1], { ...clamp, easing: ease });
  const sk = 1 - back * 0.64;
  const stageO = 1 - back;
  const endPhase = t >= 175;
  const write = prog(t, 178.5, 1.3);
  const MEDE = "めでたし、めでたし。";
  return (
    <AbsoluteFill style={{ background: "#efe6d6" }}>
      {/* 机の上（カメラが引くと見える） */}
      {back > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
          <rect width={W} height={H} fill="#efe6d6" />
          <rect y={402} width={W} height={H - 402} fill="#a87a4e" />
          <rect y={402} width={W} height={8} fill="#7c5634" />
        </svg>
      )}
      <div style={{ position: "absolute", inset: 0, transformOrigin: `640px ${FRAME.cy}px`, transform: `translateY(${back * 8}px) scale(${sk})` }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
          <WobbleDefs />
          <g opacity={stageO}>
            <rect width={W} height={H} fill={PURPLE} />
            <rect y={FLOOR_Y} width={W} height={H - FLOOR_Y} fill={FLOOR} />
          </g>
          <StageFrame cx={W / 2} open={1} />
        </svg>
        {/* 枠の窓 */}
        {!endPhase && (
          <div style={{ position: "absolute", left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h, overflow: "hidden", background: "#2a1b0e" }}>
            {[...SHEETS].reverse().map((s, i) => (
              <Sequence key={i} from={sec(s.from) - TOTAL} durationInFrames={Math.max(1, sec(s.to - s.from) + (s.noPull ? 0 : sec(PULL)))} layout="none">
                <SheetSlot sheet={s} />
              </Sequence>
            ))}
          </div>
        )}
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
          {endPhase && (
            <StageFrame cx={W / 2} open={doors}>
              <IndustriesPic t={t} />
            </StageFrame>
          )}
          <g opacity={stageO}>
            <LightRings o={1} />
            {stageLights(t).map((l, i) => <Light key={i} id={`stl${i}`} x={l.x} y={l.y} r={l.r} opacity={l.o} />)}
            <FloorActors t={t} f={f} />
          </g>
        </svg>
      </div>
      {/* 鉛筆で「めでたし、めでたし。」 */}
      {write > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
          <BrushPaper x={400} y={470} w={480} h={150} rot={-2} />
          <Written text={MEDE} p={write} x={640} y={562} size={50} />
          {write < 1 && (
            <g transform={`translate(${470 + write * 340} 548) rotate(30)`}>
              <rect x={-7} y={-110} width={14} height={100} rx={3} fill="#e8b83a" stroke="#6b4a12" strokeWidth={2} />
              <path d="M-7 -10L0 8L7 -10Z" fill="#f2d7a8" stroke="#6b4a12" strokeWidth={2} />
              <path d="M-2 2L0 8L2 2Z" fill="#333" />
            </g>
          )}
        </svg>
      )}
      {seg.kari && t < 175 && <Kari text={seg.kari} />}
    </AbsoluteFill>
  );
};

/** 冒頭（0:00〜0:17）は冒頭の 8 場面をそのまま並べる */
const Opening: React.FC = () => (
  <>
    {SCENES.map((s) => {
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
  return <Subtitle t={t} fade={1 - prog(t, 177.5, 0.6)} />;
};

export const Full: React.FC<FullProps> = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Sequence durationInFrames={TOTAL} name="冒頭">
      <Opening />
    </Sequence>
    <Sequence from={TOTAL} durationInFrames={FULL_FRAMES - TOTAL} name="舞台">
      <Stage />
    </Sequence>
    <Subtitles />
    <Draft />
  </AbsoluteFill>
);

/** 場面の一覧（場面ごとの真ん中のコマの静止画を並べ、時刻と場面名を付ける。静止画は render-full.mjs が先に書き出す） */
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}${s % 1 ? ".5" : ""}`;
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
