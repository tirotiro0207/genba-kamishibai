// 3 分の通しの仮版（11/5 夜 作者の決定: 「一旦全体作ってみちゃおうか、このまま」）。
// 台本 v2（docs/video.md）の流れで 0:00〜3:00 を 1 本にする。冒頭とポータルは書き出した版をそのまま並べ、作り直さない。
// 素材の無い場面は「仮」の札を付けた置き場の絵で埋め、秒は台本どおりに取る。語りは字幕で画面の下に出す（音なし）。
// 動画・画像は書き出しのときに git の外から写して読む（render-full.mjs）。数や写真は、本物がそろうまで出さない
import React from "react";
import { AbsoluteFill, Easing, Freeze, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { characterSvg } from "../../src/shared/picto/character";
import { INDUSTRY_DRAFTS } from "../../src/shared/picto/industry-drafts";
import { POSES, poseAngles, stickJoints } from "../../src/shared/picto/poses";
import { gait } from "./paper";
import { FONT_JP, FRAME, StageFrame } from "./parts";
import { FPS, H, INK, PURPLE, W } from "./timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const sec = (s: number) => Math.round(s * FPS);

// ---- 場面の表（秒は台本 v2。冒頭が 19 秒にのびた分、昔話を 10 秒から 8 秒に詰めた） ----
export interface Seg { id: string; title: string; at: number; len: number; caption?: string; note?: string; kari?: string }
export const SEGS: Seg[] = [
  { id: "opening", title: "冒頭（時計・折り紙・名のり・枠・開演・題）", at: 0, len: 19 },
  { id: "story", title: "むかしむかし（作者の生い立ち）", at: 19, len: 8, kari: "作者の手書きの絵が入る", caption: "むかしむかし、日本人のお父さんとベトナム人のお母さんの家に、男の子がいました。|日本語が分からなくても、ポケモン リーフグリーンは最後までクリアできました。" },
  { id: "uiux", title: "よい UI・UX は、ことばを越える", at: 27, len: 3, caption: "よい UI・UX は、ことばを越える。" },
  { id: "skills", title: "スキルの巻物と赤い相棒", at: 30, len: 5, kari: "赤い相棒の絵は作者が決める", caption: "スキルの巻物をカバンに詰めて、赤い相棒と冒険へ。" },
  { id: "portal", title: "電気業界のポータル", at: 35, len: 4, caption: "行き先は、電気業界。" },
  { id: "guide", title: "光の粒が集まって案内人", at: 39, len: 6, kari: "案内人の顔は作者が決める", caption: "ワープした先で、光の粒が集まり、金色の案内人が現れました。" },
  { id: "hearing", title: "ヒアリング", at: 45, len: 20, kari: "ヒアリングの中身が入る", caption: "案内人に、現場の話を聞きました。|電気の現場の安全の決まりは、文字の資料と貼り紙で回っています。|文字が読めなければ、決まりは届きません。届かなかった決まりは、けがになります。|（聞いたことのまとめが入る）", note: "|日本で働く外国人 約 257 万人、うちベトナム 約 61 万人（厚生労働省「外国人雇用状況」の届出状況まとめ、令和 7 年 10 月末。数を丸めた）||" },
  { id: "why", title: "なぜ作ったか", at: 65, len: 7, kari: "作者の言葉が入る", caption: "（なぜ作ったか: 作者の言葉が入る）" },
  { id: "f-fold", title: "機能: 折りたたむ", at: 72, len: 8, caption: "何ページもの資料が、1 枚・0 字のカードにたたまれます。" },
  { id: "f-card", title: "機能: 形が崩れない理由", at: 80, len: 7, caption: "絵は Claude が数で書き、アプリが描きます。だから形が崩れません。" },
  { id: "f-check", title: "機能: 確かめる AI", at: 87, len: 7, caption: "別の Claude が、絵だけを見て読みます。伝わらなければ赤です。" },
  { id: "f-route", title: "機能: 広げて元の文に戻る", at: 94, len: 7, caption: "絵の部品をタップすると、元の文に戻れます。" },
  { id: "f-sign", title: "機能: 人が直して署名", at: 101, len: 9, caption: "監修者が直したいところを枠で囲み、直ったら署名します。|署名したカードだけが、新入社員に届きます。" },
  { id: "f-notrans", title: "機能: 翻訳を入れない", at: 110, len: 5, kari: "この機能の画面が入る", caption: "（翻訳を入れない理由が入る）" },
  { id: "trial", title: "試したところ", at: 115, len: 25, kari: "11/6 に撮る（当日の手元と画面・時計 2 つ。数は出さない）", caption: "（試したところ: 11/6 に撮る）" },
  { id: "voice", title: "現場の声", at: 140, len: 25, kari: "11/6 に撮る・同意が先", caption: "（現場の声: 11/6 に撮る。同意が先）" },
  { id: "industries", title: "40 業種の紙が業種のカードに", at: 165, len: 10, caption: "電気から始めて、40 の業種へ。" },
  { id: "end", title: "めでたしめでたし", at: 175, len: 5, caption: "めでたし、めでたし。" },
];
export const FULL_FRAMES = sec(180);

// ---- 共通の部品 ----
const GROUND = 600;
const SUB_Y = 646;

/** 字幕（画面の下）。「|」で区切ると、場面の長さを等分して順に出す */
const Subtitle: React.FC<{ seg: Seg; f: number }> = ({ seg, f }) => {
  if (!seg.caption) return null;
  const parts = seg.caption.split("|");
  const notes = (seg.note ?? "").split("|");
  const i = Math.min(parts.length - 1, Math.floor((f / sec(seg.len)) * parts.length));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: SUB_Y, height: H - SUB_Y, background: "rgba(20,16,40,0.78)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", fontFamily: FONT_JP, color: "#fff", padding: "0 40px" }}>
      <div style={{ fontSize: 28, fontWeight: 700, textAlign: "center", lineHeight: 1.3 }}>{parts[i]}</div>
      {notes[i] && <div style={{ fontSize: 15, opacity: 0.85, marginTop: 2, textAlign: "center" }}>{notes[i]}</div>}
    </div>
  );
};
/** 「仮」の札 */
const Kari: React.FC<{ text: string; x?: number; y?: number }> = ({ text, x = 24, y = 20 }) => (
  <div style={{ position: "absolute", left: x, top: y, display: "flex", alignItems: "center", gap: 10, background: "#fff7d6", border: "3px solid #c0392b", borderRadius: 10, padding: "6px 14px", fontFamily: FONT_JP, fontSize: 22, fontWeight: 700, color: "#8e1f16" }}>
    <span style={{ background: "#c0392b", color: "#fff", borderRadius: 6, padding: "0 8px" }}>仮</span>
    {text}
  </div>
);
/** 全体に付ける「通しの仮版」の印 */
const Draft: React.FC = () => (
  <div style={{ position: "absolute", right: 16, top: 12, fontFamily: FONT_JP, fontSize: 16, color: "#fff", background: "rgba(0,0,0,0.45)", borderRadius: 6, padding: "2px 10px" }}>通しの仮版</div>
);

