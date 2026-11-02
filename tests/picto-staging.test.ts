import { describe, expect, it } from "vitest";
import { POSE_NAMES, POSES } from "../src/shared/picto/poses";
import { type Frame, placePair, renderFrame, SIZE } from "../src/shared/picto/scene";
import { checkStyle } from "../src/shared/picto/style";

const P = (x: number, name: keyof typeof POSES = "stand", facing: "left" | "right" = "right") => ({ x, height: 0.55, facing, angles: POSES[name] });
const colors = (svg: string) => new Set([...svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]+)"/g)].map((m) => m[1]));

describe("主な姿勢 4 つと視線・距離・強調（016b）", () => {
  it("歩く・倒れる・申し出る・手元が加わり、どれも絵柄のテストが通る", () => {
    for (const name of ["walk", "fall", "report", "hands"] as const) expect(POSE_NAMES).toContain(name);
    for (const name of POSE_NAMES) expect(checkStyle(renderFrame({ figures: [P(0.5, name)] }).svg), name).toEqual([]);
  });

  it("視線は向きと長さを数字で変えられ、範囲の外は断る", () => {
    const down = renderFrame({ figures: [{ ...P(0.4), gaze: { angle: -40, length: 0.6 } }] }).svg;
    const up = renderFrame({ figures: [{ ...P(0.4), gaze: { angle: 30, length: 0.6 } }] }).svg;
    expect(down).toContain('data-part="gaze"');
    expect(down).not.toBe(up);
    expect(() => renderFrame({ figures: [{ ...P(0.4), gaze: { angle: 120, length: 0.6 } }] })).toThrow(/範囲の外/);
  });

  it("距離は 2 人の間の割合で決まる", () => {
    const [a, b] = placePair(0.4);
    expect(b - a).toBeCloseTo(0.4, 9);
    const r = renderFrame({ figures: [P(a), P(b, "stand", "left")] });
    expect(r.posed[1].joints.hip[0] - r.posed[0].joints.hip[0]).toBeCloseTo(0.4 * SIZE, 6);
  });

  it("強調は太さ・大きさ・明暗・枠だけで出て、色は変わらない", () => {
    const base: Frame = { figures: [P(0.3, "point"), P(0.72, "stand", "left")] };
    const plain = renderFrame(base);
    for (const e of ["thick", "large", "dark", "frame"] as const) {
      const r = renderFrame({ figures: [{ ...base.figures[0], emphasis: [e] }, base.figures[1]] });
      expect(r.svg, e).not.toBe(plain.svg);
      expect(checkStyle(r.svg), e).toEqual([]);
      // 黒・グレー・白以外の色が出ない
      for (const c of colors(r.svg)) expect(c === "#fff" || /^#(.)\1\1$|^#(..)\2\2$/.test(c), `${e} ${c}`).toBe(true);
    }
    expect(renderFrame({ figures: [{ ...base.figures[0], emphasis: ["large"] }, base.figures[1]] }).posed[0].h).toBeGreaterThan(plain.posed[0].h);
    expect(renderFrame({ figures: [{ ...base.figures[0], emphasis: ["frame"] }, base.figures[1]] }).svg).toContain('data-part="emphasis-frame"');
  });

  it("手元のアップは、手を中心に切り取る", () => {
    const r = renderFrame({ figures: [P(0.5, "hands")], zoom: { figure: 0, joint: "hand_near", factor: 2.5 } });
    const [x, y, w] = r.view;
    expect(w).toBeCloseTo(SIZE / 2.5, 6);
    const hand = r.posed[0].joints.hand_near;
    expect(hand[0]).toBeGreaterThan(x);
    expect(hand[0]).toBeLessThan(x + w);
    expect(hand[1]).toBeGreaterThan(y);
    expect(hand[1]).toBeLessThan(y + w);
  });
});
