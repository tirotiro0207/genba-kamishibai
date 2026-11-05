// 冒頭 0:00〜0:13 の Composition（intro-entry.ts から読む）
import React from "react";
import { Composition } from "remotion";
import { Intro, INTRO_FRAMES } from "./intro";
import { FPS, H, W } from "./timeline";

export const IntroRoot: React.FC = () => <Composition id="intro" component={Intro} durationInFrames={INTRO_FRAMES} fps={FPS} width={W} height={H} defaultProps={{}} />;
