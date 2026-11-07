// 冒頭の 8 場面。どの場面も「冒頭からのコマ g」で描くので、場面ごとに書き出しても 1 本につないでも同じ絵になる
// 通しの v4（full.tsx）が使うのは s7-curtain と s8-title だけ。s1〜s6 は前の版（0:00〜0:13 は今は intro.tsx）で、書き出し直せるように残す
import React from "react";
import { L, useLayer } from "./layers";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { POSES } from "../../src/shared/picto/poses";
import { BODY_STEPS, Folding, JOIN_STEPS, type Layer, LEG_STEPS, SheetPatterns, type Step } from "./origami";
import { gait, mixAngles, PaperDefs, PaperPerson, type Pt, Shadow } from "./paper";
import { BrushPaper, Clocks, FLOOR, FLOOR_Y, FONT_HAND, FONT_JP, FONT_PEN, FRAME, LightRings, StageFrame, StageLamps, WIN, doorCover, doorDeg, WobbleDefs } from "./parts";
import { ASIDE, CLOCKS, FIGURE_K, FOLD_AT, FPS, GROUND, H, INK, lengthOf, PAPER_K, PERSON_H, PRINT_FRAMES, PURPLE, type SceneId, startOf, STEP_FRAMES, TO_FOLD_FRAMES, W } from "./timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.inOut(Easing.cubic);
const sec = (s: number) => s * FPS;

/** bgLayer を渡すと、地の色はそのレイヤー（と全部を描くとき）だけ塗る */
const Svg: React.FC<{ bg?: string; bgLayer?: number; children: React.ReactNode }> = ({ bg = "#fff", bgLayer, children }) => {
  const l = useLayer();
  const paint = bgLayer === undefined || l === 0 || l === bgLayer;
  return (
  <AbsoluteFill style={{ background: paint ? bg : "transparent" }}>
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <PaperDefs />
      <SheetPatterns />
      <WobbleDefs />
      {children}
    </svg>
  </AbsoluteFill>
  );
};

/** 場面の中のコマ f と、冒頭からのコマ g */
const useScene = (id: SceneId) => {
  const f = useCurrentFrame();
  return { f, g: startOf(id) + f, len: lengthOf(id) };
};

// ---- 1 時計の比べ（0:00〜0:03） ----
export const S1Clocks: React.FC = () => {
  const { f, g } = useScene("s1-clocks");
  // 0:00.5 左の見出しを 1 文字ずつ → 0:01.5 右の見出し → 0:02.0 左の時計 → 0:02.5 右の時計 → 下線
  const p = (a: number, b: number) => interpolate(f, [sec(a), sec(b)], [0, 1], clamp);
  const underline = interpolate(f, [sec(2.4), sec(2.8)], [0, 1], { ...clamp, easing: ease });
  return (
    <Svg>
      {/* うすい紙の目 */}
      <rect width={W} height={H} fill="#fbfaf5" />
      <Clocks g={g} underline={underline} draw={[p(0.5, 1.4), p(1.5, 2.0), p(2.0, 2.45), p(2.5, 2.8)]} />
    </Svg>
  );
};

// ---- 印刷と折る（2 枚の紙を 1 枚ずつ） ----
const LINE_Y = CLOCKS.labelY + 20;
const FOLD_START = PRINT_FRAMES + TO_FOLD_FRAMES;
/** 紙の置き場: 下線の下から正方形が出てきて（下線より上は切る）、折る所へ動く */
function printed(f: number) {
  const out = interpolate(f, [0, PRINT_FRAMES], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const move = interpolate(f, [PRINT_FRAMES, FOLD_START], [0, 1], { ...clamp, easing: ease });
  const y0 = LINE_Y - 100 * PAPER_K + out * 200 * PAPER_K;
  return { x: interpolate(move, [0, 1], [CLOCKS.text, FOLD_AT.x]), y: interpolate(move, [0, 1], [y0, FOLD_AT.y]), clip: move < 0.02, slot: 1 - move };
}
const stepP = (f: number, n: number) => Math.min(n - 0.001, Math.max(0, (f - FOLD_START) / STEP_FRAMES));

const Printing: React.FC<{ f: number; steps: Step[]; pattern: string }> = ({ f, steps, pattern }) => {
  const p = printed(f);
  return (
    <>
      <defs>
        <clipPath id="below-line">
          <rect x={0} y={LINE_Y} width={W} height={H} />
        </clipPath>
      </defs>
      <rect x={CLOCKS.text - 104 * PAPER_K} y={LINE_Y - 4} width={208 * PAPER_K} height={8} rx={4} fill={INK} opacity={p.slot} />
      <g clipPath={p.clip ? "url(#below-line)" : undefined}>
        <g transform={`translate(${p.x} ${p.y}) scale(${PAPER_K})`}>
          <Folding steps={steps} p={stepP(f, steps.length)} pattern={pattern} />
        </g>
      </g>
    </>
  );
};

/** 折り終えた脚の部品を、横に置いておく */
const LegsAside: React.FC<{ t?: number }> = ({ t = 1 }) => {
  const x = interpolate(t, [0, 1], [FOLD_AT.x, ASIDE.x]);
  const y = interpolate(t, [0, 1], [FOLD_AT.y, ASIDE.y]);
  const k = interpolate(t, [0, 1], [PAPER_K, ASIDE.k]);
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <Folding steps={LEG_STEPS} p={LEG_STEPS.length - 0.001} pattern="sheet-legs" />
    </g>
  );
};

