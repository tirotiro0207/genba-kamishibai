// 冒頭の 7 場面を 1 つずつの Composition にし、つないだ 1 本（opening）も置く
import React from "react";
import { Composition, Sequence } from "remotion";
import { SCENE_COMPONENTS } from "./scenes";
import { FPS, H, SCENES, TOTAL, W } from "./timeline";

const Opening: React.FC = () => (
  <>
    {SCENES.map((s) => {
      const C = SCENE_COMPONENTS[s.id];
      return (
        <Sequence key={s.id} from={s.from * FPS} durationInFrames={s.sec * FPS} name={s.title}>
          <C />
        </Sequence>
      );
    })}
  </>
);

export const Root: React.FC = () => (
  <>
    {SCENES.map((s) => (
      <Composition key={s.id} id={s.id} component={SCENE_COMPONENTS[s.id]} durationInFrames={s.sec * FPS} fps={FPS} width={W} height={H} />
    ))}
    <Composition id="opening" component={Opening} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
  </>
);
