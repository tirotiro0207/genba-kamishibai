// 3 分の通しの仮版 v2（11/5 夜 作者の指示: 「ポータルは紙芝居の中で発生していて、シーン変わらない」）。
// 0:13 で枠が置かれてから 3:00 まで、画面はずっと「上に大きな紙芝居の木の枠、下に床」のまま。替えるのは枠の中の絵だけ（横へ抜く）。
// 冒険とポータルは枠の中の絵で起き、主人公と赤い相棒は枠の中から床へ転がり出る。床のキャラは画面の高さの約 2 割。
// 素材の無い場面は「仮」の札を付けた置き場の絵で埋める。語りは字幕で画面の下に出す（音なし）。
// 動画・画像は書き出しのときに git の外から写して読む（render-full.mjs）。数や写真は、本物がそろうまで出さない
import React from "react";
import { AbsoluteFill, Easing, Freeze, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { characterSvg } from "../../src/shared/picto/character";
import { INDUSTRY_DRAFTS } from "../../src/shared/picto/industry-drafts";
import { type Angles, POSES, poseAngles, stickJoints } from "../../src/shared/picto/poses";
import { gait, mixAngles } from "./paper";
import { FLOOR, FLOOR_Y, FONT_JP, FRAME, Light, StageFrame, WobbleDefs } from "./parts";
import { GLOW, GLOW_LIGHT, Mark } from "./portal";
import { SCENE_COMPONENTS, TitlePaper } from "./scenes";
import { FPS, H, INK, PURPLE, SCENES, startOf, TOTAL, W } from "./timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const sec = (s: number) => Math.round(s * FPS);
const ease = Easing.inOut(Easing.quad);

// ---- 場面の表（秒は台本 v2。冒頭は 0:00〜0:17、むかしむかしは 8 秒） ----
export interface Seg { id: string; title: string; at: number; len: number; caption?: string; note?: string; kari?: string }
export const SEGS: Seg[] = [
  { id: "opening", title: "冒頭（時計・折り紙・名のり・枠・開演・題）", at: 0, len: 17 },
  { id: "story", title: "むかしむかし（作者の生い立ち）", at: 17, len: 8, kari: "作者の手書きの絵が入る", caption: "むかしむかし、日本人のお父さんとベトナム人のお母さんの家に、男の子がいました。|日本語が分からなくても、ポケモン リーフグリーンは最後までクリアできました。" },
  { id: "uiux", title: "よい UI・UX は、ことばを越える", at: 25, len: 3, caption: "よい UI・UX は、ことばを越える。" },
  { id: "skills", title: "絵の中: スキルの巻物と赤い相棒・ポータル", at: 28, len: 6, caption: "スキルの巻物をカバンに詰めて、赤い相棒と冒険へ。|行き先は、電気業界。" },
  { id: "warp", title: "吸い込まれて、床へ転がり出る", at: 34, len: 3 },
  { id: "guide", title: "光の粒が集まって案内人", at: 37, len: 5, caption: "光の粒が集まり、金色の案内人が現れました。" },
  { id: "hearing", title: "ヒアリング（床で職人さんと話す）", at: 42, len: 20, kari: "ヒアリングの中身が入る", caption: "案内人と、現場の職人さんに話を聞きました。|電気の現場の安全の決まりは、文字の資料と貼り紙で回っています。|文字が読めなければ、決まりは届きません。届かなかった決まりは、けがになります。|（聞いたことのまとめが入る）", note: "|日本で働く外国人 約 257 万人、うちベトナム 約 61 万人（厚生労働省「外国人雇用状況」の届出状況まとめ、令和 7 年 10 月末。数を丸めた）||" },
  { id: "why", title: "なぜ作ったか", at: 62, len: 10, kari: "作者の言葉が入る", caption: "（なぜ作ったか: 作者の言葉が入る）" },
  { id: "f-fold", title: "機能: 折りたたむ", at: 72, len: 8, caption: "何ページもの資料が、1 枚・0 字のカードにたたまれます。" },
  { id: "f-card", title: "機能: 形が崩れない理由", at: 80, len: 7, caption: "絵は Claude が数で書き、アプリが描きます。だから形が崩れません。" },
  { id: "f-check", title: "機能: 確かめる AI", at: 87, len: 7, caption: "別の Claude が、絵だけを見て読みます。伝わらなければ赤です。" },
  { id: "f-route", title: "機能: 広げて元の文に戻る", at: 94, len: 7, caption: "絵の部品をタップすると、元の文に戻れます。" },
  { id: "f-sign", title: "機能: 人が直して署名", at: 101, len: 9, caption: "監修者が直したいところを枠で囲み、直ったら署名します。|署名したカードだけが、新入社員に届きます。" },
  { id: "f-notrans", title: "機能: 翻訳を入れない", at: 110, len: 5, kari: "この機能の画面が入る", caption: "（翻訳を入れない理由が入る）" },
  { id: "trial", title: "試したところ", at: 115, len: 25, kari: "11/6 に撮る（当日の手元と画面・時計 2 つ。数は出さない）", caption: "（試したところ: 11/6 に撮る）" },
  { id: "voice", title: "現場の声", at: 140, len: 25, kari: "11/6 に撮る・同意が先", caption: "（現場の声: 11/6 に撮る。同意が先）" },
  { id: "industries", title: "40 業種の紙が業種のカードに", at: 165, len: 10, caption: "電気から始めて、40 の業種へ。" },
  { id: "end", title: "めでたしめでたし", at: 175, len: 5, caption: "外国から来た新人にも、日本人の新人にも。めでたし、めでたし。" },
];
export const FULL_FRAMES = sec(180);
export interface FullProps { [key: string]: unknown; /** ポータルの真ん中の印（data URL）。無ければ一般的な印 */ mark?: string }

// ---- 画面の置き場（0:13 から 3:00 まで変えない） ----
/** 枠の窓（絵が入る所） */
const WIN = { x: W / 2 - FRAME.w / 2 + FRAME.inset, y: FRAME.cy - FRAME.h / 2 + FRAME.inset, w: FRAME.w - FRAME.inset * 2, h: FRAME.h - FRAME.inset * 2 };
/** 床のキャラの足元と背の高さ（画面の高さの約 2 割） */
const GROUND = 636;
const CH = 144;
const SUB_Y = 652;
const SLIDE = 12;

// ---- 共通の部品 ----
/** 字幕（画面の下）。「|」で区切ると、場面の長さを等分して順に出す */
const Subtitle: React.FC<{ seg: Seg; f: number }> = ({ seg, f }) => {
  if (!seg.caption) return null;
  const parts = seg.caption.split("|");
  const notes = (seg.note ?? "").split("|");
  const i = Math.min(parts.length - 1, Math.floor((f / sec(seg.len)) * parts.length));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: SUB_Y, height: H - SUB_Y, background: "rgba(20,16,40,0.78)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", fontFamily: FONT_JP, color: "#fff", padding: "0 40px" }}>
      <div style={{ fontSize: 26, fontWeight: 700, textAlign: "center", lineHeight: 1.25 }}>{parts[i]}</div>
      {notes[i] && <div style={{ fontSize: 14, opacity: 0.85, marginTop: 1, textAlign: "center" }}>{notes[i]}</div>}
    </div>
  );
};
/** 「仮」の札 */
const Kari: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ position: "absolute", left: 16, top: 14, maxWidth: 236, display: "flex", alignItems: "flex-start", gap: 8, background: "#fff7d6", border: "3px solid #c0392b", borderRadius: 10, padding: "6px 10px", fontFamily: FONT_JP, fontSize: 18, fontWeight: 700, color: "#8e1f16", lineHeight: 1.3 }}>
    <span style={{ background: "#c0392b", color: "#fff", borderRadius: 6, padding: "0 7px", flexShrink: 0 }}>仮</span>
    {text}
  </div>
);
/** 全体に付ける「通しの仮版」の印 */
const Draft: React.FC = () => (
  <div style={{ position: "absolute", right: 16, top: 12, fontFamily: FONT_JP, fontSize: 16, color: "#fff", background: "rgba(0,0,0,0.45)", borderRadius: 6, padding: "2px 10px" }}>通しの仮版</div>
);

