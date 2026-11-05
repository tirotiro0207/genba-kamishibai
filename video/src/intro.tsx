// 冒頭 0:00〜0:13（コマ 0〜389）の白地の段。11/5 夕の直し（作者の指示）:
// 見出し 2 つが下から同時にワッと出る → 時計 → 手書きの印刷口 → 紙を 1 枚ずつ一気に刷る → 2 枚を同時に、本当に折る（回して倒す・形を混ぜない）
// → 体の紙を脚の紙に差し込む → 折り紙のまま目が描かれ、腕と脚がぴょこっと動いて立つ → 吹き出し「紙芝居にします！」→ 右から木の枠を引っぱり込み、左へ走って消える。
// 紙の人は、折り終えた紙の面そのものを部品（胴と頭・両腕・両脚）に分けて動かす。完成した絵に切り替えないので、書類が折られてそのまま人になったと途切れずに見える。
// 0:13.0（コマ 390）で枠が真ん中に止まっているのは、前の版と同じ（後ろの場面がそこから始まるため）
import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { cut, DIAMOND_BACK_M, foldAll, FoldPaper, Facets, translateFacets } from "./fold";
import { ARM_PIVOT, BODY_FOLDS, CROTCH, FOOT_OUT, HEAD_TOP, LEG_DY, LEG_FOLDS, OUTLINE } from "./fold-steps";
import { SheetPatterns } from "./origami";
import { PAPER_EDGE, PAPER_FAR, PaperDefs, type Pt, Shadow } from "./paper";
import { Clocks, FONT_JP, FONT_PEN, FRAME, StageFrame, WobbleDefs } from "./parts";
import { CLOCKS, FPS, GROUND, H, INK, PERSON_H, W } from "./timeline";

export const INTRO_FRAMES = 390;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const sec = (s: number) => Math.round(s * FPS);
const ease = Easing.inOut(Easing.cubic);

// ---- 時間割（コマ） ----
const POP = 12; // 見出しが下から上がる（行き過ぎて戻る）
const DIAL_DRAW: [number, number] = [10, 26];
const HANDS_AT = 26;
const MOUTH: [number, number] = [48, 60];
const PRINT = 24; // 1 枚 0.8 秒
const P1 = 60;
const P2 = P1 + PRINT;
const SLIDE = 12;
/** 折る: 1 手 12 コマ（0.4 秒）。体の紙は脚の紙から 1 手半（18 コマ）遅れて折り始める（脚が分かれる → 腕が出る → 頭が出る の順に見せる） */
export const STEP = 12;
const FOLD_START = 120;
const BODY_LAG = 18;
const LEG_END = FOLD_START + LEG_FOLDS.length * STEP;
const BODY_END = FOLD_START + BODY_LAG + BODY_FOLDS.length * STEP;
/** 組む: 2 つが寄る → 体を脚に差し込む → パチン */
const JOIN_MOVE: [number, number] = [BODY_END + 2, BODY_END + 16];
const INSERT: [number, number] = [JOIN_MOVE[1], JOIN_MOVE[1] + 10];
const DONE = INSERT[1];
/** 目が描かれる → 腕と脚がぴょこっ → 立つ（跳ねる） */
const EYES = DONE + 2;
const WIGGLE = DONE + 8;
const HOP = DONE + 22;
const BUBBLE = DONE + 26;
const PULL = 300;

// ---- 置き場 ----
const MOUTH_X = CLOCKS.text;
const MOUTH_Y = CLOCKS.labelY + 30;
const MOUTH_W = 400;
const K = 1.6; // 折るときの紙の倍率（200 → 320 px）
const HALF = 100 * K;
const SLOT_BODY = { x: 360, y: 400 };
const SLOT_LEGS = { x: 920, y: 400 };
const FIG_X = 640;
/** 組んだ紙の人（手本の J1）: 体の紙が手前、脚の紙が奥。体の下の角が脚の紙の上から 0.37 の所まで重なる。紙の人の座標は体の紙の座標のまま、脚の紙は LEG_DY 下。手本のできあがりの形（幅 : 高さ = 0.46 : 1）に合わせてある */
const FIG_TOP = HEAD_TOP[1];
const FIG_FEET = FOOT_OUT[1];
const FK = PERSON_H / (FIG_FEET - FIG_TOP);
const FIG_Y = GROUND - FIG_FEET * FK;