// ---- 2 印刷と脚の紙（0:03〜） ----
export const S2Legs: React.FC = () => {
  const { f, g, len } = useScene("s2-legs");
  const foldEnd = FOLD_START + LEG_STEPS.length * STEP_FRAMES;
  const aside = interpolate(f, [foldEnd, len - 1], [0, 1], { ...clamp, easing: ease });
  return (
    <Svg>
      <Clocks g={g} underline={1} opacity={interpolate(f, [FOLD_START - 6, FOLD_START], [1, 0.35], clamp)} />
      {f < foldEnd ? <Printing f={f} steps={LEG_STEPS} pattern="sheet-legs" /> : <LegsAside t={aside} />}
    </Svg>
  );
};

// ---- 3 印刷と体の紙 ----
export const S3Body: React.FC = () => {
  const { f, g } = useScene("s3-body");
  return (
    <Svg>
      <Clocks g={g} underline={1} opacity={0.35} />
      <LegsAside />
      <Printing f={f} steps={BODY_STEPS} pattern="sheet-body" />
    </Svg>
  );
};

// ---- 4 組む・仕上げ（紙の人の座標で描く。床が y 0） ----
const FIG = `translate(${FOLD_AT.x} ${GROUND}) scale(${FIGURE_K})`;
const toFig = (poly: Pt[], x: number, y: number, k: number): Pt[] => poly.map(([px, py]) => [(x + px * k - FOLD_AT.x) / FIGURE_K, (y + py * k - GROUND) / FIGURE_K] as Pt);
/** 組む前の 2 つの部品（脚は横に置いた所、体は折った所）を、紙の人の座標に移したもの。ここから C1 へ動く */
const BEFORE_JOIN: Step = (() => {
  const legs = LEG_STEPS[LEG_STEPS.length - 1].layers;
  const body = BODY_STEPS[BODY_STEPS.length - 1].layers;
  const layers: Layer[] = [
    ...legs.map((l) => ({ ...l, poly: toFig(l.poly, ASIDE.x, ASIDE.y, ASIDE.k) })),
    ...body.map((l) => ({ ...l, poly: toFig(l.poly, FOLD_AT.x, FOLD_AT.y, PAPER_K), fill: l.fill ? "torso-j-up" : undefined })),
  ];
  return { id: "before", label: "", layers };
})();
/** 組む手順の進み: C1・C2 を 1 手順ずつ、C2 のあとに 9 コマ（0.3 秒）止め、仕上げ 5 手順を 1 手順ずつ */
const SNAP_HOLD = 9;
const joinP = (f: number) => {
  if (f < 2 * STEP_FRAMES) return f / STEP_FRAMES;
  if (f < 2 * STEP_FRAMES + SNAP_HOLD) return 1.999;
  return Math.min(JOIN_STEPS.length - 0.001, 2 + (f - 2 * STEP_FRAMES - SNAP_HOLD) / STEP_FRAMES);
};
const Joined: React.FC<{ p: number; pop?: number; opacity?: number }> = ({ p, pop = 1, opacity = 1 }) => (
  <g transform={`${FIG} scale(${pop})`} opacity={opacity}>
    <Folding steps={JOIN_STEPS} p={p} pattern="sheet-body" prev={BEFORE_JOIN} />
  </g>
);
export const S4Join: React.FC = () => {
  const { f, g } = useScene("s4-join");
  const snapAt = 2 * STEP_FRAMES - 1;
  const pop = f >= snapAt && f < snapAt + 6 ? 1 + 0.05 * Math.sin(((f - snapAt) / 6) * Math.PI) : 1;
  return (
    <Svg>
      <Clocks g={g} underline={1} opacity={0.35} />
      <Shadow x={FOLD_AT.x} ground={GROUND} w={110} opacity={interpolate(f, [0, 8], [0, 0.18], clamp)} />
      <Joined p={joinP(f)} pop={pop} />
    </Svg>
  );
};

