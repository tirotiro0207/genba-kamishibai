// 冒頭の 8 場面。どの場面も「冒頭からのコマ g」で描くので、場面ごとに書き出しても 1 本につないでも同じ絵になる
import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { POSES } from "../../src/shared/picto/poses";
import { BODY_STEPS, Folding, JOIN_STEPS, type Layer, LEG_STEPS, SheetPatterns, type Step } from "./origami";
import { gait, mixAngles, PaperDefs, PaperPerson, type Pt, Shadow } from "./paper";
import { BrushPaper, Clocks, FLOOR, FLOOR_Y, FONT_HAND, FONT_JP, FRAME, Light, StageFrame, WobbleDefs } from "./parts";
import { ASIDE, CLOCKS, FIGURE_K, FOLD_AT, FPS, GROUND, H, INK, lengthOf, PAPER_K, PERSON_H, PRINT_FRAMES, PURPLE, type SceneId, startOf, STEP_FRAMES, TO_FOLD_FRAMES, W } from "./timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.inOut(Easing.cubic);
const sec = (s: number) => s * FPS;

const Svg: React.FC<{ bg?: string; children: React.ReactNode }> = ({ bg = "#fff", children }) => (
  <AbsoluteFill style={{ background: bg }}>
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <PaperDefs />
      <SheetPatterns />
      <WobbleDefs />
      {children}
    </svg>
  </AbsoluteFill>
);

/** 場面の中のコマ f と、冒頭からのコマ g */
const useScene = (id: SceneId) => {
  const f = useCurrentFrame();
  return { f, g: startOf(id) + f, len: lengthOf(id) };
};

// ---- 1 時計の比べ（0:00〜0:03） ----
export const S1Clocks: React.FC = () => {
  const { f, g } = useScene("s1-clocks");
  const appear = interpolate(f, [0, 10], [0, 1], clamp);
  const underline = interpolate(f, [sec(2.2), sec(2.9)], [0, 1], { ...clamp, easing: ease });
  return (
    <Svg>
      <Clocks g={g} opacity={appear} underline={underline} />
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
      <PaperPerson angles={angles} x={FOLD_AT.x} ground={GROUND} height={PERSON_H} view="front" opacity={swap} />
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
const WALK_END = sec(0.8);
/** 紙の人の手が枠の端に届く間（背の高さに合わせる） */
const HAND = (58 * PERSON_H) / 356;
const PULL_END = sec(2.05);
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
  } else {
    facing = "left";
    x = interpolate(f, [PULL_END, sec(2.9)], [edge - HAND, -260], { ...clamp, easing: Easing.in(Easing.quad) });
    angles = gait("run", (f - PULL_END) / sec(0.32));
  }
  const clocksOut = interpolate(f, [0, WALK_END], [0.35, 0], clamp);
  const bob = facing === "left" ? Math.abs(Math.sin(((f - PULL_END) / sec(0.32)) * Math.PI)) * -10 : 0;
  // 走り去る足元の土ぼこり
  const dust = f > PULL_END ? [0, 1, 2].map((i) => ({ x: x + 70 + i * 70, o: interpolate(f - PULL_END - i * 3, [0, 6, 18], [0, 0.5, 0], clamp), r: 16 + i * 6 })) : [];
  return (
    <Svg>
      {clocksOut > 0 && <Clocks g={g} underline={1} opacity={clocksOut} />}
      <StageFrame cx={cx} />
      {dust.map((p, i) => (
        <circle key={i} cx={p.x} cy={GROUND - 6} r={p.r} fill="#c8bfae" opacity={p.o} />
      ))}
      <Shadow x={x} ground={GROUND} w={110} />
      <PaperPerson angles={angles} x={x} ground={GROUND + bob} height={PERSON_H} facing={facing} />
    </Svg>
  );
};

// ---- 7 開演: 紫に暗転して、ライトが 2 つ入る ----
const lightsAt = (g: number) => {
  const s = startOf("s7-curtain");
  const o = interpolate(g, [s + sec(0.6), s + sec(1.3)], [0, 1], clamp);
  const drift = interpolate(g, [s + sec(0.6), s + sec(4)], [0, 1], clamp);
  return [
    { x: 470 + drift * 30, y: 270, r: 170, o },
    { x: 820 - drift * 30, y: 380, r: 190, o },
  ];
};
export const S7Curtain: React.FC = () => {
  const { f, g } = useScene("s7-curtain");
  const dark = interpolate(f, [0, sec(0.5)], [0, 1], { ...clamp, easing: ease });
  return (
    <Svg>
      <rect width={W} height={H} fill={PURPLE} opacity={dark} />
      <rect y={FLOOR_Y} width={W} height={H - FLOOR_Y} fill={FLOOR} opacity={dark} />
      <StageFrame cx={W / 2} />
      {lightsAt(g).map((l, i) => (
        <Light key={i} id={`l${i}`} x={l.x} y={l.y} r={l.r} opacity={l.o} />
      ))}
    </Svg>
  );
};

// ---- 8 題: 扉が開いて「Genba-Kamishibai」 ----
export const S8Title: React.FC = () => {
  const { f, g } = useScene("s8-title");
  const open = interpolate(f, [2, sec(1.1)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const glow = interpolate(f, [sec(0.6), sec(1.4)], [0, 1], clamp);
  const iw = FRAME.w - FRAME.inset * 2;
  const ih = FRAME.h - FRAME.inset * 2;
  return (
    <Svg bg={PURPLE}>
      <rect y={FLOOR_Y} width={W} height={H - FLOOR_Y} fill={FLOOR} />
      <StageFrame cx={W / 2} open={open}>
        <TitlePaper iw={iw} ih={ih} o={interpolate(f, [sec(0.4), sec(1.0)], [0, 1], clamp)} />
      </StageFrame>
      {lightsAt(g).map((l, i) => (
        <Light key={i} id={`l${i}`} x={l.x} y={l.y} r={l.r * (1 + glow * 0.25)} opacity={l.o * (1 - glow * 0.35)} />
      ))}
    </Svg>
  );
};

/** 題の紙: 枠の奥の暗い板に、筆でこすったような白い紙を貼り、手書きの題（通しの版でも同じ絵を使う） */
export const TitlePaper: React.FC<{ iw: number; ih: number; o?: number; sub?: string; subO?: number }> = ({ iw, ih, o = 1, sub, subO = 1 }) => (
  <>
    <rect width={iw} height={ih} fill="#3b2a1a" />
    <BrushPaper x={iw * 0.08} y={ih * 0.12} w={iw * 0.84} h={ih * 0.76} />
    <g filter="url(#wobble)">
      <text x={iw / 2} y={sub ? ih / 2 - 10 : ih / 2 + 22} textAnchor="middle" fontFamily={FONT_HAND} fontSize={56} fontWeight={700} fill={INK} opacity={o}>
        Genba-Kamishibai
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