/** ピクトグラムの人（アプリの部品をそのまま読む） */
const personSvg = (o: { angles: Angles; x: number; ground: number; h: number; facing?: "left" | "right"; role?: "new" | "lead" | "worker"; headwear?: "none" | "helmet" | "cap" }) =>
  characterSvg({ angles: o.angles, x: o.x, groundY: o.ground, height: o.h, facing: o.facing ?? "right", view: "quarter", role: o.role ?? "new", headwear: o.headwear ?? "none" });
const Svgish: React.FC<{ html: string; style?: React.CSSProperties; opacity?: number }> = ({ html, style, opacity = 1 }) => <g opacity={opacity} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
const GOLD: React.CSSProperties = { filter: "sepia(1) saturate(4.5) hue-rotate(-8deg) brightness(1.08) drop-shadow(0 0 10px #ffd76a)" };

/** 背丈ほどある大きな冒険のリュック（主人公の背中。facing の反対側に付ける）。道具や巻物が詰まっていて、一番上に赤い相棒が乗る */
const packX = (x: number, h: number, facing: "left" | "right" = "right") => x + (facing === "right" ? -1 : 1) * h * 0.2;
const Backpack: React.FC<{ x: number; ground: number; h: number; facing?: "left" | "right" }> = ({ x, ground, h, facing = "right" }) => {
  const bx = packX(x, h, facing);
  const sw = Math.max(2, h * 0.018);
  const top = ground - h * 0.92;
  return (
    <g stroke="#3d240f" strokeWidth={sw} strokeLinejoin="round">
      {/* 上から出ている巻物とつるはしの柄 */}
      <rect x={bx - h * 0.13} y={top - h * 0.06} width={h * 0.07} height={h * 0.2} rx={h * 0.02} fill="#f4e4b8" />
      <rect x={bx + h * 0.07} y={top - h * 0.1} width={h * 0.035} height={h * 0.24} fill="#a8743f" />
      <path d={`M${bx + h * 0.02} ${top - h * 0.1}L${bx + h * 0.16} ${top - h * 0.08}`} fill="none" stroke="#777" strokeWidth={sw * 2} strokeLinecap="round" />
      {/* 本体 */}
      <rect x={bx - h * 0.19} y={top} width={h * 0.38} height={h * 0.78} rx={h * 0.07} fill="#8a5a2b" />
      {/* 巻いた寝袋 */}
      <rect x={bx - h * 0.21} y={top - h * 0.02} width={h * 0.42} height={h * 0.11} rx={h * 0.05} fill="#4e7a55" />
      {/* ふたと物入れ */}
      <path d={`M${bx - h * 0.17} ${top + h * 0.12}H${bx + h * 0.17}V${top + h * 0.28}Q${bx} ${top + h * 0.34} ${bx - h * 0.17} ${top + h * 0.28}Z`} fill="#a46c36" />
      <rect x={bx - h * 0.14} y={top + h * 0.45} width={h * 0.28} height={h * 0.2} rx={h * 0.03} fill="#a46c36" />
      <circle cx={bx} cy={top + h * 0.3} r={h * 0.022} fill="#e8c56a" />
    </g>
  );
};
/** リュックの一番上（赤い相棒の居場所） */
const packTop = (x: number, ground: number, h: number, facing: "left" | "right" = "right"): [number, number] => [packX(x, h, facing), ground - h * 1.0];

