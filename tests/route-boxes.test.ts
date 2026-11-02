import { describe, expect, it } from "vitest";
import { partBoxes } from "../src/shared/boxes";
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
});
