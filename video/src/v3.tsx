// 台本 v3（11/7 夜 作者）: 本物の事故から始める 3 分。docs/video.md の「台本 v3」の秒に合わせる。
// 0:00〜0:26 の事故の 4 場面と、2:45〜3:00 の結びは、ここで新しく描く。0:26〜2:45 は v4 の通し（full.tsx）の絵をそのまま使い、
// 時刻だけを写し替える（下の MAP。v4 の何秒の絵を出すか。途中で飛ばさないので、絵は途切れずに速さだけが変わる）。
// 写真と事例シートは git の外の素材を video/prep-v3.py で out/pub/v3/ に整えて読む（他社の商品名はそこでぼかす）。
// レイヤーは v4 と同じ L1〜L5。字幕（L5）は v3 の言葉だけを出し、v4 の字幕と札は出さない。
// 音は入れない（0:00 の「バチッ」は、書き出したあとに音を重ねるときに入れる）。
import React from "react";
import { AbsoluteFill, Easing, Freeze, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { characterSvg } from "../../src/shared/picto/character";
import { frameAt } from "../../src/shared/picto/motion";
import { POSES } from "../../src/shared/picto/poses";
import { renderFrame } from "../../src/shared/picto/scene";
import { MOTION } from "../../tests/fixtures/card";
import { FullLayer } from "./full";
import { IntroLook } from "./intro";
import { L, LAYERS, LayerCtx } from "./layers";
import { SheetLook } from "./origami";
import { PAPER_EDGE, PAPER_FAR } from "./paper";
import { FONT_JP, FONT_PEN, WIN } from "./parts";
import { FPS, H, W } from "./timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.inOut(Easing.quad);
const prog = (t: number, t0: number, d = 0.3) => interpolate(t, [t0, t0 + d], [0, 1], clamp);

// ---- 場面の表（台本 v3 の秒） ----
export interface Seg3 { id: string; title: string; at: number; len: number; kari?: string }
export const SEGS3: Seg3[] = [
  { id: "accident", title: "事故: 作業服・眼鏡・包帯の顔・包帯の顔と両手・手（1 枚 2 秒）", at: 0, len: 10 },
  { id: "cause", title: "事故: 事例シートの見出しと原因", at: 10, len: 6 },
  { id: "meaning", title: "仕事の意味", at: 16, len: 6 },
  { id: "unread", title: "届かない（紙 1 枚・にじむ）", at: 22, len: 4 },
  { id: "title", title: "題（紙の人が枠を引く・紫・題）", at: 26, len: 7 },
  { id: "story", title: "むかしむかし（5 つの出来事）", at: 33, len: 9 },
  { id: "adventure", title: "冒険（ポータル・放り出し・TOMO）", at: 42, len: 7 },
  { id: "hearing", title: "ヒアリング", at: 49, len: 11, kari: "検電の場面の紙を足す（今は v4 のヒアリング）" },
  { id: "why", title: "なぜ（朝礼・約 257 万人）", at: 60, len: 5 },
  { id: "demo", title: "デモ（事例シートを入れる）", at: 65, len: 40 },
  { id: "notrans", title: "翻訳を入れない", at: 105, len: 5, kari: "この機能の画面が入る" },
  { id: "trial", title: "試したところ", at: 110, len: 20, kari: "割合は 071・072 のあと" },
  { id: "voice", title: "現場の声", at: 130, len: 22, kari: "ベテランの 3 つの声 → その日のうちに機能に" },
  { id: "spread", title: "広がり（事例の分類 → カード → ほかの業種）", at: 152, len: 13, kari: "事例の分類の紙を足す（作った枚数だけ）" },
  { id: "end", title: "結び（作業服・新人・街の明かり・題）", at: 165, len: 15 },
];
export const V3_FRAMES = 180 * FPS;

/** v3 の秒 → v4 の秒（[v3 の始め, v3 の終わり, v4 の始め, v4 の終わり]）。続けてつなぎ、飛ばさない */
export const MAP: [number, number, number, number][] = [
  [26, 30, 4, 13], // 折る・名のり・枠を引く（2.25 倍）。v4 の 0:04 は 2 枚の紙が置き場に着いた所
  [30, 31.5, 13, 16.5], // 紫・ライト
  [31.5, 33, 16.5, 19], // 扉が開いて題
  [33, 40.7, 19, 33], // むかしむかしの 5 つの出来事（約 1.8 倍）
  [40.7, 42, 33, 36], // よい画面は、ことばを越える
  [42, 49, 36, 55], // 支度・ポータル・放り出し・TOMO（約 2.7 倍）
  [49, 60, 55, 72.5], // ヒアリング
  [60, 65, 72.5, 76], // なぜ（メモの 257 万人）
  [65, 105, 76, 111], // 機能の録画
  [105, 110, 111, 116],
  [110, 130, 116, 140],
  [130, 152, 140, 165],
  [152, 165, 165, 174], // 粒にほどけて業種のカード
];
export const oldAt = (t: number): number | null => {
  for (const [a, b, c, d] of MAP) if (t >= a && t < b) return c + ((t - a) / (b - a)) * (d - c);
  return null;
};

// ---- 字幕（v3 の秒。画面の下の帯に 1 行・34 字まで） ----
const CUES3: [number, number, string][] = [
  [0.6, 4.0, "感電事故のあと、残った作業服と眼鏡。"],
  [4.2, 10.0, "そして、その人。"],
  [10.3, 16.0, "原因は、検電をしなかったこと。『止まっているはず』という思い込み"],
  [16.3, 22.0, "電気工事士は、街の電気を守る仕事。その現場は、命と隣り合わせ"],
  [22.3, 26.0, "この教訓は、日本語の紙 1 枚。読めなければ、届かない"],
  [33.0, 34.9, "昔々、パパ郎（父）とママ郎（母）がいました。"],
  [34.9, 36.9, "イチローは、ベトナムのホーチミンで生まれました。"],
  [36.9, 39.0, "日本人学校では、日本語が分からず黙っていました。"],
  [39.0, 40.7, "それでもゲームは、最後までクリアできました。"],
  [40.7, 43.0, "よい画面は、ことばを越える。"],
  [43.1, 44.6, "行き先は、電気業界。"],
  [47.0, 49.0, "光の粒が集まって、電気工事士の妖精 TOMO"],
  [50.0, 54.5, "事故は、自信と過信の際で起きる"],
  [55.0, 59.5, "1 動作 1 確認"],
  [60.0, 65.0, "現場に外国籍の子が増えてきています"],
  [65.5, 79.0, "この紙を入れると"],
  [79.5, 92.0, "絵だけで伝わるかを、別の AI が確かめる"],
  [92.5, 104.5, "人が直して署名したものだけが届く"],
  [105.0, 110.0, "（翻訳を入れない理由が入る）"],
  [110.0, 130.0, "（試したところ: 割合は 071・072 のあと）"],
  [130.0, 152.0, "（現場の声: ベテランの 3 つの声）"],
  [154.0, 164.0, "同じ仕組みで、ほかの事故も、ほかの業種も"],
  [166.5, 172.0, "電気工事士は、街の明かりを守っている。その人たちを、紙芝居で守る"],
  [172.5, 178.5, "事故を、1 件でも減らすために"],
];
const SUB_Y = 706;
const Subtitle3: React.FC<{ t: number }> = ({ t }) => {
  const cue = CUES3.find((c) => t >= c[0] && t < c[1]);
  if (!cue) return null;
  const [a, b, text] = cue;
  const rate = Math.max(22, text.length / ((b - a) * 0.55));
  const n = Math.min(text.length, Math.floor((t - a) * rate) + 1);
  const o = 1 - prog(t, b - 0.25, 0.25);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, opacity: o }}>
      <text x={W / 2} y={SUB_Y} textAnchor="middle" fontFamily={FONT_PEN} fontSize={20} fontWeight={700} fill="#fffaf0" stroke="#241c45" strokeWidth={5} strokeLinejoin="round" style={{ paintOrder: "stroke" }}>
        <tspan>{text.slice(0, n)}</tspan>
        <tspan fill="none" stroke="none">{text.slice(n)}</tspan>
      </text>
    </svg>
  );
};
const Kari3: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ position: "absolute", left: 16, top: 14, maxWidth: 260, display: "flex", alignItems: "flex-start", gap: 8, background: "#fff7d6", border: "3px solid #c0392b", borderRadius: 10, padding: "6px 10px", fontFamily: FONT_JP, fontSize: 15, fontWeight: 700, color: "#8e1f16", lineHeight: 1.3 }}>
    <span style={{ background: "#c0392b", color: "#fff", borderRadius: 6, padding: "0 7px", flexShrink: 0 }}>仮</span>
    {text}
  </div>
);
const Draft3: React.FC = () => <div style={{ position: "absolute", right: 16, top: 12, fontFamily: FONT_JP, fontSize: 15, color: "#fff", background: "rgba(0,0,0,0.45)", borderRadius: 6, padding: "2px 10px" }}>通しの仮版 v3 台本</div>;

