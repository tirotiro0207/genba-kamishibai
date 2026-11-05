// 冒頭の 7 場面。どの場面も「冒頭からのコマ g」で描くので、場面ごとに書き出しても 1 本につないでも同じ絵になる
import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { POSES } from "../../src/shared/picto/poses";
import { d, foldAt, FOLDS, gait, mixAngles, PAPER_EDGE, PaperDefs, PaperPerson, Shadow } from "./paper";
import { Clocks, FONT_JP, FRAME, Light, StageFrame } from "./parts";
import { CLOCKS, FOLD_AT, FPS, GROUND, H, INK, lengthOf, PAPER_K, PURPLE, type SceneId, startOf, W } from "./timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.inOut(Easing.cubic);
const sec = (s: number) => s * FPS;

const Svg: React.FC<{ bg?: string; children: React.ReactNode }> = ({ bg = "#fff", children }) => (
  <AbsoluteFill style={{ background: bg }}>
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <PaperDefs />
      {children}
    </svg>
  </AbsoluteFill>
);

/** 場面の中のコマ f と、冒頭からのコマ g */
const useScene = (id: SceneId) => {
  const f = useCurrentFrame();
  return { f, g: startOf(id) + f, len: lengthOf(id) };
};

/** 紙 1 枚（200×400 の折り紙の形を、中心 (x,y)・倍率 k で置く） */
const Sheet: React.FC<{ x: number; y: number; k: number; top: [number, number][]; bottom: [number, number][]; creases?: [[number, number], [number, number]][]; fresh?: [[number, number], [number, number]][]; t?: number; lift?: number }> = ({
  x, y, k, top, bottom, creases = [], fresh = [], t = 1, lift = 0,
}) => (
  <g transform={`translate(${x} ${y}) scale(${k})`}>
    <g transform={`translate(${lift * 0.3} ${lift})`} opacity={0.16}>
      <path d={d(top)} fill="#000" />
      <path d={d(bottom)} fill="#000" />
    </g>
    <g fill="url(#paper)" stroke={PAPER_EDGE} strokeWidth={2.5 / k} strokeLinejoin="round">
      <path d={d(bottom)} />
      <path d={d(top)} />
    </g>
    {/* 折り目は今の紙の形の中だけに描く（形が変わると、前の折り目は紙の外へ出るので切る） */}
    <clipPath id="sheet-clip">
      <path d={d(top)} />
      <path d={d(bottom)} />
    </clipPath>
    <g clipPath="url(#sheet-clip)">
      {creases.map(([a, b], i) => (
        <path key={i} d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} stroke={PAPER_EDGE} strokeWidth={1.5 / k} opacity={0.45} />
      ))}
      {fresh.map(([a, b], i) => (
        <path key={`n${i}`} d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} stroke={INK} strokeWidth={2.5 / k} opacity={0.5 * Math.sin(t * Math.PI)} strokeDasharray="6 6" />
      ))}
    </g>
  </g>
);

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