/** ピクトグラムの人（アプリの部品をそのまま読む）。gold は金色の案内人 */
const Person: React.FC<{ x: number; ground?: number; h?: number; walk?: number; facing?: "left" | "right"; gold?: boolean; hair?: "short"; opacity?: number }> = ({ x, ground = GROUND, h = 220, walk, facing = "right", gold, hair, opacity = 1 }) => {
  const angles = walk === undefined ? POSES.stand : gait("walk", walk);
  const svg = characterSvg({ angles, x, groundY: ground, height: h, facing, view: "quarter", role: gold ? "lead" : "new", headwear: "none", ...(hair ? { hair } : {}) });
  return <g opacity={opacity} style={gold ? { filter: "sepia(1) saturate(4.5) hue-rotate(-8deg) brightness(1.08) drop-shadow(0 0 10px #ffd76a)" } : undefined} dangerouslySetInnerHTML={{ __html: svg }} />;
};
/** 赤い相棒（仮: 赤い丸） */
const Partner: React.FC<{ x: number; f: number; ground?: number }> = ({ x, f, ground = GROUND }) => {
  const bob = Math.abs(Math.sin(f / 6)) * 10;
  return (
    <g transform={`translate(${x} ${ground - 46 - bob})`}>
      <circle r={40} fill="#d9442f" stroke="#7a1d12" strokeWidth={4} />
      <circle cx={-12} cy={-6} r={5} fill="#fff" />
      <circle cx={12} cy={-6} r={5} fill="#fff" />
      <rect x={-22} y={-74} width={44} height={26} rx={5} fill="#fff7d6" stroke="#c0392b" strokeWidth={3} />
      <text y={-55} textAnchor="middle" fontFamily={FONT_JP} fontSize={17} fontWeight={700} fill="#8e1f16">仮</text>
    </g>
  );
};
const Bg: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
    <rect width={W} height={H} fill={PURPLE} />
    <rect y={GROUND} width={W} height={H - GROUND} fill="#3a316c" />
    {children}
  </svg>
);