// ---- 5 名のり ----
const LINE = ["現場の安全の貼り紙や決まりを、", "紙芝居にします"];
export const S5Name: React.FC = () => {
  const { f, g, len } = useScene("s5-name");
  // できあがった折り紙の形から、骨格で動かす紙の人へ 6 コマで入れ替える
  const swap = interpolate(f, [0, 6], [0, 1], clamp);
  const chars = LINE.join("").length;
  const shown = Math.floor(interpolate(f, [4, len - 24], [0, chars], clamp));
  const wave = Math.sin((f / FPS) * Math.PI * 3);
  const angles = mixAngles(POSES.stand, POSES.wave, interpolate(f, [4, 12], [0, 1], clamp) * (0.75 + 0.25 * wave));
  const bub = interpolate(f, [2, 8], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2)) });
  let left = shown;
  // 吹き出しは 2 行に固定（行の途中では折り返さない）
  const lines = LINE.map((l) => {
    const n = Math.max(0, Math.min(l.length, left));
    left -= l.length;
    return l.slice(0, n);
  });
  return (
    <Svg>
      <Clocks g={g} underline={1} opacity={0.35} />
      <Shadow x={FOLD_AT.x} ground={GROUND} w={110} />
      {swap < 1 && <Joined p={JOIN_STEPS.length - 0.001} opacity={1 - swap} />}
      <PaperPerson angles={angles} x={FOLD_AT.x} ground={GROUND - Math.max(0, Math.sin(((f - 40) / 10) * Math.PI)) * (f >= 40 && f < 50 ? 30 : 0)} height={PERSON_H} view="front" opacity={swap} />
      <g transform={`translate(${FOLD_AT.x + 230} 150) scale(${bub * 0.85})`}>
        <path d="M-150 -60H380Q400 -60 400 -40V60Q400 80 380 80H-40L-100 120L-90 80H-150Q-170 80 -170 60V-40Q-170 -60 -150 -60Z" fill="#fff" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
        {lines.map((l, i) => (
          <text key={i} x={-140} y={-6 + i * 50} fontFamily={FONT_JP} fontSize={32} fontWeight={700} fill={INK}>
            {l}
          </text>
        ))}
      </g>
    </Svg>
  );
};

// ---- 6 枠を引っぱる ----
// 歩いて右の枠の端へ → 枠をつかんで後ろ向きに引き、中央まで運ぶ → 手を放して左へ走り去る
const WALK_END = sec(0.5);
/** 紙の人の手が枠の端に届く間（背の高さに合わせる） */
const HAND = (58 * PERSON_H) / 356;
// v4: 枠が大きくなった分、重そうに 0.2 秒遅く着き、大きく弾む
const PULL_END = sec(1.7);
const RUN_AT = sec(2.0);
const frameCx = (f: number) =>
  f < WALK_END
    ? interpolate(f, [0, WALK_END], [W + FRAME.w / 2 + 40, W + FRAME.w / 2 - 170], { ...clamp, easing: Easing.out(Easing.quad) })
    : interpolate(f, [WALK_END, PULL_END], [W + FRAME.w / 2 - 170, W / 2], { ...clamp, easing: Easing.inOut(Easing.quad) });