// ---- 折った紙 ----
const LEG_S = foldAll(LEG_FOLDS, 100, DIAMOND_BACK_M, false);
const BODY_S = foldAll(BODY_FOLDS, 100, DIAMOND_BACK_M, false);
const LEGS_DONE = LEG_S[LEG_S.length - 1];
const BODY_DONE = BODY_S[BODY_S.length - 1];
const BIG = 400;
const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** 紙の人の部品（紙の人の座標）。腕は凧の辺の外へめくり出した帯、胴と頭は凧の辺の内側、脚は脚の紙の左右の半分 */
const [PX, PY] = ARM_PIVOT;
const ARM_TOP = -60;
/** 凧の右の辺（(82.8,-58.6) → (0,141.4)）を 0.4 外へずらした線の上の、高さ y の点の x */
const edgeX = (y: number) => (82.8 * (141.42 - y)) / (141.42 + 58.58) + 0.4;
const armRegion = (sgn: number): Pt[] => [[sgn * edgeX(ARM_TOP), ARM_TOP], [sgn * BIG, ARM_TOP], [sgn * BIG, BIG], [sgn * edgeX(BIG), BIG]];
const LEGS_FIG = translateFacets(LEGS_DONE, 0, LEG_DY);
const PART = {
  core: [...cut(BODY_DONE, box(-BIG, -BIG, BIG, ARM_TOP)), ...cut(BODY_DONE, [[-edgeX(ARM_TOP), ARM_TOP], [edgeX(ARM_TOP), ARM_TOP], [0, 142]])],
  armL: cut(BODY_DONE, armRegion(-1)),
  armR: cut(BODY_DONE, armRegion(1)),
  legL: cut(LEGS_FIG, box(-BIG, -BIG, 0, BIG)),
  legR: cut(LEGS_FIG, box(0, -BIG, BIG, BIG)),
};
/** 腕の付け根から手の先までの長さ */
const ARM_REACH = Math.max(...PART.armR.flatMap((f) => f.poly.map(([x, y]) => Math.hypot(x - PX, y - PY))));
const HIP_Y = CROTCH[1] - 6;
const EYE_Y = FIG_TOP + 30;

// ---- 見出し・印刷口・刷られる紙 ----
const Labels: React.FC<{ g: number; o: number }> = ({ g, o }) => {
  const up = interpolate(g, [0, POP], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2.6)) });
  const op = interpolate(g, [0, 4], [0, 1], clamp);
  return (
    <g opacity={op * o} transform={`translate(0 ${(1 - up) * 90})`}>
      {[
        [CLOCKS.text, "文書で読む"],
        [CLOCKS.card, "絵のカードで読む"],
      ].map(([x, s]) => (
        <text key={s} x={x} y={CLOCKS.labelY} textAnchor="middle" fontFamily={FONT_JP} fontSize={34} fontWeight={700} fill={INK}>
          {s}
        </text>
      ))}
    </g>
  );
};

/** 手で描いた印刷機の印刷口（横長の口・ふちの厚み・口の奥の影）。p は描けた割合 */
const Mouth: React.FC<{ p: number; o: number; busy: number }> = ({ p, o, busy }) => {
  if (p <= 0 || o <= 0) return null;
  const x0 = MOUTH_X - MOUTH_W / 2;
  const y0 = MOUTH_Y - 16;
  const dash = { pathLength: 1, strokeDasharray: `${p} 1` };
  const shake = busy > 0 ? Math.sin(busy * 2.1) * 1.2 : 0;
  return (
    <g opacity={o} transform={`translate(0 ${shake})`}>
      <g filter="url(#wobble)">
        <rect x={x0 + 14} y={y0 + 12} width={(MOUTH_W - 28) * p} height={10} rx={5} fill={INK} opacity={0.85} />
        <path d={`M${x0} ${y0 + 26}L${x0} ${y0 + 4}Q${x0} ${y0} ${x0 + 6} ${y0}L${x0 + MOUTH_W - 6} ${y0}Q${x0 + MOUTH_W} ${y0} ${x0 + MOUTH_W} ${y0 + 4}L${x0 + MOUTH_W} ${y0 + 26}`} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" {...dash} />
        <path d={`M${x0 - 10} ${y0 + 28}L${x0 + MOUTH_W + 10} ${y0 + 28}`} stroke={INK} strokeWidth={6} strokeLinecap="round" {...dash} />
        <path d={`M${x0 + 4} ${y0 + 34}L${x0 + MOUTH_W - 4} ${y0 + 34}`} stroke={INK} strokeWidth={2.5} strokeLinecap="round" opacity={0.6} {...dash} />
      </g>
    </g>
  );
};