// 上の紙芝居の枠（開いたまま）と、その窓の画面の上の置き場
const FS = 0.94;
const FCY = 252;
const win = { x: 640 - (FRAME.w / 2 - FRAME.inset) * FS, y: FCY - (FRAME.h / 2 - FRAME.inset) * FS, w: (FRAME.w - FRAME.inset * 2) * FS, h: (FRAME.h - FRAME.inset * 2) * FS };
const TopFrame: React.FC = () => (
  <g transform={`translate(640 ${FCY}) scale(${FS}) translate(-640 -${FRAME.cy})`}>
    <StageFrame cx={640} open={1}>
      <rect width={FRAME.w - FRAME.inset * 2} height={FRAME.h - FRAME.inset * 2} fill="#fbf3dc" />
    </StageFrame>
  </g>
);
/** 枠の窓に入れる中身（HTML。横へ抜いて入れ替える: dx は窓の幅を 1 とした横のずれ） */
const Window: React.FC<{ children: React.ReactNode; dx?: number }> = ({ children, dx = 0 }) => (
  <div style={{ position: "absolute", left: win.x, top: win.y, width: win.w, height: win.h, overflow: "hidden", background: "#fbf3dc" }}>
    <div style={{ position: "absolute", inset: 0, transform: `translateX(${dx * 100}%)` }}>{children}</div>
  </div>
);
const KariSlide: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_JP, fontSize: 30, fontWeight: 700, color: INK, textAlign: "center", padding: 30, background: "repeating-linear-gradient(45deg,#fbf3dc 0 22px,#f3e8c8 22px 44px)" }}>
    <span style={{ background: "#c0392b", color: "#fff", borderRadius: 8, padding: "2px 12px", marginRight: 14 }}>仮</span>
    {text}
  </div>
);
const Pic: React.FC<{ src: string }> = ({ src }) => <Img src={staticFile(src)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#fff" }} />;

/** 録画を枠の窓に流す。足りなければ遅くし（半分の速さまで）、それでも足りなければ最後のコマで止める */
interface ClipPart { src: string; dur: number; from?: number; slot: number }
const Clip: React.FC<{ part: ClipPart }> = ({ part }) => {
  const slotF = sec(part.slot);
  const speed = Math.max(0.5, part.dur / part.slot);
  const play = Math.min(slotF, Math.floor((part.dur / speed) * FPS));
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
    <>
      {parts.map((p, i) => {
        const from = at;
        at += sec(p.slot);
        return (
          <Sequence key={i} from={from} durationInFrames={sec(p.slot)} layout="none">
            <div style={{ position: "absolute", inset: 0 }}>
              <Clip part={p} />
            </div>
          </Sequence>
        );
      })}
    </>
  );
};
/** 機能の場面: 上の枠で録画、下を人物が歩く */
const Feature: React.FC<{ f: number; parts?: ClipPart[]; kari?: string }> = ({ f, parts, kari }) => (
  <>
    <Bg>
      <TopFrame />
      <Person x={160 + (f % 60) * 0.4} h={150} walk={f / sec(0.6)} />
      <Partner x={90 + (f % 60) * 0.4} f={f} />
      <Person x={1120} h={150} gold hair="short" facing="left" />
    </Bg>
    <Window>{parts ? <Clips parts={parts} /> : <KariSlide text={kari ?? ""} />}</Window>
  </>
);

