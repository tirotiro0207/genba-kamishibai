import { describe, expect, it } from "vitest";
import { routeOf } from "../src/shared/card";
import { dragPatch, movePart, partJson, pinchPatch } from "../src/shared/move";
import { partBoxes } from "../src/shared/boxes";
import { validateMotion } from "../src/shared/picto/motion";
import { sampleCard } from "./fixtures/card";

// 絵の部品を 1 つずつ動かす（091）
describe("movePart", () => {
  const c = sampleCard();
  const m = c.motion.kind === "keyframes" ? c.motion.json : null!;

  it("人の角度と位置だけが変わり、ほかの人・小物・キーフレームは元のまま", () => {
    const out = movePart(m, 2, { type: "figure", index: 0 }, { x: 0.45, angles: { arm_near_upper: 120 } });
    expect(out.keyframes[2].figures[0].x).toBe(0.45);
    expect(out.keyframes[2].figures[0].angles.arm_near_upper).toBe(120);
    expect(out.keyframes[2].figures[0].angles.torso).toBe(m.keyframes[2].figures[0].angles.torso);
    expect(out.keyframes[2].props).toEqual(m.keyframes[2].props);
    for (const i of [0, 1, 3]) expect(out.keyframes[i]).toEqual(m.keyframes[i]);
    expect(validateMotion(out)).toEqual([]);
  });

  it("持っている小物は手元からのずれ、置いてある小物は画面の位置が変わる。種類と持ち手は変えない", () => {
    const held = movePart(m, 0, { type: "prop", index: 0 }, { dx: 0.1, x: 0.9, size: 0.15 }).keyframes[0].props[0];
    expect(held).toMatchObject({ kind: "tester", figure: 0, joint: "hand_near", dx: 0.1, x: 0, size: 0.15 });
    const placed = movePart(m, 0, { type: "prop", index: 1 }, { x: 0.7, y: 0.5, dx: 0.5 }).keyframes[0].props[1];
    expect(placed).toMatchObject({ kind: "panel", figure: -1, x: 0.7, y: 0.5, dx: 0 });
  });

  it("範囲の外の値は縁で止め、経路は保たれる", () => {
    const out = movePart(m, 0, { type: "figure", index: 0 }, { x: 3, angles: { arm_near_lower: -40, leg_near_lower: 50 } });
    expect(out.keyframes[0].figures[0]).toMatchObject({ x: 1, angles: { arm_near_lower: 0, leg_near_lower: 0 } });
    const out2 = movePart(out, 0, { type: "prop", index: 1 }, { size: 9 });
    expect(out2.keyframes[0].props[1].size).toBe(0.5);
    const after = { ...c, motion: { kind: "keyframes" as const, json: out2 } };
    for (const p of c.parts) expect(routeOf(after, p.id)).toEqual(routeOf(c, p.id));
    expect(() => movePart(m, 9, { type: "figure", index: 0 }, {})).toThrow();
    expect(() => movePart(m, 0, { type: "prop", index: 5 }, {})).toThrow();
  });

  it("画面に出す値は、選んだ部品のものだけ", () => {
    expect(partJson(m, 0, { type: "prop", index: 1 })).toEqual({ kind: "panel", x: 0.75, y: 0.6, size: 0.2 });
    expect(Object.keys(partJson(m, 0, { type: "figure", index: 0 }))).toEqual(["role", "x", "facing", "angles"]);
  });
});

describe("指で動かす・2 本指で大きさ（11/6）", () => {
  const c = sampleCard();
  const m = c.motion.kind === "keyframes" ? c.motion.json : null!;
  const box = (json: typeof m, part: string) => partBoxes(json, 0, c.parts).find((b) => b.part === part)!;
  const center = (b: { x: number; y: number; w: number; h: number }) => [b.x + b.w / 2, b.y + b.h / 2];

  it("指で動かした量だけ、絵の上の部品も同じ量だけ動く（人・置いた小物・持った小物）", () => {
    for (const p of c.parts) {
      if (p.target.type === "element") continue;
      const t = p.target;
      const moved = movePart(m, 0, t, dragPatch(m, 0, 0, t, 0.05, t.type === "figure" ? 0 : 0.04));
      const [a, b] = [center(box(m, p.id)), center(box(moved, p.id))];
      expect(b[0] - a[0]).toBeCloseTo(0.05, 2);
      if (t.type === "prop") expect(b[1] - a[1]).toBeCloseTo(0.04, 2);
      expect(validateMotion(moved)).toEqual([]);
    }
  });

  it("2 本指は小物の大きさだけ（人には効かない）。範囲の外は端で止まる。向きは左右を入れかえられる", () => {
    const prop = { type: "prop" as const, index: 1 };
    const size = m.keyframes[0].props[1].size;
    expect(movePart(m, 0, prop, pinchPatch(m, 0, prop, 1.5)!).keyframes[0].props[1].size).toBeCloseTo(size * 1.5);
    expect(movePart(m, 0, prop, pinchPatch(m, 0, prop, 100)!).keyframes[0].props[1].size).toBe(0.5);
    expect(pinchPatch(m, 0, { type: "figure", index: 0 }, 2)).toBeNull();
    const f = m.keyframes[0].figures[0].facing;
    const flip = f === "left" ? "right" : "left";
    const out = movePart(m, 0, { type: "figure", index: 0 }, { facing: flip });
    expect(out.keyframes[0].figures[0].facing).toBe(flip);
    expect(partJson(out, 0, { type: "figure", index: 0 })).toMatchObject({ facing: flip });
  });
});