export const S6Pull: React.FC = () => {
  const { f, g } = useScene("s6-pull");
  const cx = frameCx(f);
  const edge = cx - FRAME.w / 2;
  let x: number;
  let angles;
  let facing: "left" | "right" = "right";
  if (f < WALK_END) {
    x = interpolate(f, [0, WALK_END], [FOLD_AT.x, W + FRAME.w / 2 - 170 - FRAME.w / 2 - HAND], { ...clamp, easing: Easing.inOut(Easing.quad) });
    angles = gait("walk", f / sec(0.5));
  } else if (f < PULL_END) {
    x = edge - HAND;
    // 引く: 足を交互に後ろへ運びながら、体を後ろへ預ける
    const step = gait("walk", (f - WALK_END) / sec(0.45));
    angles = mixAngles(POSES.pull, { ...POSES.pull, leg_near_upper: step.leg_near_upper, leg_near_lower: step.leg_near_lower, leg_far_upper: step.leg_far_upper, leg_far_lower: step.leg_far_lower }, 0.6);
  } else if (f < RUN_AT) {
    // 枠が止まって小さく弾む間、手を放して立つ
    x = edge - HAND;
    angles = mixAngles(POSES.pull, POSES.stand, interpolate(f, [PULL_END, RUN_AT], [0, 1], clamp));
  } else {
    facing = "left";
    x = interpolate(f, [RUN_AT, sec(2.6)], [edge - HAND, -300], { ...clamp, easing: Easing.in(Easing.quad) });
    angles = gait("run", (f - RUN_AT) / sec(0.2));
  }
  const clocksOut = interpolate(f, [sec(2.5), sec(3)], [0.35, 0], clamp);
  const bob = facing === "left" ? Math.abs(Math.sin(((f - RUN_AT) / sec(0.2)) * Math.PI)) * -14 : 0;
  // 枠が止まったときの弾み（0:11.5）と、ほこり
  const bounce = f >= PULL_END && f < PULL_END + 10 ? Math.sin(((f - PULL_END) / 10) * Math.PI) * -16 : 0;
  const puff = interpolate(f - PULL_END, [0, 6, 22], [0, 0.55, 0], clamp);
  const tata = interpolate(f, [RUN_AT, RUN_AT + 4, sec(2.9)], [0, 1, 0], clamp);
  // 走り去る足元の土ぼこり
  const dust = f > RUN_AT ? [0, 1, 2].map((i) => ({ x: x + 70 + i * 70, o: interpolate(f - RUN_AT - i * 3, [0, 6, 18], [0, 0.5, 0], clamp), r: 16 + i * 6 })) : [];
  return (
    <Svg>
      {clocksOut > 0 && <Clocks g={g} underline={1} opacity={clocksOut} />}
      <g transform={`translate(0 ${bounce})`}>
        <StageFrame cx={cx} />
      </g>
      {puff > 0 && [-1, -0.4, 0.4, 1].map((k) => <ellipse key={k} cx={W / 2 + k * (FRAME.w / 2)} cy={FRAME.cy + FRAME.h / 2 + 18 - puff * 10} rx={40 + puff * 40} ry={14 + puff * 8} fill="#d8cfbf" opacity={puff} />)}
      {/* 「タタタ」と速さの線 */}
      {tata > 0 && (
        <g opacity={tata}>
          {[0, 1, 2].map((i) => <path key={i} d={`M${x + 90 + i * 10} ${GROUND - 300 + i * 70}h${120 + i * 30}`} stroke={INK} strokeWidth={4} strokeLinecap="round" filter="url(#wobble)" />)}
          <text x={Math.max(60, x + 60)} y={GROUND - 20} fontFamily={FONT_PEN} fontSize={44} fill={INK} transform={`rotate(-8 ${Math.max(60, x + 60)} ${GROUND - 20})`}>
            タタタ
          </text>
        </g>
      )}
      {dust.map((p, i) => (
        <circle key={i} cx={p.x} cy={GROUND - 6} r={p.r} fill="#c8bfae" opacity={p.o} />
      ))}
      <Shadow x={x} ground={GROUND} w={110} />
      <PaperPerson angles={angles} x={x} ground={GROUND + bob} height={PERSON_H} facing={facing} />
    </Svg>
  );
};

