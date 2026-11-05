// 部品の試し（v4 でも使う部品を 1 つずつ見る画面）: ドットに分解してポータルへ吸い込まれる
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { POSES } from "../../src/shared/picto/poses";
import { bodyBoxes, Dissolve } from "./dissolve";
import { WobbleDefs } from "./parts";
import { BigPack, Clawd, picto, PORTAL, portalPath } from "./story";

export const DISSOLVE_TEST_FRAMES = 75;
export const DissolveTest: React.FC = () => {
  const f = useCurrentFrame();
  const p = interpolate(f, [10, 64], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const x = 380;
  const g = 560;
  const h = 300;
  const to: [number, number] = [PORTAL.x * 1.6 + 60, PORTAL.y * 1.6 + 20];
  return (
    <AbsoluteFill style={{ background: "#fffdf6" }}>
      <svg width={1280} height={720} viewBox="0 0 1280 720">
        <WobbleDefs />
        <g transform={`translate(${to[0]} ${to[1]}) scale(1.6)`}>
          <path d={portalPath(1)} fill="#fffefa" stroke="#2f2a3a" strokeWidth={4} />
          <path d={portalPath(0.8, 1.7)} fill="none" stroke="#2f2a3a" strokeWidth={3} />
        </g>
        <Dissolve id="dz" p={p} boxes={bodyBoxes(x, g, h, -1)} to={to} cell={7}>
          <g transform={`translate(${x - h * 0.2} ${g}) scale(${h / 170})`}><BigPack h={170} /></g>
          <g dangerouslySetInnerHTML={{ __html: picto({ angles: POSES.stand, x, ground: g, h }) }} />
          <Clawd x={x - h * 0.2} y={g - h * 0.95} s={h * 0.24} />
        </Dissolve>
      </svg>
    </AbsoluteFill>
  );
};
