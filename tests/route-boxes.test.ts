import { describe, expect, it } from "vitest";
import { partBoxes } from "../src/shared/boxes";
import { craneTip } from "../src/shared/picto/props";
import { SIZE } from "../src/shared/picto/scene";
import { sampleCard } from "./fixtures/card";

// 経路の画面の部品の箱（053）
describe("partBoxes", () => {
  const c = sampleCard();
  const json = c.motion.kind === "keyframes" ? c.motion.json : null!;

  it("どのコマでも、全部の部品に絵の中の箱がある", () => {
    for (const f of c.frames) {
      const bs = partBoxes(json, f.t, c.parts);
      expect(bs.map((b) => b.part).sort()).toEqual(["p1", "p2", "p3"]);
      for (const b of bs) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(1);
        expect(b.y + b.h).toBeLessThanOrEqual(1);
        expect(b.w).toBeGreaterThan(0.02);
      }
    }
  });

  it("人の箱は人形を囲み、盤の箱はキャンバスに置いた位置にある", () => {
    const [fig, , panel] = partBoxes(json, 0, c.parts);
    // 1 コマ目の人は x=0.2、盤は x=0.75・y=0.6・大きさ 0.2
    expect(fig.x).toBeLessThan(0.2);
    expect(fig.x + fig.w).toBeGreaterThan(0.2);
    expect(panel.x).toBeCloseTo(0.65, 2);
    expect(panel.y).toBeCloseTo(0.5, 2);
    expect(panel.w).toBeCloseTo(0.2, 2);
  });

  it("隠した小物は、そのコマでは箱を出さない", () => {
    const m = structuredClone(json);
    for (const k of m.keyframes) k.props[1].show = false;
    expect(partBoxes(m, 0, c.parts).map((b) => b.part)).toEqual(["p1", "p2"]);
  });

  it("クレーンにつながった吊り荷の箱は、絵と同じくクレーンの先の真下に来る（11/7）", () => {
    const m = structuredClone(json);
    const at = { show: true, figure: -1, joint: "hip" as const, dx: 0, dy: 0, inner: "none" as const };
    for (const k of m.keyframes) {
      k.props = [
        { ...at, kind: "crane", x: 0.4, y: 0.88, size: 0.4 },
        { ...at, kind: "suspended_load", x: 0.66, y: 0.6, size: 0.14 },
      ] as typeof k.props;
    }
    const parts = [
      { id: "crane", target: { type: "prop" as const, index: 0 }, statement: "s1", reason: "クレーン" },
      { id: "load", target: { type: "prop" as const, index: 1 }, statement: "s1", reason: "吊り荷" },
    ];
    const load = partBoxes(m, 0, parts).find((b) => b.part === "load")!;
    const tip = craneTip([0.4 * SIZE, 0.88 * SIZE], 0.4 * SIZE, 1);
    expect(load.x + load.w / 2).toBeCloseTo(tip[0] / SIZE, 4);
    expect(load.y + load.h / 2).toBeCloseTo(0.6, 4);
  });
});
