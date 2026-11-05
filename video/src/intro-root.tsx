// 冒頭 0:00〜0:13 の Composition（intro-entry.ts から読む）。fold-lab は折り紙の手ごとの形の一覧（静止画）
import React from "react";
import { Composition, useCurrentFrame } from "remotion";
import { DIAMOND_BACK_M, foldAll, FoldPaper } from "./fold";
import { BODY_FOLDS, LEG_FOLDS } from "./fold-steps";
import { Intro, INTRO_FRAMES } from "./intro";
import { SheetPatterns } from "./origami";
import { FPS, H, W } from "./timeline";

const LEG_S = foldAll(LEG_FOLDS, 100, DIAMOND_BACK_M, false);
const BODY_S = foldAll(BODY_FOLDS, 100, DIAMOND_BACK_M, false);
/** 手ごとの形（上の段: 脚、下の段: 体）。コマ f は「手の中の進み」を 0.1 ずつ（0〜9 → 0.0〜0.9、10 で止まった形） */
const FoldLab: React.FC = () => {
  const f = useCurrentFrame();
  const frac = (f % 11) / 10;
  const cw = 230;
  return (
    <svg width={1840} height={560} viewBox="0 0 1840 560" style={{ background: "#fbfaf5" }}>
      <SheetPatterns />
      {[LEG_FOLDS, BODY_FOLDS].map((steps, r) =>
        Array.from({ length: steps.length + 1 }, (_, i) => (
          <g key={`${r}-${i}`} transform={`translate(${120 + i * cw} ${150 + r * 270}) scale(0.95)`}>
            <FoldPaper steps={steps} states={r ? BODY_S : LEG_S} p={i + (i < steps.length ? frac * 0.88 : 0)} pattern={r ? "sheet-body" : "sheet-legs"} k={0.95} id={`lab${r}-${i}`} />
            <text x={0} y={128} textAnchor="middle" fontSize={14} fill="#333">{i < steps.length ? steps[i].id : "end"}</text>
          </g>
        )),
      )}
    </svg>
  );
};

/** 見比べ: 左は紙の人と手本の線を並べた画、右は紙の人に手本の輪郭（赤い点線）を重ねた画。コマ 0 = 組み終えた直後、コマ 1 = 立って手を振る所 */
const IntroCheck: React.FC = () => {
  const f = useCurrentFrame();
  const g = f === 0 ? 243 : 290;
  return (
    <div style={{ display: "flex", width: W * 2, height: H }}>
      <div style={{ width: W, height: H, position: "relative" }}><Intro g={g} outline="side" /></div>
      <div style={{ width: W, height: H, position: "relative" }}><Intro g={g} outline="over" /></div>
    </div>
  );
};

export const IntroRoot: React.FC = () => (
  <>
    <Composition id="intro" component={Intro} durationInFrames={INTRO_FRAMES} fps={FPS} width={W} height={H} defaultProps={{}} />
    <Composition id="intro-check" component={IntroCheck} durationInFrames={2} fps={FPS} width={W * 2} height={H} defaultProps={{}} />
    <Composition id="fold-lab" component={FoldLab} durationInFrames={11} fps={FPS} width={1840} height={560} />
  </>
);