/**
 * 赤い相棒（Claude のキャラクター。非公式のファン作品として自分たちで描く。11/5 夜 作者の決定）。名前とロゴは出さない。
 * 角の立った横長の四角い体に、縦長の黒い目、左右の小さな手、下に 4 本の短い足。s は体の横幅。(x, y) は足元。
 * look は目の向き（-1 左・1 右・0 正面。下をのぞき込むときは down）
 */
const CLAWD = "#d97757";
const CLAWD_DARK = "#a9502f";
const Partner: React.FC<{ x: number; y: number; s?: number; f: number; bob?: boolean; rot?: number; look?: number; down?: number }> = ({ x, y, s = 34, f, bob = true, rot = 0, look = 0, down = 0 }) => {
  const b = bob ? Math.abs(Math.sin(f / 5)) * s * 0.08 : 0;
  const u = s / 10; // 1 マス
  const bodyH = 6 * u;
  const legH = 1.6 * u;
  const ex = look * 0.6 * u;
  const ey = down * 0.8 * u;
  return (
    <g transform={`translate(${x} ${y - b}) rotate(${rot} 0 ${-bodyH / 2}) rotate(${down * 14})`}>
      {/* 足 4 本 */}
      {[-4, -2, 1, 3].map((lx) => (
        <rect key={lx} x={lx * u} y={-legH} width={u} height={legH} fill={CLAWD_DARK} />
      ))}
      {/* 左右の手 */}
      <rect x={-s / 2 - 1.4 * u} y={-legH - bodyH * 0.62} width={1.4 * u} height={1.6 * u} fill={CLAWD} />
      <rect x={s / 2} y={-legH - bodyH * 0.62} width={1.4 * u} height={1.6 * u} fill={CLAWD} />
      {/* 体 */}
      <rect x={-s / 2} y={-legH - bodyH} width={s} height={bodyH} fill={CLAWD} />
      {/* 目 */}
      <rect x={-2.6 * u + ex} y={-legH - bodyH * 0.74 + ey} width={u} height={2 * u} fill="#1d1d1d" />
      <rect x={1.6 * u + ex} y={-legH - bodyH * 0.74 + ey} width={u} height={2 * u} fill="#1d1d1d" />
    </g>
  );
};

/** 金色の案内人（帽子・電球の杖）。flash で杖の電球が光る */
const Guide: React.FC<{ x: number; ground: number; h: number; angles: Angles; facing: "left" | "right"; opacity?: number; flash?: number }> = ({ x, ground, h, angles, facing, opacity = 1, flash = 0 }) => {
  const sx = x + (facing === "right" ? 1 : -1) * h * 0.3;
  const top = ground - h * 1.05;
  return (
    <g opacity={opacity}>
      <line x1={sx} y1={ground} x2={sx} y2={top} stroke="#8a5a1e" strokeWidth={Math.max(3, h * 0.03)} strokeLinecap="round" />
      <Svgish html={personSvg({ angles, x, ground, h, facing, role: "lead", headwear: "cap" })} style={GOLD} />
      {flash > 0 && <circle cx={sx} cy={top - h * 0.07} r={h * (0.15 + flash * 0.9)} fill="#fff6b0" opacity={0.75 * (1 - flash * 0.6)} />}
      <circle cx={sx} cy={top - h * 0.07} r={h * 0.075} fill={flash > 0 ? "#fffbe0" : "#ffe27a"} stroke="#8a5a1e" strokeWidth={Math.max(2, h * 0.018)} />
      <rect x={sx - h * 0.04} y={top - h * 0.005} width={h * 0.08} height={h * 0.04} fill="#9a9a9a" />
    </g>
  );
};

/** 吹き出し（床の人の頭の上） */
const Bubble: React.FC<{ x: number; y: number; text: string; kari?: boolean; side?: "left" | "right"; o: number }> = ({ x, y, text, kari, side = "left", o }) => {
  if (o <= 0) return null;
  const w = 26 + text.length * 21 + (kari ? 40 : 0);
  const bx = side === "left" ? x - w + 30 : x - 30;
  return (
    <g opacity={o} transform={`translate(0 ${(1 - o) * 10})`}>
      <path d={`M${bx} ${y - 54}H${bx + w}V${y - 6}H${x + (side === "left" ? -10 : 18)}L${x + 4} ${y + 12}L${x + (side === "left" ? -22 : 0)} ${y - 6}H${bx}Z`} fill="#fff" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      {kari && <rect x={bx + 10} y={y - 44} width={32} height={28} rx={5} fill="#c0392b" />}
      {kari && <text x={bx + 26} y={y - 23} textAnchor="middle" fontFamily={FONT_JP} fontSize={18} fontWeight={700} fill="#fff">仮</text>}
      <text x={bx + 14 + (kari ? 40 : 0)} y={y - 22} fontFamily={FONT_JP} fontSize={21} fontWeight={700} fill={INK}>
        {text}
      </text>
    </g>
  );
};