/** 刷られて出てくる紙。q は出た割合（上の行から順に見える）。紙の上の端は口に付いたまま */
const PrintingSheet: React.FC<{ q: number; pattern: string; id: string }> = ({ q, pattern, id }) => {
  const top = MOUTH_Y + 12;
  const len = 2 * HALF * q;
  return (
    <g>
      <defs>
        <clipPath id={`out-${id}`}>
          <rect x={0} y={top} width={W} height={len} />
        </clipPath>
        <linearGradient id={`curl-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.16} />
        </linearGradient>
      </defs>
      <g clipPath={`url(#out-${id})`} filter="url(#sheet-shadow)">
        <g transform={`translate(${MOUTH_X} ${top + HALF}) scale(${K})`} filter="url(#grain)">
          <rect x={-100} y={-100} width={200} height={200} fill={`url(#${pattern})`} stroke={PAPER_EDGE} strokeWidth={1.6 / K} />
        </g>
      </g>
      {q > 0 && q < 1 && <rect x={MOUTH_X - HALF} y={top + len - 18} width={2 * HALF} height={18} fill={`url(#curl-${id})`} />}
    </g>
  );
};

// ---- 紙の人（折り紙の面のまま動かす） ----
interface Pose { armL: number; armR: number; legL: number; legR: number; lean: number }
const REST: Pose = { armL: 0, armR: 0, legL: 0, legR: 0, lean: 0 };
const FigureParts: React.FC<{ pose: Pose; eyes: number; id: string }> = ({ pose, eyes, id }) => (
  <g transform={`rotate(${pose.lean} 0 ${FIG_FEET})`}>
    <g transform={`rotate(${pose.legL} -6 ${HIP_Y})`}>
      <Facets fs={PART.legL} pattern="sheet-legs" k={FK} id={`${id}-ll`} />
    </g>
    <g transform={`rotate(${pose.legR} 6 ${HIP_Y})`}>
      <Facets fs={PART.legR} pattern="sheet-legs" k={FK} id={`${id}-lr`} />
    </g>
    <Facets fs={PART.core} pattern="sheet-body" k={FK} id={`${id}-c`} />
    <g transform={`rotate(${pose.armL} ${-PX} ${PY})`}>
      <Facets fs={PART.armL} pattern="sheet-body" k={FK} id={`${id}-al`} />
    </g>
    <g transform={`rotate(${pose.armR} ${PX} ${PY})`}>
      <Facets fs={PART.armR} pattern="sheet-body" k={FK} id={`${id}-ar`} />
    </g>
    {eyes > 0 && (
      <g>
        {[-12, 12].map((x) => (
          <ellipse key={x} cx={x} cy={EYE_Y} rx={3.2} ry={4.4 * Math.min(1, eyes)} fill={INK} />
        ))}
        <path d={`M-8 ${EYE_Y + 11}Q0 ${EYE_Y + 16} 8 ${EYE_Y + 11}`} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" pathLength={1} strokeDasharray={`${Math.max(0, Math.min(1, eyes - 1))} 1`} />
      </g>
    )}
  </g>
);

// ---- 枠を引っぱる（前の版の s6 と同じ道のり。11/5 夜 v4: 枠が大きいので 0.2 秒遅く着き、大きく弾む） ----
const WALK_END = sec(0.5);
/** 右腕の先が枠の端に届く間（右腕を肩から横へ上げる） */
const HAND = (PX + ARM_REACH - 10) * FK;
const PULL_END = sec(1.7);
const RUN_AT = sec(2.0);
const frameCx = (f: number) =>
  f < WALK_END
    ? interpolate(f, [0, WALK_END], [W + FRAME.w / 2 + 40, W + FRAME.w / 2 - 170], { ...clamp, easing: Easing.out(Easing.quad) })
    : interpolate(f, [WALK_END, PULL_END], [W + FRAME.w / 2 - 170, W / 2], { ...clamp, easing: Easing.inOut(Easing.quad) });

const BUBBLE_TEXT = "紙芝居にします！";

/** 冒頭 0:00〜0:13 の 1 コマ（g は冒頭からのコマ） */
export const Intro: React.FC<{ g?: number; outline?: "over" | "side" }> = ({ g: gIn, outline }) => {
  const cur = useCurrentFrame();
  const g = gIn ?? cur;

  const clocksO = interpolate(g, [P1, P1 + 18], [1, 0], clamp);
  const headO = interpolate(g, [FOLD_START - 6, FOLD_START + 4], [1, 0], clamp);
  const dialP = interpolate(g, DIAL_DRAW, [0, 1], clamp);
  const mouthP = interpolate(g, MOUTH, [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const busy = g >= P1 && g < P2 + PRINT ? g - P1 : 0;

  // 紙 1（脚になる）と紙 2（体になる）を刷って、置き場へ
  const q1 = interpolate(g, [P1, P1 + PRINT], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const q2 = interpolate(g, [P2, P2 + PRINT], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const out = { x: MOUTH_X, y: MOUTH_Y + 12 + HALF };
  const m1 = interpolate(g, [P1 + PRINT, P1 + PRINT + SLIDE], [0, 1], { ...clamp, easing: ease });
  const m2 = interpolate(g, [P2 + PRINT, P2 + PRINT + SLIDE], [0, 1], { ...clamp, easing: ease });
  // 置き場へ動きながら 45° 回して菱形にし、裏返す（手本の L2・B3 と「裏返す」。刷った面が向こうになる）
  const at = (m: number, to: { x: number; y: number }) => ({ x: out.x + (to.x - out.x) * m, y: out.y + (to.y - out.y) * m - Math.sin(m * Math.PI) * 40, r: -45 * m, s: Math.cos(m * Math.PI) });

  // 折る進み（手 i を終えた所が i）
  const legP = Math.max(0, Math.min(LEG_FOLDS.length, (g - FOLD_START) / STEP));
  const bodyP = Math.max(0, Math.min(BODY_FOLDS.length, (g - FOLD_START - BODY_LAG) / STEP));

  // 組む: 置き場から紙の人の場所へ寄る → 体を脚に差し込む
  const jm = interpolate(g, JOIN_MOVE, [0, 1], { ...clamp, easing: ease });
  const ins = interpolate(g, INSERT, [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const legsTo = { x: FIG_X, y: FIG_Y + LEG_DY * FK };
  const legsT = { x: SLOT_LEGS.x + (legsTo.x - SLOT_LEGS.x) * jm, y: SLOT_LEGS.y + (legsTo.y - SLOT_LEGS.y) * jm, k: K + (FK - K) * jm };
  const bodyTo = { x: FIG_X, y: FIG_Y - 70 * (1 - ins) * FK };
  const bodyT = { x: SLOT_BODY.x + (bodyTo.x - SLOT_BODY.x) * jm, y: SLOT_BODY.y + (bodyTo.y - SLOT_BODY.y) * jm, k: K + (FK - K) * jm };
  const snap = g >= DONE && g < DONE + 6 ? Math.sin(((g - DONE) / 6) * Math.PI) : 0;

  // 説明の大きな字（折り始めにドーンと出て、折り終えるまで残る。組むときは紙の人の頭が字の所まで来るので消す）
  const bigIn = interpolate(g, [FOLD_START, FOLD_START + 8], [0, 1], { ...clamp, easing: Easing.out(Easing.back(3)) });
  const bigO = interpolate(g, [FOLD_START, FOLD_START + 3, JOIN_MOVE[0] - 4, JOIN_MOVE[0] + 4], [0, 1, 1, 0], clamp);

  // 動き出す
  const eyes = interpolate(g, [EYES, EYES + 4, EYES + 9], [0, 1, 2], clamp);
  const wig = g >= WIGGLE && g < WIGGLE + 14 ? Math.sin(((g - WIGGLE) / 14) * Math.PI * 2) : 0;
  const drop = interpolate(g, [WIGGLE + 6, WIGGLE + 14], [0, 1], { ...clamp, easing: ease });
  const hop = g >= HOP && g < HOP + 9 ? Math.sin(((g - HOP) / 9) * Math.PI) * 30 : 0;
  const shine = interpolate(g, [DONE, DONE + 3, DONE + 12], [0, 1, 0], clamp);
  const bub = interpolate(g, [BUBBLE, BUBBLE + 7], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2)) });
  const bubO = interpolate(g, [PULL + 8, PULL + 16], [1, 0], clamp);

  // 姿勢と置き場
  const f = g - PULL;
  const pulling = f >= 0;
  const cx = frameCx(Math.max(0, f));
  const edgeX = cx - FRAME.w / 2;
  let x = FIG_X;
  let facing = 1;
  let bob = 0;
  // 立っているとき: 垂らした腕がぴょこっと動き、右手を上げて振る
  const wave = g >= BUBBLE ? Math.sin(((g - BUBBLE) / FPS) * Math.PI * 3) : 0;
  let pose: Pose = {
    armL: 16 * wig + 6 * drop,
    armR: -16 * wig - 6 * drop - (g >= BUBBLE ? interpolate(g, [BUBBLE, BUBBLE + 6], [0, 1], clamp) * (135 + 18 * wave) : 0),
    legL: 10 * wig,
    legR: -10 * wig,
    lean: 0,
  };
  if (pulling) {
    const swing = (ph: number, a: number) => Math.sin(ph * Math.PI * 2) * a;
    if (f < WALK_END) {
      x = interpolate(f, [0, WALK_END], [FIG_X, W + FRAME.w / 2 - 170 - FRAME.w / 2 - HAND], { ...clamp, easing: Easing.inOut(Easing.quad) });
      const ph = f / sec(0.5);
      pose = { armL: 6 + swing(ph, 14), armR: interpolate(f, [0, WALK_END], [-135, -92], clamp), legL: swing(ph, 16), legR: -swing(ph, 16), lean: 0 };
      bob = Math.abs(swing(ph, 6));
    } else if (f < PULL_END) {
      // 引く: 右腕で枠の端をつかみ、体を後ろへ預けて、足を交互に後ろへ運ぶ
      x = edgeX - HAND;
      const ph = (f - WALK_END) / sec(0.45);
      pose = { armL: 18, armR: -92, legL: swing(ph, 14), legR: -swing(ph, 14), lean: -9 };
    } else if (f < RUN_AT) {
      x = edgeX - HAND;
      const r = interpolate(f, [PULL_END, RUN_AT], [0, 1], clamp);
      pose = { armL: 18 - 8 * r, armR: -92 + 72 * r, legL: 0, legR: 0, lean: -9 * (1 - r) };
    } else {
      facing = -1;
      x = interpolate(f, [RUN_AT, sec(2.6)], [edgeX - HAND, -300], { ...clamp, easing: Easing.in(Easing.quad) });
      const ph = (f - RUN_AT) / sec(0.4);
      pose = { armL: swing(ph, 30), armR: swing(ph, 30), legL: swing(ph, 26), legR: -swing(ph, 26), lean: 8 };
      bob = Math.abs(swing(ph, 10));
    }
  }
  const bounce = f >= PULL_END && f < PULL_END + 10 ? Math.sin(((f - PULL_END) / 10) * Math.PI) * -16 : 0;
  const puff = pulling ? interpolate(f - PULL_END, [0, 6, 22], [0, 0.55, 0], clamp) : 0;
  const tata = pulling ? interpolate(f, [RUN_AT, RUN_AT + 4, sec(2.9)], [0, 1, 0], clamp) : 0;
  const dust = pulling && f > RUN_AT ? [0, 1, 2].map((i) => ({ x: x + 70 + i * 70, o: interpolate(f - RUN_AT - i * 3, [0, 6, 18], [0, 0.5, 0], clamp), r: 16 + i * 6 })) : [];
  const alive = g >= DONE;

  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <PaperDefs />
        <SheetPatterns />
        <WobbleDefs />
        <defs>
          <filter id="sheet-shadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx={0} dy={6} stdDeviation={6} floodColor="#3b3320" floodOpacity={0.22} />
          </filter>
          {/* 紙の目（細かいざらつきと、うすい繊維のむら） */}
          <filter id="grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={3} result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.37  0 0 0 0 0.28  0 0 0 0.10 0" result="g" />
            <feTurbulence type="fractalNoise" baseFrequency="0.015 0.05" numOctaves={2} seed={9} result="m" />
            <feColorMatrix in="m" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.35  0 0 0 0.07 0" result="h" />
            <feComposite in="g" in2="SourceGraphic" operator="in" result="g2" />
            <feComposite in="h" in2="SourceGraphic" operator="in" result="h2" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="g2" />
              <feMergeNode in="h2" />
            </feMerge>
          </filter>
          <radialGradient id="shine" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fff6c8" stopOpacity={0.95} />
            <stop offset="1" stopColor="#fff6c8" stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="#fbfaf5" />

        {/* 時計（見出しは下から出す方を使うので、ここでは描かない） */}
        {clocksO > 0 && g >= DIAL_DRAW[0] && <Clocks g={g + (sec(2.5) - HANDS_AT)} draw={[0, 0, dialP, dialP]} opacity={clocksO} />}
        <Labels g={g} o={headO} />
        <Mouth p={mouthP} o={headO} busy={busy} />

        {/* 印刷: 1 枚目（脚）→ 2 枚目（体）。刷り終えたら置き場へ */}
        {g >= P1 && g < FOLD_START &&
          (m1 <= 0 ? (
            <PrintingSheet q={q1} pattern="sheet-legs" id="a" />
          ) : (
            <g transform={`translate(${at(m1, SLOT_LEGS).x} ${at(m1, SLOT_LEGS).y}) rotate(${at(m1, SLOT_LEGS).r}) scale(${K * Math.max(0.02, Math.abs(at(m1, SLOT_LEGS).s))} ${K})`} filter="url(#sheet-shadow)">
              <g filter="url(#grain)">
                <rect x={-100} y={-100} width={200} height={200} fill={at(m1, SLOT_LEGS).s > 0 ? "url(#sheet-legs)" : PAPER_FAR} stroke={PAPER_EDGE} strokeWidth={1.6 / K} />
              </g>
            </g>
          ))}
        {g >= P2 && g < FOLD_START &&
          (m2 <= 0 ? (
            <PrintingSheet q={q2} pattern="sheet-body" id="b" />
          ) : (
            <g transform={`translate(${at(m2, SLOT_BODY).x} ${at(m2, SLOT_BODY).y}) rotate(${at(m2, SLOT_BODY).r}) scale(${K * Math.max(0.02, Math.abs(at(m2, SLOT_BODY).s))} ${K})`} filter="url(#sheet-shadow)">
              <g filter="url(#grain)">
                <rect x={-100} y={-100} width={200} height={200} fill={at(m2, SLOT_BODY).s > 0 ? "url(#sheet-body)" : PAPER_FAR} stroke={PAPER_EDGE} strokeWidth={1.6 / K} />
              </g>
            </g>
          ))}

        {/* 2 枚を折る（体の紙は半手遅れ）→ 寄って、体を脚に差し込む */}
        {g >= FOLD_START && !alive && (
          <>
            {jm > 0 && <Shadow x={FIG_X} ground={GROUND} w={110} opacity={0.18 * jm} />}
            <g transform={`translate(${legsT.x} ${legsT.y}) scale(${legsT.k})`} filter="url(#sheet-shadow)">
              <g filter="url(#grain)">
                <FoldPaper steps={LEG_FOLDS} states={LEG_S} p={legP} pattern="sheet-legs" k={K} id="fl" />
              </g>
            </g>
            <g transform={`translate(${bodyT.x} ${bodyT.y}) scale(${bodyT.k})`} filter="url(#sheet-shadow)">
              <g filter="url(#grain)">
                {jm <= 0 ? <FoldPaper steps={BODY_FOLDS} states={BODY_S} p={bodyP} pattern="sheet-body" k={K} id="fb" /> : <Facets fs={BODY_DONE} pattern="sheet-body" k={bodyT.k} id="jb" />}
              </g>
            </g>
          </>
        )}

        {/* 組み終えた紙の人（折り紙の面のまま）。目が描かれ、腕と脚がぴょこっと動いて立つ */}
        {alive && (
          <>
            <Shadow x={x} ground={GROUND} w={110} />
            <g transform={`translate(${x} ${FIG_Y - hop - bob + snap * -8}) scale(${FK * facing} ${FK})`} filter="url(#sheet-shadow)">
              <g filter="url(#grain)">
                <FigureParts pose={pose} eyes={eyes} id="fig" />
              </g>
              {outline === "over" && <path d={`M${OUTLINE.map((p) => p.join(" ")).join("L")}Z`} fill="none" stroke="#d0302a" strokeWidth={2.4 / FK} strokeDasharray={`${8 / FK} ${5 / FK}`} />}
            </g>
          </>
        )}
        {shine > 0 && (
          <g opacity={shine}>
            <ellipse cx={FIG_X} cy={GROUND - PERSON_H / 2} rx={260} ry={330} fill="url(#shine)" />
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2;
              const r0 = 300 + shine * 20;
              return <path key={i} d={`M${FIG_X + Math.cos(a) * r0 * 0.75} ${GROUND - PERSON_H / 2 + Math.sin(a) * r0}l${Math.cos(a) * 40} ${Math.sin(a) * 40}`} stroke={INK} strokeWidth={5} strokeLinecap="round" />;
            })}
          </g>
        )}

        {/* 見比べ用: 手本の輪郭を紙の人の横に描く */}
        {outline === "side" && alive && (
          <g transform={`translate(${x + 330} ${FIG_Y}) scale(${FK})`}>
            <path d={`M${OUTLINE.map((p) => p.join(" ")).join("L")}Z`} fill="#f3eee2" stroke={INK} strokeWidth={2.4 / FK} />
            {OUTLINE.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3 / FK} fill="#d0302a" />)}
          </g>
        )}
        {/* 説明の大きな字 */}
        {bigO > 0 && (
          <g opacity={bigO} transform={`translate(${W / 2} 88) scale(${0.6 + bigIn * 0.4})`}>
            <text x={0} y={0} textAnchor="middle" fontFamily={FONT_PEN} fontSize={58} fontWeight={700} fill={INK} stroke="#fbfaf5" strokeWidth={10} paintOrder="stroke" filter="url(#wobble)">
              文字の情報を、折りたたんで、絵にする。
            </text>
          </g>
        )}

        {/* 枠を引っぱる */}
        {pulling && (
          <>
            <g transform={`translate(0 ${bounce})`}>
              <StageFrame cx={cx} />
            </g>
            {puff > 0 && [-1, -0.4, 0.4, 1].map((kk) => <ellipse key={kk} cx={W / 2 + kk * (FRAME.w / 2)} cy={FRAME.cy + FRAME.h / 2 + 18 - puff * 10} rx={40 + puff * 40} ry={14 + puff * 8} fill="#d8cfbf" opacity={puff} />)}
            {tata > 0 && (
              <g opacity={tata}>
                {[0, 1, 2].map((i) => <path key={i} d={`M${x + 90 + i * 10} ${GROUND - 300 + i * 70}h${120 + i * 30}`} stroke={INK} strokeWidth={4} strokeLinecap="round" filter="url(#wobble)" />)}
                <text x={Math.max(60, x + 60)} y={GROUND - 20} fontFamily={FONT_PEN} fontSize={44} fill={INK} transform={`rotate(-8 ${Math.max(60, x + 60)} ${GROUND - 20})`}>
                  タタタ
                </text>
              </g>
            )}
            {dust.map((p, i) => <circle key={i} cx={p.x} cy={GROUND - 6} r={p.r} fill="#c8bfae" opacity={p.o} />)}
          </>
        )}

        {/* 吹き出し「紙芝居にします！」 */}
        {bub > 0 && bubO > 0 && (
          <g opacity={bubO} transform={`translate(${x + 120} 110) scale(${bub})`}>
            <path d="M-20 -50H330Q350 -50 350 -30V30Q350 50 330 50H40L-20 100L0 50H-20Q-40 50 -40 30V-30Q-40 -50 -20 -50Z" fill="#fff" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
            <text x={155} y={14} textAnchor="middle" fontFamily={FONT_JP} fontSize={40} fontWeight={700} fill={INK}>
              {BUBBLE_TEXT}
            </text>
          </g>
        )}
      </svg>
    </AbsoluteFill>
  );
};
