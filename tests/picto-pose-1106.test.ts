// 11/6 現場のヒアリングから足した部品: 横になる（lie_down）・シー（shush）・感電の絵（shock）
import { describe, expect, it } from "vitest";
import { characterJoints, characterSvg, type View } from "../src/shared/picto/character";
import { MOVING_POSES, poseAngles, viewFor } from "../src/shared/picto/poses";
import { checkStyle } from "../src/shared/picto/style";

const VIEWS: View[] = ["front", "quarter", "side"];
const spec = (name: "lie_down" | "shush" | "stand" | "walk", view: View, extra: object = {}) => {
  const p = poseAngles(name, view);
  return { angles: p.angles, len: p.len, shade: p.shade, x: 0, groundY: 0, height: 300, facing: "right" as const, view, hair: "short" as const, ...extra };
};

describe("横になる（lie_down）", () => {
  it("斜めと真横で、頭と足首が腰とほぼ同じ高さ（床に平らに横たわる）", () => {
    for (const v of ["quarter", "side"] as const) {
      const j = characterJoints(spec("lie_down", v));
      expect(Math.abs(j.head[1] - j.hip[1]), v).toBeLessThan(300 * 0.12);
      expect(Math.abs(j.foot_near[1] - j.hip[1]), v).toBeLessThan(300 * 0.12);
      expect(Math.abs(j.head[0] - j.foot_near[0]), v).toBeGreaterThan(300 * 0.7);
    }
  });
  it("動きの大きい姿勢なので、正面を頼まれたら斜めで描く", () => {
    expect(MOVING_POSES.has("lie_down")).toBe(true);
    expect(viewFor("lie_down", "front")).toBe("quarter");
  });
});

describe("シー（shush）", () => {
  it("3 つの向きで、手前の手が口の近く（顔のまん中より下・首より上）にあり、指を立てる", () => {
    for (const v of VIEWS) {
      const s = spec("shush", v, { finger: true });
      const j = characterJoints(s);
      expect(j.hand_near[1], v).toBeGreaterThan(j.head[1]);
      expect(j.hand_near[1], v).toBeLessThan(j.neck[1]);
      expect(Math.abs(j.hand_near[0] - j.head[0]), v).toBeLessThan(300 * 0.12);
      expect(characterSvg(s), v).toContain('rx="6" fill=');
      expect(characterSvg(spec("shush", v)), v).not.toContain('<rect x="-6" y="-34"');
    }
  });
});

describe("感電の絵（shock）", () => {
  it("体は黒だけで、その上に白い骨を描く。絵柄のテストが通る", () => {
    for (const v of VIEWS)
      for (const name of ["stand", "walk"] as const) {
        const s = characterSvg(spec(name, v, { shock: true, headwear: "helmet", role: "worker" }));
        const [body, bones] = s.split('<g data-part="shock">');
        expect(bones, `${name} ${v}`).toBeTruthy();
        const colors = (t: string) => new Set([...t.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]));
        for (const c of colors(body)) expect(["#000", "none"], `${name} ${v}`).toContain(c);
        for (const c of colors(bones)) expect(["#000", "#fff", "none"], `${name} ${v}`).toContain(c);
        expect(checkStyle(`<svg>${s}</svg>`), `${name} ${v}`).toEqual([]);
      }
  });
  it("shock が無いときは骨を描かない", () => {
    for (const v of VIEWS) expect(characterSvg(spec("stand", v))).not.toContain('data-part="shock"');
  });
});