// ---- 枠の中の絵（窓の座標: 708×372） ----
const PicSvg: React.FC<{ children: React.ReactNode; bg?: string; wobble?: boolean }> = ({ children, bg = "#fbf3dc", wobble = true }) => (
  <svg width={WIN.w} height={WIN.h} viewBox={`0 0 ${WIN.w} ${WIN.h}`} style={{ position: "absolute", inset: 0 }}>
    <rect width={WIN.w} height={WIN.h} fill={bg} />
    <g filter={wobble ? "url(#wobble)" : undefined}>{children}</g>
  </svg>
);
const KariSlide: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_JP, fontSize: 28, fontWeight: 700, color: INK, textAlign: "center", padding: 30, background: "repeating-linear-gradient(45deg,#fbf3dc 0 22px,#f3e8c8 22px 44px)" }}>
    <span style={{ background: "#c0392b", color: "#fff", borderRadius: 8, padding: "2px 12px", marginRight: 14 }}>仮</span>
    {text}
  </div>
);
const Photo: React.FC<{ src: string }> = ({ src }) => <Img src={staticFile(src)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#fbf3dc" }} />;

/** むかしむかし: 紙の上を動くペンの線（作者の手書きの絵が入るまでの置き場） */
const StoryPic: React.FC<{ f: number }> = ({ f }) => {
  const n = Math.floor(f / 2);
  const pts = Array.from({ length: Math.min(n, 120) }, (_, i) => `${110 + (i % 40) * 12.5 + Math.sin(i * 0.9) * 8} ${90 + Math.floor(i / 40) * 95 + Math.sin(i * 0.5) * 22}`);
  const tip = pts[pts.length - 1]?.split(" ").map(Number) ?? [110, 90];
  return (
    <PicSvg>
      <rect x={60} y={30} width={590} height={312} rx={6} fill="#fffdf6" stroke="#d8ccaa" strokeWidth={4} transform="rotate(-1.5 354 186)" />
      {pts.length > 1 && <path d={`M${pts.join("L")}`} fill="none" stroke="#3b3b3b" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />}
      <g transform={`translate(${tip[0]} ${tip[1]}) rotate(35)`}>
        <rect x={-6} y={-100} width={12} height={90} rx={3} fill="#2b5fa8" />
        <path d="M-6 -10L0 6L6 -10Z" fill="#333" />
      </g>
    </PicSvg>
  );
};
/** よい UI・UX は、ことばを越える: 手書きの棒人間 → アプリのピクトグラム */
const UiUxPic: React.FC<{ f: number }> = ({ f }) => {
  const t = interpolate(f, [sec(0.6), sec(1.8)], [0, 1], clamp);
  const j = stickJoints(poseAngles("stand", "front"), "front");
  const low = Math.max(j.ankle[0][1], j.ankle[1][1]) + 25;
  const k = 220 / 434;
  const ln = (a: [number, number], b: [number, number]) => `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;
  return (
    <PicSvg>
      <g transform={`translate(354 345) scale(${k}) translate(0 ${-low})`} opacity={1 - t} fill="none" stroke={INK} strokeWidth={9} strokeLinecap="round" filter="url(#wobble-strong)">
        <path d={[ln(j.hip, j.neck), ln(j.shoulder[0], j.hand[0]), ln(j.shoulder[1], j.hand[1]), ln(j.hipJoint[0], j.ankle[0]), ln(j.hipJoint[1], j.ankle[1])].join("")} />
        <circle cx={j.head[0]} cy={j.head[1]} r={38} />
      </g>
      <Svgish html={personSvg({ angles: POSES.stand, x: 354, ground: 345, h: 220 })} opacity={t} />
      <text x={354} y={62} textAnchor="middle" fontFamily={FONT_JP} fontSize={36} fontWeight={700} fill={INK}>
        よい UI・UX は、ことばを越える
      </text>
    </PicSvg>
  );
};

/** 絵の中の冒険（0:28〜0:37）: 巻物をリュックに詰める → 相棒が飛び乗る → ポータルへ走って吸い込まれる → 白く抜ける */
const SCROLLS = ["vietnamese/SKILL.md", "japanese/SKILL.md"];
const PG = 322; // 絵の中の地面
const PX = 565;
const PY = 196;
const PRX = 72;
const PRY = 100;
const AdventurePic: React.FC<{ f: number; mark?: string }> = ({ f, mark }) => {
  const t = f / FPS;
  const open = interpolate(t, [0, 0.6], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.4)) });
  const spin = f * 4;
  // 主人公: 立って巻物を受ける（〜6 秒）→ 走ってポータルへ（6〜7 秒）→ 小さくなって消える
  const hx = interpolate(t, [6, 6.9, 7.2], [170, PX - 60, PX], { ...clamp, easing: Easing.in(Easing.quad) });
  const shrink = interpolate(t, [6.9, 7.2], [1, 0.1], clamp);
  const hh = 170 * shrink;
  const hg = interpolate(shrink, [0.1, 1], [PY + 10, PG]);
  const running = t > 6 && t < 7.2;
  const angles = running ? gait("run", t / 0.32) : t > 3 && t < 4.2 ? mixAngles(POSES.stand, POSES.wave, 0.7) : POSES.stand;
  const heroO = t < 7.15 ? 1 : 0;
  // 相棒: はじめからリュックの一番上。巻物を詰める間（0.4〜2.4 秒）は上からのぞき込む
  const [tx, ty] = packTop(hx, hg, hh);
  const peek = interpolate(t, [0.4, 0.8, 2.2, 2.6], [0, 1, 1, 0], clamp);
  const flash = interpolate(t, [7.2, 7.8], [0, 1], clamp);
  return (
    <PicSvg>
      {/* 地面と、遠くの山 */}
      <path d={`M0 ${PG}H${WIN.w}V${WIN.h}H0Z`} fill="#e8dcb8" />
      <path d={`M0 ${PG}L90 250L170 300L260 230L360 ${PG}Z`} fill="#d9ccaa" />
      {/* ポータル（頭に電球・真ん中に印・下に「電気業界」の札） */}
      <g transform={`translate(${PX} ${PY}) scale(${open}) translate(${-PX} ${-PY})`}>
        <ellipse cx={PX} cy={PY} rx={PRX * 1.4} ry={PRY * 1.25} fill={GLOW} opacity={0.25} />
        <ellipse cx={PX} cy={PY} rx={PRX} ry={PRY} fill={GLOW} stroke={GLOW_LIGHT} strokeWidth={6} />
        {Array.from({ length: 5 }, (_, i) => (
          <ellipse key={i} cx={PX} cy={PY} rx={PRX * (0.3 + i * 0.15)} ry={PRY * (0.3 + i * 0.15)} fill="none" stroke="#fff" strokeOpacity={0.4} strokeWidth={4} strokeDasharray={`${30 + i * 10} ${24 + i * 6}`} transform={`rotate(${(i % 2 ? -1 : 1) * spin * (1 + i * 0.2)} ${PX} ${PY})`} />
        ))}
        {[0, 1, 2].map((i) => {
          const k = Math.floor(f / 6) + i * 7;
          const a = ((k * 137) % 360) * (Math.PI / 180);
          const x0 = PX + Math.cos(a) * PRX;
          const y0 = PY + Math.sin(a) * PRY;
          return <path key={i} d={`M${x0} ${y0}l${Math.cos(a) * 14 - 5} ${Math.sin(a) * 14 + 5}l${Math.cos(a) * 14 + 6} ${Math.sin(a) * 14 - 6}`} fill="none" stroke={GLOW_LIGHT} strokeWidth={4} strokeLinecap="round" opacity={f % 6 < 4 ? 0.95 : 0.2} />;
        })}
        <g transform={`translate(${PX} ${PY})`}>
          <Mark src={mark} r={34} />
        </g>
        {/* 頭の電球 */}
        <g transform={`translate(${PX} ${PY - PRY - 12})`}>
          <circle r={42 + Math.sin(f / 4) * 3} fill="#fff3a0" opacity={0.35} />
          <path d="M-22 -12A26 26 0 1 1 22 -12Q14 2 12 14H-12Q-14 2 -22 -12Z" fill="#ffe46b" stroke="#6b4a12" strokeWidth={4} strokeLinejoin="round" />
          <rect x={-13} y={14} width={26} height={14} rx={3} fill="#9a9a9a" stroke="#555" strokeWidth={3} />
          <path d="M-6 -2L0 -14L6 -2" fill="none" stroke="#c98b12" strokeWidth={3} />
        </g>
        <g transform={`translate(${PX} ${PG - 4})`}>
          <rect x={-70} y={-34} width={140} height={44} rx={8} fill="#8a5a32" stroke="#5c3a1e" strokeWidth={4} />
          <text y={-4} textAnchor="middle" fontFamily={FONT_JP} fontSize={26} fontWeight={700} fill="#fff7e0">
            電気業界
          </text>
        </g>
      </g>
      {/* 巻物: 上から飛んできて、リュックに入る */}
      {SCROLLS.map((s, i) => {
        const u = interpolate(t, [0.4 + i * 0.8, 1.3 + i * 0.8], [0, 1], { ...clamp, easing: ease });
        const [bx, by] = packTop(hx, hg, hh);
        const x = interpolate(u, [0, 1], [240 + i * 170, bx]);
        const y = interpolate(u, [0, 1], [70, by + hh * 0.1]) - Math.sin(u * Math.PI) * 40;
        return (
          <g key={s} transform={`translate(${x} ${y}) scale(${1 - u * 0.75})`} opacity={1 - interpolate(u, [0.9, 1], [0, 1], clamp)}>
            <rect x={-118} y={-24} width={236} height={48} rx={9} fill="#f4e4b8" stroke="#8a5a32" strokeWidth={4} />
            <circle cx={-118} cy={0} r={12} fill="#c9a86a" stroke="#8a5a32" strokeWidth={3} />
            <circle cx={118} cy={0} r={12} fill="#c9a86a" stroke="#8a5a32" strokeWidth={3} />
            <text y={7} textAnchor="middle" fontFamily="Consolas, monospace" fontSize={19} fill="#3b2a14">{s}</text>
          </g>
        );
      })}
      {heroO > 0 && (
        <>
          <Backpack x={hx} ground={hg} h={hh} />
          <Svgish html={personSvg({ angles, x: hx, ground: hg, h: hh })} />
          <Partner x={tx} y={ty} s={hh * 0.26} f={f} bob={peek === 0} look={peek ? -1 : 1} down={peek} />
        </>
      )}
      {/* 吸い込まれたあと、枠の中が白く抜ける */}
      {flash > 0 && (
        <>
          <ellipse cx={PX} cy={PY} rx={PRX * (1 + flash * 8)} ry={PRY * (1 + flash * 5)} fill="#fff" opacity={Math.min(1, flash * 1.4)} />
          <rect width={WIN.w} height={WIN.h} fill="#fff" opacity={interpolate(flash, [0.5, 1], [0, 1], clamp)} />
        </>
      )}
    </PicSvg>
  );
};

/** 電気の現場（案内人の場面の枠の中）: 電柱と電線。白から戻る */
const SitePic: React.FC<{ f: number }> = ({ f }) => (
  <>
    <PicSvg bg="#dcecf5">
      <circle cx={600} cy={70} r={34} fill="#ffe08a" />
      <path d="M0 300Q180 250 360 290T708 270V372H0Z" fill="#b9d39a" />
      {[120, 360, 600].map((x, i) => (
        <g key={x}>
          <rect x={x - 7} y={80 + i * 6} width={14} height={240 - i * 6} fill="#8d8d8d" stroke="#555" strokeWidth={3} />
          <rect x={x - 46} y={104 + i * 6} width={92} height={10} fill="#777" stroke="#444" strokeWidth={2} />
          {[-36, 0, 36].map((dx) => <circle key={dx} cx={x + dx} cy={100 + i * 6} r={5} fill="#eee" stroke="#444" strokeWidth={2} />)}
        </g>
      ))}
      {[-36, 0, 36].map((dx) => (
        <path key={dx} d={`M${120 + dx} 100Q${240 + dx} 140 ${360 + dx} 106Q${480 + dx} 146 ${600 + dx} 112`} fill="none" stroke="#333" strokeWidth={2.5} />
      ))}
    </PicSvg>
    <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: interpolate(f, [0, sec(0.8)], [1, 0], clamp) }} />
  </>
);

/** ヒアリング: 4 枚の絵（横へ抜いて替える） */
const SLIDES = [<KariSlide key="a" text="現場で聞いたことが入る" />, <Photo key="b" src="poster.png" />, <Photo key="c" src="jacket.png" />, <KariSlide key="d" text="聞いたことのまとめが入る" />];
const HearingPic: React.FC<{ f: number; len: number }> = ({ f, len }) => {
  const each = len / SLIDES.length;
  const i = Math.min(SLIDES.length - 1, Math.floor(f / each));
  const into = f - i * each;
  const slide = i > 0 ? interpolate(into, [0, SLIDE], [1, 0], { ...clamp, easing: Easing.out(Easing.cubic) }) : 0;
  return (
    <>
      {i > 0 && slide > 0 && <div style={{ position: "absolute", inset: 0, transform: `translateX(${(slide - 1) * 100}%)` }}>{SLIDES[i - 1]}</div>}
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${slide * 100}%)` }}>{SLIDES[i]}</div>
    </>
  );
};

