// 冒頭の 8 場面を 1 つずつの Composition にし、つないだ 1 本（opening）も置く
import React from "react";
import { Composition, Sequence } from "remotion";
import { Full, FULL_FRAMES, FullIndex } from "./full";
import { StepsSheet } from "./origami";
import { Portal, PORTAL_FRAMES } from "./portal";
import { DISSOLVE_TEST_FRAMES, DissolveTest } from "./parts-test";
import { SCENE_COMPONENTS } from "./scenes";
import { FPS, H, SCENES, startOf, TOTAL, W } from "./timeline";

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

export const Root: React.FC = () => (
  <>
    {SCENES.map((s) => (
      <Composition key={s.id} id={s.id} component={SCENE_COMPONENTS[s.id]} durationInFrames={s.frames} fps={FPS} width={W} height={H} />
    ))}
    {/* 折り紙の手順の一覧（静止画 1 枚。全部の手順の折り終えた形） */}
    <Composition id="origami-steps" component={StepsSheet} durationInFrames={1} fps={FPS} width={1800} height={940} />
    {/* ポータル（0:35〜0:39）。印は書き出しのときに inputProps の mark で渡す（無ければ一般的な印） */}
    <Composition id="p1-portal" component={Portal} durationInFrames={PORTAL_FRAMES} fps={FPS} width={W} height={H} defaultProps={{}} />
    {/* 3 分の通しの仮版（枠と床の舞台は 0:13〜3:00 で変えない）と、その場面の一覧（静止画 1 枚）。印は inputProps の mark */}
    <Composition id="full" component={Full} durationInFrames={FULL_FRAMES} fps={FPS} width={W} height={H} defaultProps={{}} />
    <Composition id="full-index" component={FullIndex} durationInFrames={1} fps={FPS} width={1990} height={720} />
    {/* 部品の試し: ドットに分解して吸い込まれる */}
    <Composition id="test-dissolve" component={DissolveTest} durationInFrames={DISSOLVE_TEST_FRAMES} fps={FPS} width={W} height={H} />
    <Composition id="opening" component={Opening} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
  </>
);