// ---- 事故の写真（0:00〜0:10・1 枚 2 秒）: 黒地に、暗い所からゆっくり明るく・ゆるく寄る ----
const PHOTOS: { src: string; a: number; b: number }[] = [
  { src: "v3/a1.jpg", a: 0, b: 2.3 },
  { src: "v3/a2.jpg", a: 2.0, b: 4.3 },
  { src: "v3/a5.jpg", a: 4.0, b: 6.3 },
  { src: "v3/a6.jpg", a: 6.0, b: 8.3 },
  { src: "v3/a3.jpg", a: 8.0, b: 9.9 },
];
const Photo: React.FC<{ t: number; src: string; a: number; b: number }> = ({ t, src, a, b }) => {
  if (t < a || t >= b) return null;
  const first = a === 0;
  const inO = first ? interpolate(t, [0.05, 0.9], [0, 1], { ...clamp, easing: ease }) : prog(t, a, 0.3);
  const o = inO * (1 - prog(t, b - 0.3, 0.3));
  const light = first ? interpolate(t, [0.05, 1.7], [0.15, 1], { ...clamp, easing: ease }) : 1;
  const k = interpolate(t, [a, b], [1.0, 1.07], clamp);
  return (
    <AbsoluteFill style={{ opacity: o, filter: `brightness(${light})` }}>
      <Img src={staticFile(src)} style={{ position: "absolute", inset: 0, width: W, height: H, objectFit: "contain", transform: `scale(${k})` }} />
    </AbsoluteFill>
  );
};