/** 40 業種の紙が、裏返って業種のカードになる */
const IndustriesPic: React.FC<{ f: number }> = ({ f }) => {
  const cols = 10;
  const cw = 68;
  const ch = 84;
  return (
    <PicSvg wobble={false}>
      {INDUSTRY_DRAFTS.slice(0, 40).map((d, i) => {
        const x = 14 + (i % cols) * cw + cw / 2;
        const y = 10 + Math.floor(i / cols) * (ch + 6);
        const t = interpolate(f, [8 + i * 4, 18 + i * 4], [0, 1], { ...clamp, easing: ease });
        const sx = Math.abs(Math.cos(t * Math.PI));
        const card = t >= 0.5;
        const r = d.roles[0];
        const fig = card ? characterSvg({ angles: POSES.stand, x: 0, groundY: 0, height: 56, facing: "right", view: "front", role: r.role, headwear: r.headwear, outfit: r.outfit }) : "";
        return (
          <g key={d.id} transform={`translate(${x} ${y + ch / 2}) scale(${Math.max(0.04, sx)} 1)`}>
            <rect x={-cw / 2 + 3} y={-ch / 2} width={cw - 6} height={ch} rx={6} fill={card ? "#fff" : "#fbf6e8"} stroke={card ? "#cbbf9c" : "#b9ad8f"} strokeWidth={2} />
            {!card && [0, 1, 2, 3].map((k) => <rect key={k} x={-cw / 2 + 10} y={-ch / 2 + 12 + k * 14} width={cw - 22} height={4} rx={2} fill="#bbb" />)}
            {card && <g transform={`translate(0 ${ch / 2 - 20})`} dangerouslySetInnerHTML={{ __html: fig }} />}
            {card && (
              <text y={ch / 2 - 6} textAnchor="middle" fontFamily={FONT_JP} fontSize={10} fontWeight={700} fill={INK}>
                {d.name.length > 6 ? `${d.name.slice(0, 6)}…` : d.name}
              </text>
            )}
          </g>
        );
      })}
    </PicSvg>
  );
};

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
const Clips: React.FC<{ parts: ClipPart[] }> = ({ parts }) => {
  let at = 0;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#111" }}>
      {parts.map((p, i) => {
        const from = at;
        at += sec(p.slot);
        const extra = i === parts.length - 1 ? SLIDE : 0;
        return (
          <Sequence key={i} from={from} durationInFrames={sec(p.slot) + extra} layout="none">
            <div style={{ position: "absolute", inset: 0 }}>
              <Clip part={p} extra={extra} />
            </div>
          </Sequence>
        );
      })}
    </div>
  );
};
// 機能の場面の録画（runs-video。dur は録画の長さの秒、from は使い始めの秒）
const CLIPS: Record<string, ClipPart[]> = {
  "f-fold": [{ src: "fold.mp4", dur: 6.04, slot: 8 }],
  "f-card": [{ src: "card.mp4", dur: 4.92, slot: 7 }],
  "f-check": [{ src: "danger.mp4", dur: 1.28, slot: 2 }, { src: "queue.mp4", dur: 13.12, slot: 5 }],
  // 経路の録画は、最後にスマホの幅に切り替えて確かめる所（1.95 秒から）を使わない
  "f-route": [{ src: "route.mp4", dur: 1.95, slot: 7 }],
  "f-sign": [{ src: "fix.mp4", dur: 4.84, slot: 4 }, { src: "sign.mp4", dur: 2.4, slot: 3 }, { src: "read.mp4", dur: 1.2, slot: 2 }],
};