// 印刷の紙の動き: 下線の下から紙が出てきて、折る所（中央）へ動く
const PRINT_OUT = sec(1.1);
const paperPath = (f: number) => {
  const lineY = CLOCKS.labelY + 20;
  const h = 400 * PAPER_K;
  // 出てくる間は、紙の上の端が下線の所にあり、下へ伸びる（下線より上は切る）
  const out = interpolate(f, [0, PRINT_OUT], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const move = interpolate(f, [PRINT_OUT, sec(1.9)], [0, 1], { ...clamp, easing: ease });
  const y0 = lineY - h / 2 + out * h; // 紙の中心
  const x = interpolate(move, [0, 1], [CLOCKS.text, FOLD_AT.x]);
  const y = interpolate(move, [0, 1], [y0, FOLD_AT.y]);
  return { x, y, lineY, clip: move < 0.02, out };
};

// ---- 2 印刷（0:03〜0:05） ----
export const S2Print: React.FC = () => {
  const { f, g } = useScene("s2-print");
  const p = paperPath(f);
  const firstSheet = FOLDS[0];
  return (
    <Svg>
      <Clocks g={g} underline={1} />
      <defs>
        <clipPath id="below-line">
          <rect x={0} y={p.lineY} width={W} height={H} />
        </clipPath>
      </defs>
      {/* 印刷の口（下線の所の細い隙間） */}
      <rect x={CLOCKS.text - 96} y={p.lineY - 4} width={192} height={8} rx={4} fill={INK} opacity={interpolate(f, [PRINT_OUT, sec(1.5)], [1, 0], clamp)} />
      <g clipPath={p.clip ? "url(#below-line)" : undefined}>
        <Sheet x={p.x} y={p.y} k={PAPER_K} top={firstSheet.top} bottom={firstSheet.bottom} lift={interpolate(f, [PRINT_OUT, sec(1.9)], [0, 14], clamp)} />
      </g>
    </Svg>
  );
};

// ---- 3 折り紙 ①（0:05〜0:08。8 コマを 0.35 秒ずつ） ----
const STEP = 0.35 * FPS;
export const S3Origami: React.FC = () => {
  const { f, g } = useScene("s3-origami");
  const p = Math.min(FOLDS.length - 1, f / STEP);
  const s = foldAt(p);
  // 7 コマ目（体を脚にかぶせる）で、パチンと少し弾む
  const snapAt = 6 * STEP;
  const pop = f > snapAt && f < snapAt + 6 ? 1 + 0.06 * Math.sin(((f - snapAt) / 6) * Math.PI) : 1;
  // 8 コマ目で立ったら、ピクトグラムの骨格の紙の人に入れ替える（形は同じ大きさ）
  const swap = interpolate(f, [7 * STEP + 2, 7 * STEP + 8], [0, 1], clamp);
  return (
    <Svg>
      <Clocks g={g} underline={1} opacity={0.35} />
      <g opacity={1 - swap}>
        <Sheet x={FOLD_AT.x} y={FOLD_AT.y} k={PAPER_K * pop} top={s.top} bottom={s.bottom} creases={s.creases} fresh={s.fresh} t={s.t} lift={14} />
      </g>
      {swap > 0 && (
        <>
          <Shadow x={FOLD_AT.x} ground={GROUND} opacity={0.18 * swap} />
          <PaperPerson angles={POSES.stand} x={FOLD_AT.x} ground={GROUND} view="front" opacity={swap} />
        </>
      )}
    </Svg>
  );
};

// ---- 4 名のり（0:08〜0:10） ----
const LINE = ["現場の安全の貼り紙や決まりを、", "紙芝居にします"];
export const S4Name: React.FC = () => {
  const { f, g, len } = useScene("s4-name");
  const chars = LINE.join("").length;
  const shown = Math.floor(interpolate(f, [4, len - 14], [0, chars], clamp));
  const wave = Math.sin((f / FPS) * Math.PI * 3);
  const angles = mixAngles(POSES.stand, POSES.wave, interpolate(f, [0, 8], [0, 1], clamp) * (0.75 + 0.25 * wave));
  const bub = interpolate(f, [0, 6], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2)) });
  let left = shown;
  const lines = LINE.map((l) => {
    const n = Math.max(0, Math.min(l.length, left));
    left -= l.length;
    return l.slice(0, n);
  });
  return (
    <Svg>
      <Clocks g={g} underline={1} opacity={0.35} />
      <Shadow x={FOLD_AT.x} ground={GROUND} />
      <PaperPerson angles={angles} x={FOLD_AT.x} ground={GROUND} view="front" />
      <g transform={`translate(${FOLD_AT.x + 160} 150) scale(${bub})`}>
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

// ---- 5 枠を引っぱる（0:10〜0:13） ----
// 歩いて右の枠の端へ → 枠をつかんで後ろ向きに引き、中央まで運ぶ → 手を放して左へ走り去る
const WALK_END = sec(0.8);
const PULL_END = sec(2.05);
const frameCx = (f: number) =>
  f < WALK_END
    ? interpolate(f, [0, WALK_END], [W + FRAME.w / 2 + 40, W + FRAME.w / 2 - 170], { ...clamp, easing: Easing.out(Easing.quad) })
    : interpolate(f, [WALK_END, PULL_END], [W + FRAME.w / 2 - 170, W / 2], { ...clamp, easing: Easing.inOut(Easing.quad) });
export const S5Pull: React.FC = () => {
  const { f, g } = useScene("s5-pull");
  const cx = frameCx(f);
  const edge = cx - FRAME.w / 2;
  let x: number;
  let angles;
  let facing: "left" | "right" = "right";
  if (f < WALK_END) {
    x = interpolate(f, [0, WALK_END], [FOLD_AT.x, W + FRAME.w / 2 - 170 - FRAME.w / 2 - 58], { ...clamp, easing: Easing.inOut(Easing.quad) });
    angles = gait("walk", f / sec(0.5));
  } else if (f < PULL_END) {
    x = edge - 58;
    // 引く: 足を交互に後ろへ運びながら、体を後ろへ預ける
    const step = gait("walk", (f - WALK_END) / sec(0.45));
    angles = mixAngles(POSES.pull, { ...POSES.pull, leg_near_upper: step.leg_near_upper, leg_near_lower: step.leg_near_lower, leg_far_upper: step.leg_far_upper, leg_far_lower: step.leg_far_lower }, 0.6);
  } else {
    facing = "left";
    x = interpolate(f, [PULL_END, sec(2.9)], [edge - 58, -160], { ...clamp, easing: Easing.in(Easing.quad) });
    angles = gait("run", (f - PULL_END) / sec(0.32));
  }
  const clocksOut = interpolate(f, [0, WALK_END], [0.35, 0], clamp);
  const bob = facing === "left" ? Math.abs(Math.sin(((f - PULL_END) / sec(0.32)) * Math.PI)) * -10 : 0;
  // 走り去る足元の土ぼこり
  const dust = f > PULL_END ? [0, 1, 2].map((i) => ({ x: x + 40 + i * 46, o: interpolate(f - PULL_END - i * 3, [0, 6, 18], [0, 0.5, 0], clamp), r: 10 + i * 4 })) : [];
  return (
    <Svg>
      {clocksOut > 0 && <Clocks g={g} underline={1} opacity={clocksOut} />}
      <StageFrame cx={cx} />
      {dust.map((p, i) => (
        <circle key={i} cx={p.x} cy={GROUND - 6} r={p.r} fill="#c8bfae" opacity={p.o} />
      ))}
      <Shadow x={x} ground={GROUND} />
      <PaperPerson angles={angles} x={x} ground={GROUND + bob} facing={facing} />
    </Svg>
  );
};

// ---- 6 開演（0:13〜0:15）: 紫に暗転して、ライトが 2 つ入る ----
const lightsAt = (g: number) => {
  const s6 = startOf("s6-curtain");
  const o = interpolate(g, [s6 + sec(0.6), s6 + sec(1.3)], [0, 1], clamp);
  const drift = interpolate(g, [s6 + sec(0.6), s6 + sec(4)], [0, 1], clamp);
  return [
    { x: 470 + drift * 30, y: 270, r: 170, o },
    { x: 820 - drift * 30, y: 380, r: 190, o },
  ];
};
export const S6Curtain: React.FC = () => {
  const { f, g } = useScene("s6-curtain");
  const dark = interpolate(f, [0, sec(0.5)], [0, 1], { ...clamp, easing: ease });
  return (
    <Svg>
      <rect width={W} height={H} fill={PURPLE} opacity={dark} />
      <StageFrame cx={W / 2} />
      {lightsAt(g).map((l, i) => (
        <Light key={i} id={`l${i}`} x={l.x} y={l.y} r={l.r} opacity={l.o} />
      ))}
    </Svg>
  );
};

// ---- 7 題（0:15〜0:17）: 扉が開いて「Genba-Kamishibai」 ----
export const S7Title: React.FC = () => {
  const { f, g } = useScene("s7-title");
  const open = interpolate(f, [2, sec(1.1)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const glow = interpolate(f, [sec(0.6), sec(1.4)], [0, 1], clamp);
  const iw = FRAME.w - FRAME.inset * 2;
  const ih = FRAME.h - FRAME.inset * 2;
  return (
    <Svg bg={PURPLE}>
      <StageFrame cx={W / 2} open={open}>
        <rect width={iw} height={ih} fill="#fbf3dc" />
        <text x={iw / 2} y={ih / 2 + 22} textAnchor="middle" fontFamily="Segoe Print, Comic Sans MS, cursive" fontSize={68} fontWeight={700} fill={INK} opacity={interpolate(f, [sec(0.4), sec(1.0)], [0, 1], clamp)}>
          Genba-Kamishibai
        </text>
      </StageFrame>
      {lightsAt(g).map((l, i) => (
        <Light key={i} id={`l${i}`} x={l.x} y={l.y} r={l.r * (1 + glow * 0.25)} opacity={l.o * (1 - glow * 0.35)} />
      ))}
    </Svg>
  );
};

export const SCENE_COMPONENTS: Record<SceneId, React.FC> = {
  "s1-clocks": S1Clocks,
  "s2-print": S2Print,
  "s3-origami": S3Origami,
  "s4-name": S4Name,
  "s5-pull": S5Pull,
  "s6-curtain": S6Curtain,
  "s7-title": S7Title,
};