// ---- 7 開演（0:13.0〜0:16.5）: 画面のふちから紫に染まり、ステージライトが上から 1 つずつ下りる。光の丸がぐるぐる回って、真ん中で焦点が合う ----
export const S7Curtain: React.FC = () => {
  const { f, g } = useScene("s7-curtain");
  const edge = interpolate(f, [0, sec(0.3)], [0, 1], { ...clamp, easing: ease });
  const dark = interpolate(f, [sec(0.15), sec(0.5)], [0, 1], { ...clamp, easing: ease });
  return (
    <Svg bgLayer={1}>
      <defs>
        <radialGradient id="edge-in" cx="50%" cy="50%" r="75%">
          <stop offset="35%" stopColor={PURPLE} stopOpacity={0} />
          <stop offset="100%" stopColor={PURPLE} stopOpacity={1} />
        </radialGradient>
      </defs>
      <L n={1}>
        <rect width={W} height={H} fill="url(#edge-in)" opacity={edge} />
        <rect width={W} height={H} fill={PURPLE} opacity={dark} />
        <rect y={FLOOR_Y} width={W} height={H - FLOOR_Y} fill={FLOOR} opacity={dark * 0.9} />
      </L>
      <L n={2}>
        <StageFrame cx={W / 2} open={0} />
        <StageLamps t={g / FPS} />
      </L>
    </Svg>
  );
};

// ---- 8 扉と題（0:16.5〜0:19.0）: 扉が外へパカッと開く（0.7 秒）→ 筆が「Genba-Kamishibai」を 1 文字ずつ書く。0:17.5 に光の輪が広がる ----
export const S8Title: React.FC = () => {
  const { f, g } = useScene("s8-title");
  const t = g / FPS;
  const chars = interpolate(t, [17.2, 18.5], [0, 1], clamp);
  const ring = interpolate(t, [17.5, 18.1], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const deg = doorDeg(f / FPS);
  const cover = doorCover(deg);
  return (
    <Svg bg={PURPLE} bgLayer={1}>
      <L n={1}>
        <rect y={FLOOR_Y} width={W} height={H - FLOOR_Y} fill={FLOOR} />
      </L>
      <L n={2}>
        <StageFrame cx={W / 2} deg={deg} />
        <LightRings o={ring} k={0.9 + ring * 0.1} />
        <StageLamps t={t} />
      </L>
      {/* 題の紙は L3。L2 の扉より上に重なるので、扉がかぶっている所は切り取る */}
      <L n={3}>
        <svg x={WIN.x} y={WIN.y} width={WIN.w} height={WIN.h} viewBox={`0 0 ${WIN.w} ${WIN.h}`}>
          <clipPath id="title-door"><rect x={cover} y={-20} width={Math.max(0, WIN.w - cover * 2)} height={WIN.h + 40} /></clipPath>
          <g clipPath="url(#title-door)">
            <g filter="url(#wobble)"><TitlePaper iw={WIN.w} ih={WIN.h} p={chars} /></g>
          </g>
        </svg>
      </L>
    </Svg>
  );
};

const TITLE = "Genba-Kamishibai";
/** 題の紙: 枠の奥の暗い板に、筆でこすったような白い紙を貼り、手書きの題（通しの版でも同じ絵を使う） */
export const TitlePaper: React.FC<{ iw: number; ih: number; o?: number; sub?: string; subO?: number; p?: number }> = ({ iw, ih, o = 1, sub, subO = 1, p = 1 }) => (
  <>
    <rect width={iw} height={ih} fill="#fffdf6" />
    <BrushPaper x={iw * 0.02} y={ih * 0.03} w={iw * 0.96} h={ih * 0.94} rot={-0.6} />
    <g filter="url(#wobble)">
      <text x={iw / 2} y={sub ? ih / 2 - 10 : ih / 2 + 22} textAnchor="middle" fontFamily={FONT_HAND} fontSize={68} fontWeight={700} fill={INK} opacity={o}>
        <tspan>{TITLE.slice(0, Math.ceil(TITLE.length * p))}</tspan>
        <tspan fill="transparent">{TITLE.slice(Math.ceil(TITLE.length * p))}</tspan>
      </text>
      {sub && (
        <text x={iw / 2} y={ih / 2 + 70} textAnchor="middle" fontFamily={FONT_JP} fontSize={40} fontWeight={700} fill={INK} opacity={subO}>
          {sub}
        </text>
      )}
    </g>
  </>
);

export const SCENE_COMPONENTS: Record<SceneId, React.FC> = {
  "s1-clocks": S1Clocks,
  "s2-legs": S2Legs,
  "s3-body": S3Body,
  "s4-join": S4Join,
  "s5-name": S5Name,
  "s6-pull": S6Pull,
  "s7-curtain": S7Curtain,
  "s8-title": S8Title,
};