/** 場面ごとの枠の中の絵 */
const Picture: React.FC<{ seg: Seg; f: number; mark?: string }> = ({ seg, f, mark }) => {
  const len = sec(seg.len);
  switch (seg.id) {
    case "story": return <StoryPic f={f} />;
    case "uiux": return <UiUxPic f={f} />;
    case "skills": return <AdventurePic f={f} mark={mark} />;
    case "guide": return <SitePic f={f} />;
    case "hearing": return <HearingPic f={f} len={len} />;
    case "industries": return <IndustriesPic f={f} />;
    case "end":
      return (
        <svg width={WIN.w} height={WIN.h} viewBox={`0 0 ${WIN.w} ${WIN.h}`} style={{ position: "absolute", inset: 0 }}>
          <TitlePaper iw={WIN.w} ih={WIN.h} sub="めでたし、めでたし" subO={interpolate(f, [10, 30], [0, 1], clamp)} />
        </svg>
      );
    default:
      return CLIPS[seg.id] ? <Clips parts={CLIPS[seg.id]} /> : <KariSlide text={seg.kari ?? ""} />;
  }
};
/** 冒険の絵は 0:28〜0:37 の 1 枚（「吸い込まれる」まで同じ絵）。案内人の絵は白から戻るので、横へ抜かない */
const PIC_SEGS = SEGS.filter((s) => s.id !== "opening" && s.id !== "warp");
const picLen = (s: Seg) => (s.id === "skills" ? s.len + 3 : s.len);
const noSlideIn = (s: Seg) => s.id === "guide";
const noSlideOut = (s: Seg) => s.id === "skills";
const PictureSlot: React.FC<{ seg: Seg; mark?: string }> = ({ seg, mark }) => {
  const f = useCurrentFrame();
  const len = sec(picLen(seg));
  const inT = noSlideIn(seg) ? 0 : interpolate(f, [0, SLIDE], [1, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  const outT = noSlideOut(seg) ? 0 : interpolate(f, [len, len + SLIDE], [0, -1], { ...clamp, easing: Easing.out(Easing.cubic) });
  if (noSlideOut(seg) && f >= len) return null;
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translateX(${(inT + outT) * 100}%)` }}>
      <Picture seg={seg} f={f} mark={mark} />
    </div>
  );
};
/** 冒頭の題の紙（0:17 に横へ抜けて、むかしむかしの絵に替わる） */
const TitleOut: React.FC = () => {
  const f = useCurrentFrame();
  const outT = interpolate(f, [0, SLIDE], [0, -1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translateX(${outT * 100}%)` }}>
      <svg width={WIN.w} height={WIN.h} viewBox={`0 0 ${WIN.w} ${WIN.h}`}>
        <TitlePaper iw={WIN.w} ih={WIN.h} />
      </svg>
    </div>
  );
};

