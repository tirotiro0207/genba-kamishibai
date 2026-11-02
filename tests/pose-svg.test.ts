import { describe, expect, it } from "vitest";
import { PROPS, type Pose } from "../src/shared/pose/schema";
import { posePoints, renderPoseSvg, SIZE } from "../src/shared/pose/svg";
import { standingPose } from "./fixtures/pose";

const allProps = (): Pose => ({
  ...standingPose(),
  props: PROPS.map((kind, i) => ({ kind, attach: "free", figure: 0, x: ((i % 6) + 0.5) / 6, y: (Math.floor(i / 6) + 0.5) / 5, size: 0.08 })),
  overlay: { prohibit: true, mark: "cross" },
});

describe("最小の仮の人形（006）", () => {
  it("同じ入力なら同じ SVG", () => {
    expect(renderPoseSvg(allProps())).toBe(renderPoseSvg(allProps()));
  });

  it("絵の面に文字が無い（text・title・desc・id・メタデータが無い）", () => {
    const svg = renderPoseSvg(allProps());
    expect(svg).not.toMatch(/<(text|tspan|title|desc|metadata|foreignObject|image|style|script)\b/);
    expect(svg).not.toMatch(/\s(id|class|data-[\w-]+|aria-[\w-]+)=/);
    // 要素は図形だけ
    const tags = new Set([...svg.matchAll(/<(\w+)/g)].map((m) => m[1]));
    expect([...tags].every((t) => ["svg", "rect", "line", "circle", "ellipse", "polygon", "polyline", "path"].includes(t))).toBe(true);
  });

  it("小物 24 種がどれも図形を出す", () => {
    const base = renderPoseSvg({ ...standingPose(), props: [] }).length;
    for (const kind of PROPS) {
      const svg = renderPoseSvg({ ...standingPose(), props: [{ kind, attach: "free", figure: 0, x: 0.5, y: 0.3, size: 0.1 }] });
      expect(svg.length, kind).toBeGreaterThan(base);
    }
  });

  it("足が地面に乗り、角度を変えると絵が変わる", () => {
    const { p } = posePoints(standingPose().figures[0]);
    expect(Math.max(p.foot_l[1], p.foot_r[1])).toBeCloseTo(SIZE * 0.85, 5);
    const bent = standingPose();
    bent.figures[0].angles.torso = 45;
    expect(renderPoseSvg(bent)).not.toBe(renderPoseSvg(standingPose()));
  });
});