// ---- 事例シート（0:09.6〜0:26）: 見出し → 原因へ寄る → 暗くする → 引いて紙 1 枚・にじむ ----
// sheet.png は 2400×2979。下の秒の所で、画面に出す紙の範囲（真ん中の x・y と幅）を決める
const SW = 2400;
const SH = 2979;
const VIEW_TITLE = { cx: 1229, cy: 452, w: 2300 };
const VIEW_TITLE2 = { cx: 1229, cy: 452, w: 2150 };
const VIEW_CAUSE = { cx: 1229, cy: 2180, w: 2300 };
const VIEW_PAGE = { cx: SW / 2, cy: SH / 2, w: (SH + 260) * (W / H) };
const lerpView = (a: typeof VIEW_TITLE, b: typeof VIEW_TITLE, p: number) => ({ cx: a.cx + (b.cx - a.cx) * p, cy: a.cy + (b.cy - a.cy) * p, w: a.w + (b.w - a.w) * p });
const sheetView = (t: number) => {
  if (t < 13) return lerpView(VIEW_TITLE, VIEW_TITLE2, interpolate(t, [9.6, 13], [0, 1], clamp));
  if (t < 22) return lerpView(VIEW_TITLE2, VIEW_CAUSE, interpolate(t, [13, 13.9], [0, 1], { ...clamp, easing: ease }));
  return lerpView(VIEW_CAUSE, VIEW_PAGE, interpolate(t, [22, 23.6], [0, 1], { ...clamp, easing: ease }));
};
/** 紙 1 枚の大きさ（引ききったとき） */
const PAGE_H = (H * SH) / (SH + 260);
const PAGE_W = (PAGE_H * SW) / SH;
const Sheet: React.FC<{ t: number }> = ({ t }) => {
  if (t < 9.6 || t >= 25.2) return null;
  const v = sheetView(t);
  const k = W / v.w;
  const o = prog(t, 9.6, 0.4) * (1 - prog(t, 24.7, 0.5));
  const dark = interpolate(t, [16, 16.6, 21.6, 22.4], [1, 0.28, 0.28, 1], clamp);
  const blur = interpolate(t, [23.2, 24.6], [0, 7], clamp);
  return (
    <AbsoluteFill style={{ opacity: o, overflow: "hidden" }}>
      <Img src={staticFile("v3/sheet.png")} style={{ position: "absolute", left: W / 2 - v.cx * k, top: H / 2 - v.cy * k, width: SW * k, height: SH * k, filter: `brightness(${dark}) blur(${blur}px)` }} />
    </AbsoluteFill>
  );
};
// 0:24.6〜0:26: 紙 1 枚が 2 枚の正方形に分かれて、折る置き場へ動きながら 45° 回って裏返る（v4 の 0:04 の 2 枚の紙に重なる）
const KF = 1.6 / Math.SQRT2;
const SLOTS = [{ x: 880, y: 420 }, { x: 400, y: 420 }];
const Split: React.FC<{ t: number }> = ({ t }) => {
  if (t < 24.5 || t >= 26) return null;
  const app = prog(t, 24.5, 0.3);
  const m = interpolate(t, [24.8, 26], [0, 1], { ...clamp, easing: ease });
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

// ---- 結び（2:45〜3:00）: 作業服に戻り、横に検電のカードを持つ新人。夜の街の明かりが灯り、題 ----
const CARD_SVG = renderFrame(frameAt(MOTION, 3)).svg;
const NEW_SVG = characterSvg({ angles: { ...POSES.stand, arm_near_upper: 70, arm_near_lower: 60 }, x: 0, groundY: 0, height: 300, facing: "left", view: "quarter", role: "new", headwear: "helmet" });
const BUILDINGS = Array.from({ length: 14 }, (_, i) => {
  const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
  return { x: i * 94 - 10, w: 70 + r * 26, h: 70 + ((r * 7) % 1) * 120 };
});
const City: React.FC<{ t: number }> = ({ t }) => (
  <g>
    {BUILDINGS.map((b, i) => (
      <g key={i}>
        <rect x={b.x} y={672 - b.h} width={b.w} height={b.h} fill="#1c2346" stroke="#2c3563" strokeWidth={2} />
        {Array.from({ length: Math.floor(b.h / 26) * 2 }, (_, j) => {
          const on = prog(t, 167.5 + ((i * 7 + j * 3) % 23) * 0.25, 0.25);
          return <rect key={j} x={b.x + 12 + (j % 2) * (b.w / 2 - 6)} y={672 - b.h + 12 + Math.floor(j / 2) * 26} width={b.w / 2 - 22} height={12} fill="#ffd968" opacity={on * 0.9} />;
        })}
      </g>
    ))}
    <rect y={672} width={W} height={H - 672} fill="#141a36" />
  </g>
);
const Ending: React.FC<{ t: number; layer: number }> = ({ t, layer }) => {
  if (t < 165) return null;
  const fade = prog(t, 165, 0.8);
  const photo = prog(t, 165.4, 1.0);
  const who = prog(t, 166.2, 0.6);
  const title = prog(t, 175, 1.0);
  return (
    <AbsoluteFill>
      {layer === 1 && <AbsoluteFill style={{ background: "#0e1430", opacity: fade }} />}
      {layer === 3 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, opacity: fade }}>
          <City t={t} />
          <image href={staticFile("v3/a1.jpg")} x={70} y={70} width={470} height={560} preserveAspectRatio="xMidYMid meet" opacity={photo} />
          <g opacity={title}>
            <text x={900} y={130} textAnchor="middle" fontFamily={FONT_PEN} fontSize={64} fontWeight={700} fill="#fffaf0">Genba-Kamishibai</text>
            <text x={900} y={176} textAnchor="middle" fontFamily={FONT_JP} fontSize={26} fill="#e8e2ff">現場紙芝居</text>
          </g>
        </svg>
      )}
      {layer === 4 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, opacity: fade * who }}>
          <g transform="translate(990 640)" dangerouslySetInnerHTML={{ __html: NEW_SVG }} />
          <g transform={`translate(700 330) rotate(-4)`}>
            <rect x={-8} y={-8} width={196} height={196} rx={12} fill="#fff" stroke="#c0392b" strokeWidth={8} />
            <g transform="scale(0.234)" dangerouslySetInnerHTML={{ __html: CARD_SVG.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "") }} />
          </g>
        </svg>
      )}
    </AbsoluteFill>
  );
};