// ---- 床の人たち（冒頭からの時刻 t 秒で決める） ----
const track = (t: number, keys: [number, number][]) => interpolate(t, keys.map((k) => k[0]), keys.map((k) => k[1]), { ...clamp, easing: ease });
const moving = (t: number, keys: [number, number][]) => Math.abs(track(t + 0.05, keys) - track(t - 0.05, keys)) > 0.5;
const HERO_X: [number, number][] = [[36.3, 200], [42, 200], [48, 560], [71, 560], [72.5, 150], [115, 150], [116.5, 420]];
const GUIDE_X: [number, number][] = [[42, 360], [48, 720], [71, 720], [72.5, 1130], [115, 1130], [116.5, 860]];
const WORKER_X: [number, number][] = [[43, 1400], [48, 950], [62, 950], [65.5, 1440]];
/** 機能の場面（1:12〜1:55）は床の人を小さくして止める */
const sizeAt = (t: number) => interpolate(t, [71, 72.5, 115, 116.5], [CH, 100, 100, CH], clamp);
const POP = { from: 35.6, land: 36.3 };

const FloorActors: React.FC<{ t: number; f: number }> = ({ t, f }) => {
  if (t < POP.from) return null;
  const h = sizeAt(t);
  // 主人公: 枠の左下から転がり出て、床に着く
  let hx = track(t, HERO_X);
  let hg = GROUND;
  let rot = 0;
  let hk = 1;
  if (t < POP.land) {
    const p = interpolate(t, [POP.from, POP.land], [0, 1], clamp);
    hx = interpolate(p, [0, 1], [WIN.x + 110, 200]);
    hg = interpolate(p, [0, 1], [WIN.y + WIN.h - 30, GROUND]) - Math.sin(p * Math.PI) * 110;
    rot = -360 * p;
    hk = interpolate(p, [0, 1], [0.6, 1]);
  }
  const squash = t >= POP.land && t < POP.land + 0.25 ? 1 - 0.12 * Math.sin(((t - POP.land) / 0.25) * Math.PI) : 1;
  const heroWalk = moving(t, HERO_X);
  const heroAngles = heroWalk ? gait("walk", t / 0.55) : t > 72.5 && t < 115 ? POSES.look_up : t > 175.5 ? mixAngles(POSES.stand, POSES.wave, 0.6 + 0.4 * Math.sin(t * 9)) : POSES.stand;
  const hh = h * hk;
  // 相棒: リュックの一番上に乗ったまま、一緒に転がり出る（最後まで同じ所）
  const [tx, ty] = packTop(hx, hg, hh);
  // 金色の粒: 転がり出たときに飛び散り、0:37〜0:40 に左下へ集まって案内人になる
  const gx = track(t, GUIDE_X);
  const gather = interpolate(t, [37, 39.6], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const burst = interpolate(t, [POP.land - 0.2, 37], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const guideO = interpolate(t, [39.2, 40.2], [0, 1], clamp);
  const flash = t > 40.5 && t < 41.3 ? Math.sin(((t - 40.5) / 0.8) * Math.PI) : 0;
  const guideWalk = moving(t, GUIDE_X);
  const guideFacing: "left" | "right" = t >= 62 ? "left" : "right";
  // 職人さん（ヘルメット）: 右から出てきて話し、1:02 から右へ帰る
  const wx = track(t, WORKER_X);
  const workerOn = t > 43 && t < 65.5;
  const workerFacing: "left" | "right" = t < 62 ? "left" : "right";
  const bub = (a: number, b: number) => interpolate(t, [a, a + 0.3, b - 0.3, b], [0, 1, 1, 0], clamp);
  return (
    <g>
      {/* 影 */}
      {t >= POP.land && <ellipse cx={hx} cy={GROUND + 4} rx={h * 0.32} ry={6} fill="#000" opacity={0.22} />}
      {guideO > 0 && <ellipse cx={gx} cy={GROUND + 4} rx={h * 0.32} ry={6} fill="#000" opacity={0.22 * guideO} />}
      {/* 粒 */}
      {guideO < 1 &&
        Array.from({ length: 56 }, (_, i) => {
          const a = (i * 137.5 * Math.PI) / 180;
          const r = 60 + ((i * 53) % 220);
          const sx = 200 + Math.cos(a) * r * burst * 0.9;
          const sy = GROUND - 70 - Math.abs(Math.sin(a)) * r * burst * 0.55 + Math.sin(t * 3 + i) * 6;
          const ex = 360 + Math.cos(a) * 26;
          const ey = GROUND - CH * 0.55 + Math.sin(a) * CH * 0.5;
          const x = sx + (ex - sx) * gather;
          const y = sy + (ey - sy) * gather;
          return <circle key={i} cx={x} cy={y} r={2.5 + (i % 3)} fill="#ffe38a" opacity={(1 - guideO) * Math.min(1, burst * 2) * (0.6 + 0.4 * Math.sin(f / 3 + i))} />;
        })}
      {guideO > 0 && <Guide x={gx} ground={GROUND} h={h} angles={guideWalk ? gait("walk", t / 0.6) : POSES.stand} facing={guideFacing} opacity={guideO} flash={flash} />}
      {workerOn && <Svgish html={personSvg({ angles: moving(t, WORKER_X) ? gait("walk", t / 0.6) : POSES.stand, x: wx, ground: GROUND, h: CH, facing: workerFacing, role: "worker", headwear: "helmet" })} />}
      {/* 主人公とリュックと相棒 */}
      <g transform={`rotate(${rot} ${hx} ${hg - hh / 2}) translate(${hx} ${hg}) scale(1 ${squash}) translate(${-hx} ${-hg})`}>
        <Backpack x={hx} ground={hg} h={hh} />
        <Svgish html={personSvg({ angles: heroAngles, x: hx, ground: hg, h: hh })} />
        <Partner x={tx} y={ty} s={hh * 0.3} f={f} bob={t > POP.land + 0.3} look={heroWalk ? 1 : 0} />
      </g>
      {/* 吹き出し（ヒアリング） */}
      {/* 枠に重ならないよう、頭の横に出す */}
      <Bubble x={wx + 60} y={GROUND - CH + 50} text="現場の話が入る" kari side="right" o={bub(48.5, 53.5)} />
      <Bubble x={track(t, HERO_X) + 50} y={GROUND - CH + 50} text="……" side="right" o={bub(54, 56.5)} />
      <Bubble x={wx + 60} y={GROUND - CH + 50} text="まとめが入る" kari side="right" o={bub(57, 61.5)} />
    </g>
  );
};

/** 0:17 から 3:00 まで変わらない舞台（枠・床・枠の中の絵・床の人・字幕） */
const Stage: React.FC<{ mark?: string }> = ({ mark }) => {
  const f = useCurrentFrame();
  const g = f + TOTAL;
  const t = g / FPS;
  const seg = [...SEGS].reverse().find((s) => t >= s.at) ?? SEGS[0];
  const lightO = interpolate(f, [0, sec(1.2)], [0.65, 0], clamp);
  return (
    <AbsoluteFill style={{ background: PURPLE }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
        <WobbleDefs />
        <rect y={FLOOR_Y} width={W} height={H - FLOOR_Y} fill={FLOOR} />
        <StageFrame cx={W / 2} open={1} />
      </svg>
      {/* 枠の窓 */}
      <div style={{ position: "absolute", left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h, overflow: "hidden", background: "#2a1b0e" }}>
        <Sequence durationInFrames={SLIDE} layout="none">
          <TitleOut />
        </Sequence>
        {PIC_SEGS.map((s) => (
          <Sequence key={s.id} from={sec(s.at) - TOTAL} durationInFrames={sec(picLen(s)) + (noSlideOut(s) ? 0 : SLIDE)} layout="none">
            <PictureSlot seg={s} mark={mark} />
          </Sequence>
        ))}
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
        {lightO > 0 && (
          <>
            <Light id="sl0" x={500} y={270} r={212} opacity={lightO} />
            <Light id="sl1" x={790} y={380} r={237} opacity={lightO} />
          </>
        )}
        <FloorActors t={t} f={f} />
      </svg>
      {seg.kari && <Kari text={seg.kari} />}
      <Subtitle seg={seg} f={g - sec(seg.at)} />
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

export const Full: React.FC<FullProps> = ({ mark }) => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Sequence durationInFrames={TOTAL} name="冒頭">
      <Opening />
    </Sequence>
    <Sequence from={TOTAL} durationInFrames={FULL_FRAMES - TOTAL} name="舞台">
      <Stage mark={mark} />
    </Sequence>
    <Draft />
  </AbsoluteFill>
);

/** 場面の一覧（場面ごとの真ん中のコマの静止画を並べ、時刻と場面名を付ける。静止画は render-full.mjs が先に書き出す） */
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
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
