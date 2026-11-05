// 冒頭 0:00〜0:13 の Composition（intro-entry.ts から読む）。fold-lab は折り紙の手ごとの形の一覧（静止画）
import React from "react";
import { Composition, useCurrentFrame } from "remotion";
import { foldAll, FoldPaper } from "./fold";
import { BODY_FOLDS, LEG_FOLDS } from "./fold-steps";
import { Intro, INTRO_FRAMES } from "./intro";
import { SheetPatterns } from "./origami";
import { FPS, H, W } from "./timeline";

const LEG_S = foldAll(LEG_FOLDS);
const BODY_S = foldAll(BODY_FOLDS);
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

export const IntroRoot: React.FC = () => (
  <>
    <Composition id="intro" component={Intro} durationInFrames={INTRO_FRAMES} fps={FPS} width={W} height={H} defaultProps={{}} />
    <Composition id="fold-lab" component={FoldLab} durationInFrames={11} fps={FPS} width={1840} height={560} />
  </>
);
