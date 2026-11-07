// 冒頭の 8 場面を 1 つずつの Composition にし、つないだ 1 本（opening）も置く。
// s1〜s6・opening・origami-steps は前の版（origami.tsx の Folding で折る方式）の残り。通しの v4（full）は使わない（0:00〜0:13 は intro.tsx、s7・s8 だけを使う）。前の版を書き出し直せるように残す
import React from "react";
import { Composition, Sequence } from "remotion";
import { Full, FULL_FRAMES, FullIndex, FullLayer } from "./full";
import { LAYERS } from "./layers";
import { StepsSheet } from "./origami";
import { Portal, PORTAL_FRAMES } from "./portal";
import { DISSOLVE_TEST_FRAMES, DissolveTest } from "./parts-test";
import { SCENE_COMPONENTS } from "./scenes";
import { V3, V3_FRAMES, V3Layer } from "./v3";
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
    {/* ポータルの単体（前の版。render.mjs）。印は書き出しのときに inputProps の mark で渡す（無ければ一般的な印）。通しの v4 のポータルは full.tsx の中で描き、印を描かない */}
    <Composition id="p1-portal" component={Portal} durationInFrames={PORTAL_FRAMES} fps={FPS} width={W} height={H} defaultProps={{}} />
    {/* 3 分の通しの仮版（枠と床の舞台は 0:13〜3:00 で変えない）と、その場面の一覧（静止画 1 枚）。props は使わない */}
    <Composition id="full" component={Full} durationInFrames={FULL_FRAMES} fps={FPS} width={W} height={H} defaultProps={{}} />
    {/* 通しの動画のレイヤー（L1〜L5）。L2〜L5 は透明のまま書き出す（render-layers.mjs） */}
    {LAYERS.map((l) => (
      <Composition key={l.id} id={l.id} component={FullLayer} durationInFrames={FULL_FRAMES} fps={FPS} width={W} height={H} defaultProps={{ layer: l.n }} />
    ))}
    {/* 台本 v3（11/7 夜）の通しと、そのレイヤー（render-v3.mjs） */}
    <Composition id="v3" component={V3} durationInFrames={V3_FRAMES} fps={FPS} width={W} height={H} />
    {LAYERS.map((l) => (
      <Composition key={`v3-${l.id}`} id={`v3-${l.id}`} component={V3Layer} durationInFrames={V3_FRAMES} fps={FPS} width={W} height={H} defaultProps={{ layer: l.n }} />
    ))}
    <Composition id="full-index" component={FullIndex} durationInFrames={1} fps={FPS} width={1990} height={720} />
    {/* 部品の試し: ドットに分解して吸い込まれる */}
    <Composition id="test-dissolve" component={DissolveTest} durationInFrames={DISSOLVE_TEST_FRAMES} fps={FPS} width={W} height={H} />
    <Composition id="opening" component={Opening} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
  </>
);