// ---- デモ（1:05〜1:45）: 事例シートを入れた手元の録画を、紙芝居の窓に流す ----
const DEMO_AT = 65;
const DEMO_LEN = 40;
const Demo: React.FC<{ t: number }> = ({ t }) => {
  // 終わりは薄くしない（薄くすると下の v4 の録画が透ける）。次の場面へは v4 の紙めくりで移る
  const o = prog(t, DEMO_AT, 0.4);
  return (
    <Sequence from={DEMO_AT * FPS} durationInFrames={DEMO_LEN * FPS} layout="none">
      <div style={{ position: "absolute", left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h, background: "#fff", opacity: o, overflow: "hidden" }}>
        <OffthreadVideo src={staticFile("v3/demo.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
    </Sequence>
  );
};

// ---- 1 つのレイヤー ----
export const V3Layer: React.FC<{ layer: number }> = ({ layer }) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const old = oldAt(t);
  // 2:45 からの結びは v4 の 2:54 の絵の上に重ね、v4 の絵は薄くして消す
  const oldT = old ?? (t >= 165 ? 174 : null);
  const oldO = t >= 165 ? 1 - prog(t, 165, 0.8) : 1;
  const seg = [...SEGS3].reverse().find((s) => t >= s.at) ?? SEGS3[0];
  return (
    <LayerCtx.Provider value={layer}>
      <AbsoluteFill style={{ background: layer === 1 ? "#000" : undefined }}>
        {/* 0:00〜0:26 の新しい場面 */}
        {t < 26 && (
          <>
            {layer === 1 && <AbsoluteFill style={{ background: "#fbfaf5" }} />}
            {layer === 1 && <AbsoluteFill style={{ background: "#000", opacity: 1 - prog(t, 24.2, 1.2) }} />}
            {layer === 3 && (
              <>
                {PHOTOS.map((p) => <Photo key={p.src} t={t} {...p} />)}
                <Sheet t={t} />
                <Split t={t} />
              </>
            )}
          </>
        )}
        {/* 0:24〜2:45 は v4 の絵（字幕と札の L5 は出さない） */}
        {oldT !== null && layer >= 1 && layer <= 4 && oldO > 0 && (
          <AbsoluteFill style={{ opacity: oldO }}>
            <SheetLook.Provider value={{ image: staticFile("v3/fold.png") }}>
              <IntroLook.Provider value={{ bubble: "この紙を、紙芝居にします", bare: true }}>
                <Freeze frame={Math.round(oldT * FPS)}>
                  <FullLayer layer={layer} />
                </Freeze>
              </IntroLook.Provider>
            </SheetLook.Provider>
          </AbsoluteFill>
        )}
        {layer === 4 && <Demo t={t} />}
        <Ending t={t} layer={layer} />
        <L n={5}>
          <Subtitle3 t={t} />
          {seg.kari && <Kari3 text={seg.kari} />}
          <Draft3 />
        </L>
      </AbsoluteFill>
    </LayerCtx.Provider>
  );
};

/** 全部（L1〜L5 を下から重ねる。静止画と一覧と mp4 用） */
export const V3: React.FC = () => (
  <AbsoluteFill>
    {LAYERS.map((l) => (
      <AbsoluteFill key={l.id}>
        <V3Layer layer={l.n} />
      </AbsoluteFill>
    ))}
  </AbsoluteFill>
);
