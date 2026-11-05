// 冒頭の 8 場面を 1 つずつの Composition にし、つないだ 1 本（opening）も置く
import React from "react";
import { Composition, Sequence } from "remotion";
import { StepsSheet } from "./origami";
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
    <Composition id="opening" component={Opening} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
  </>
);