// ---- 場面 ----
const Story: React.FC<{ f: number }> = ({ f }) => {
  // 紙の上を動くペンの線（作者の手書きの絵が入るまでの置き場）
  const n = Math.floor(f / 2);
  const pts = Array.from({ length: Math.min(n, 120) }, (_, i) => `${300 + (i % 40) * 17 + Math.sin(i * 0.9) * 10} ${180 + Math.floor(i / 40) * 120 + Math.sin(i * 0.5) * 30}`);
  const tip = pts[pts.length - 1]?.split(" ").map(Number) ?? [300, 180];
  return (
    <Bg>
      <rect x={240} y={110} width={800} height={440} rx={8} fill="#fffdf6" stroke="#d8ccaa" strokeWidth={4} transform="rotate(-1.5 640 330)" />
      {pts.length > 1 && <path d={`M${pts.join("L")}`} fill="none" stroke="#3b3b3b" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />}
      <g transform={`translate(${tip[0]} ${tip[1]}) rotate(35)`}>
        <rect x={-6} y={-110} width={12} height={100} rx={3} fill="#2b5fa8" />
        <path d="M-6 -10L0 6L6 -10Z" fill="#333" />
      </g>
    </Bg>
  );
};
const UiUx: React.FC<{ f: number }> = ({ f }) => {
  const t = interpolate(f, [sec(0.8), sec(2.2)], [0, 1], clamp);
  const j = stickJoints(poseAngles("stand", "front"), "front");
  const low = Math.max(j.ankle[0][1], j.ankle[1][1]) + 25;
  const k = 260 / 434;
  const ln = (a: [number, number], b: [number, number]) => `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;
  return (
    <Bg>
      {/* 手書きの人（揺れる線の棒人間）→ アプリのピクトグラム */}
      <g transform={`translate(640 ${GROUND}) scale(${k}) translate(0 ${-low})`} opacity={1 - t} fill="none" stroke="#fff" strokeWidth={9} strokeLinecap="round">
        <path d={[ln(j.hip, j.neck), ln(j.shoulder[0], j.hand[0]), ln(j.shoulder[1], j.hand[1]), ln(j.hipJoint[0], j.ankle[0]), ln(j.hipJoint[1], j.ankle[1])].join("")} />
        <circle cx={j.head[0]} cy={j.head[1]} r={38} />
      </g>
      <g opacity={t}>
        <Person x={640} h={260} />
      </g>
      <text x={640} y={130} textAnchor="middle" fontFamily={FONT_JP} fontSize={44} fontWeight={700} fill="#fff7e0" opacity={interpolate(f, [0, 10], [0, 1], clamp)}>
        よい UI・UX は、ことばを越える
      </text>
    </Bg>
  );
};
const SCROLLS = ["vietnamese/SKILL.md", "japanese/SKILL.md", "design/SKILL.md"];
const Skills: React.FC<{ f: number }> = ({ f }) => {
  const go = interpolate(f, [sec(2.8), sec(5)], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const heroX = 520 + go * 820;
  return (
    <Bg>
      {SCROLLS.map((s, i) => {
        const t = interpolate(f, [sec(0.3 + i * 0.6), sec(0.9 + i * 0.6)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
        const x = interpolate(t, [0, 1], [300 + i * 340, heroX + 70]);
        const y = interpolate(t, [0, 1], [170, GROUND - 120]) - Math.sin(t * Math.PI) * 80;
        return (
          <g key={s} transform={`translate(${x} ${y}) scale(${1 - t * 0.7})`} opacity={1 - interpolate(t, [0.85, 1], [0, 1], clamp)}>
            <rect x={-130} y={-28} width={260} height={56} rx={10} fill="#f4e4b8" stroke="#8a5a32" strokeWidth={4} />
            <circle cx={-130} cy={0} r={14} fill="#c9a86a" stroke="#8a5a32" strokeWidth={3} />
            <circle cx={130} cy={0} r={14} fill="#c9a86a" stroke="#8a5a32" strokeWidth={3} />
            <text y={8} textAnchor="middle" fontFamily="Consolas, monospace" fontSize={22} fill="#3b2a14">{s}</text>
          </g>
        );
      })}
      {/* カバン */}
      <g transform={`translate(${heroX + 70} ${GROUND - 60})`}>
        <rect x={-34} y={-30} width={68} height={56} rx={10} fill="#7a4b26" stroke="#4a2c12" strokeWidth={4} />
        <path d="M-16 -30Q0 -52 16 -30" fill="none" stroke="#4a2c12" strokeWidth={5} />
      </g>
      <Person x={heroX} h={220} walk={go > 0 ? f / sec(0.5) : undefined} />
      <Partner x={heroX - 130} f={f} />
    </Bg>
  );
};
const Guide: React.FC<{ f: number }> = ({ f }) => {
  const gather = interpolate(f, [sec(0.4), sec(3.2)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const appear = interpolate(f, [sec(2.8), sec(3.6)], [0, 1], clamp);
  const flash = interpolate(f, [0, sec(0.5)], [0.9, 0], clamp);
  const gx = 300;
  return (
    <>
      <Bg>
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i * 137.5 * Math.PI) / 180;
          const r0 = 60 + ((i * 53) % 240);
          const sx = 80 + Math.cos(a) * r0 * 0.6 + ((i * 31) % 120);
          const sy = 660 - ((i * 47) % 200) + Math.sin(a) * 20;
          const tx = gx + Math.cos(a) * 30;
          const ty = GROUND - 120 + Math.sin(a) * 90;
          const x = sx + (tx - sx) * gather;
          const y = sy + (ty - sy) * gather + Math.sin(f / 5 + i) * 6 * (1 - gather);
          return <circle key={i} cx={x} cy={y} r={3 + (i % 3)} fill="#ffe38a" opacity={(1 - appear * 0.9) * (0.6 + 0.4 * Math.sin(f / 3 + i))} />;
        })}
        <Person x={gx} h={230} gold hair="short" opacity={appear} />
        <Person x={860} h={220} facing="left" opacity={interpolate(f, [sec(0.3), sec(1)], [0, 1], clamp)} />
        <Partner x={980} f={f} />
      </Bg>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </>
  );
};
/** ヒアリング: 上の枠で 4 枚のスライド（横へ抜いて替える）、下を人物が左右に歩く */
const SLIDES = [<KariSlide key="a" text="現場で聞いたことが入る" />, <Pic key="b" src="poster.png" />, <Pic key="c" src="jacket.png" />, <KariSlide key="d" text="聞いたことのまとめが入る" />];
const Hearing: React.FC<{ f: number; len: number }> = ({ f, len }) => {
  const each = len / SLIDES.length;
  const i = Math.min(SLIDES.length - 1, Math.floor(f / each));
  const into = f - i * each;
  const slide = i > 0 ? interpolate(into, [0, 12], [1, 0], { ...clamp, easing: Easing.out(Easing.cubic) }) : 0;
  const walk = Math.sin((f / len) * Math.PI * 4);
  return (
    <>
      <Bg>
        <TopFrame />
        <Person x={420 + walk * 160} h={150} walk={f / sec(0.6)} facing={Math.cos((f / len) * Math.PI * 4) > 0 ? "right" : "left"} />
        <Partner x={330 + walk * 160} f={f} />
        <Person x={860 - walk * 60} h={150} gold hair="short" facing="left" walk={f / sec(0.7)} />
      </Bg>
      {i > 0 && <Window dx={-1 + slide}>{SLIDES[i - 1]}</Window>}
      <Window dx={slide}>{SLIDES[i]}</Window>
    </>
  );
};
const Industries: React.FC<{ f: number }> = ({ f }) => {
  const cols = 10;
  const cw = 118;
  const ch = 138;
  return (
    <Bg>
      {INDUSTRY_DRAFTS.slice(0, 40).map((d, i) => {
        const x = 50 + (i % cols) * cw + cw / 2 + 5;
        const y = 30 + Math.floor(i / cols) * (ch + 8);
        const t = interpolate(f, [8 + i * 4, 18 + i * 4], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
        const sx = Math.abs(Math.cos(t * Math.PI));
        const card = t >= 0.5;
        const r = d.roles[0];
        const fig = card ? characterSvg({ angles: POSES.stand, x: 0, groundY: 0, height: 92, facing: "right", view: "front", role: r.role, headwear: r.headwear, outfit: r.outfit }) : "";
        return (
          <g key={d.id} transform={`translate(${x} ${y + ch / 2}) scale(${Math.max(0.04, sx)} 1)`}>
            <rect x={-cw / 2 + 6} y={-ch / 2} width={cw - 12} height={ch} rx={8} fill={card ? "#fff" : "#fbf6e8"} stroke={card ? "#cbbf9c" : "#b9ad8f"} strokeWidth={2} />
            {!card && [0, 1, 2, 3].map((k) => <rect key={k} x={-cw / 2 + 18} y={-ch / 2 + 18 + k * 22} width={cw - 40} height={6} rx={3} fill="#bbb" />)}
            {card && <g transform={`translate(0 ${ch / 2 - 32})`} dangerouslySetInnerHTML={{ __html: fig }} />}
            {card && (
              <text y={ch / 2 - 10} textAnchor="middle" fontFamily={FONT_JP} fontSize={15} fontWeight={700} fill={INK}>
                {d.name}
              </text>
            )}
          </g>
        );
      })}
    </Bg>
  );
};
const End: React.FC<{ f: number }> = ({ f }) => (
  <Bg>
    <g transform={`translate(640 ${FCY}) scale(${FS}) translate(-640 -${FRAME.cy})`}>
      <StageFrame cx={640} open={1}>
        <rect width={FRAME.w - FRAME.inset * 2} height={FRAME.h - FRAME.inset * 2} fill="#fbf3dc" />
        <text x={(FRAME.w - FRAME.inset * 2) / 2} y={140} textAnchor="middle" fontFamily="Segoe Print, Comic Sans MS, cursive" fontSize={58} fontWeight={700} fill={INK}>
          Genba-Kamishibai
        </text>
        <text x={(FRAME.w - FRAME.inset * 2) / 2} y={230} textAnchor="middle" fontFamily={FONT_JP} fontSize={42} fontWeight={700} fill={INK} opacity={interpolate(f, [10, 30], [0, 1], clamp)}>
          めでたし、めでたし
        </text>
      </StageFrame>
    </g>
    <Person x={400} h={150} facing="right" />
    <Partner x={300} f={f} />
    <Person x={880} h={150} gold hair="short" facing="left" />
  </Bg>
);

// 機能の場面の録画（runs-video。dur は録画の長さの秒、from は使い始めの秒）
const CLIPS: Record<string, ClipPart[]> = {
  "f-fold": [{ src: "fold.mp4", dur: 6.04, slot: 8 }],
  "f-card": [{ src: "card.mp4", dur: 4.92, slot: 7 }],
  "f-check": [{ src: "danger.mp4", dur: 1.28, slot: 2 }, { src: "queue.mp4", dur: 13.12, slot: 5 }],
  // 経路の録画は、最後にスマホの幅に切り替えて確かめる所（1.95 秒から）を使わない
  "f-route": [{ src: "route.mp4", dur: 1.95, slot: 7 }],
  "f-sign": [{ src: "fix.mp4", dur: 4.84, slot: 4 }, { src: "sign.mp4", dur: 2.4, slot: 3 }, { src: "read.mp4", dur: 1.2, slot: 2 }],
};

const SegView: React.FC<{ seg: Seg }> = ({ seg }) => {
  const f = useCurrentFrame();
  const len = sec(seg.len);
  let body: React.ReactNode;
  switch (seg.id) {
    case "opening":
      body = <OffthreadVideo src={staticFile("opening.mp4")} muted />;
      break;
    case "portal":
      body = <OffthreadVideo src={staticFile("portal.mp4")} muted />;
      break;
    case "story": body = <Story f={f} />; break;
    case "uiux": body = <UiUx f={f} />; break;
    case "skills": body = <Skills f={f} />; break;
    case "guide": body = <Guide f={f} />; break;
    case "hearing": body = <Hearing f={f} len={len} />; break;
    case "industries": body = <Industries f={f} />; break;
    case "end": body = <End f={f} />; break;
    default:
      body = <Feature f={f} parts={CLIPS[seg.id]} kari={seg.kari} />;
  }
  return (
    <AbsoluteFill style={{ background: PURPLE }}>
      {body}
      {seg.kari && <Kari text={seg.kari} />}
      <Subtitle seg={seg} f={f} />
      <Draft />
    </AbsoluteFill>
  );
};

export const Full: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    {SEGS.map((s) => (
      <Sequence key={s.id} from={sec(s.at)} durationInFrames={sec(s.len)} name={s.title}>
        <SegView seg={s} />
      </Sequence>
    ))}
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
