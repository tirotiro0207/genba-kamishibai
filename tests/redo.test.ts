import { describe, expect, it } from "vitest";
import { routeOf } from "../src/shared/card";
import { keyIndexAt, mergeRedo, partsInBox } from "../src/shared/redo";
import { POSES } from "../src/shared/picto/poses";
import { sampleCard } from "./fixtures/card";

// 枠 → 部品 → その 1 枚だけ作り直す（044b）
describe("枠に入った部品を選び、その部品だけを取り込む", () => {
  const c = sampleCard();
  const m = c.motion.kind === "keyframes" ? c.motion.json : null!;
  const PANEL = { x: 0.66, y: 0.52, w: 0.18, h: 0.16 };

  it("盤だけを囲めば盤だけ、人を囲めば人（と手に持った検電器）を選ぶ", () => {
    expect(partsInBox(m, 0, c.parts, PANEL)).toEqual({ figures: [], props: [1], parts: ["p3"] });
    const person = partsInBox(m, 0, c.parts, { x: 0, y: 0.1, w: 0.4, h: 0.8 });
    expect(person.figures).toEqual([0]);
    expect(person.parts).toContain("p1");
    expect(person.props).not.toContain(1);
    expect(partsInBox(m, 0, c.parts, { x: 0.9, y: 0.02, w: 0.08, h: 0.08 }).parts).toEqual([]);
  });

  it("コマの時刻から、印の付いたキーフレームを引く", () => {
    expect(c.frames.map((f) => keyIndexAt(m, f.t))).toEqual([0, 2, 3]);
    expect(keyIndexAt(m, 1)).toBe(-1);
  });

  it("選んだ部品の値だけが変わり、ほかのキーフレーム・部品と経路は元のまま", () => {
    const got = structuredClone(m.keyframes[2]);
    got.figures[0] = { ...got.figures[0], x: 0.9, role: "lead", angles: { ...POSES.stand } };
    got.props[0] = { ...got.props[0], dx: 0.3, kind: "panel", figure: -1 };
    got.props[1] = { ...got.props[1], x: 0.7, size: 0.25 };
    const out = mergeRedo(m, 2, got, { figures: [0], props: [], parts: ["p1"] });
    expect(out.keyframes[2].figures[0].angles).toEqual(POSES.stand);
    // 角度だけ。位置・役は変えない。選んでいない小物も変えない
    expect(out.keyframes[2].figures[0].x).toBe(0.5);
    expect(out.keyframes[2].figures[0].role).toBe("new");
    expect(out.keyframes[2].props).toEqual(m.keyframes[2].props);
    for (const i of [0, 1, 3]) expect(out.keyframes[i]).toEqual(m.keyframes[i]);
    const after = { ...c, motion: { kind: "keyframes" as const, json: out } };
    for (const p of c.parts) expect(routeOf(after, p.id)).toEqual(routeOf(c, p.id));
    // 小物は位置と大きさだけ。種類と持ち手は変えない
    const prop = mergeRedo(m, 2, got, { figures: [], props: [0, 1], parts: ["p2", "p3"] }).keyframes[2].props;
    expect(prop[0]).toMatchObject({ kind: "tester", figure: 0, dx: 0.3 });
    expect(prop[1]).toMatchObject({ x: 0.7, size: 0.25 });
  });
});
