// 11/6 現場のヒアリングから足した部品: 横になる（lie_down）・シー（shush）・感電の絵（shock）
import { describe, expect, it } from "vitest";
import { characterJoints, characterSvg, type View } from "../src/shared/picto/character";
import { MOVING_POSES, poseAngles, viewFor } from "../src/shared/picto/poses";
import { checkStyle } from "../src/shared/picto/style";

const VIEWS: View[] = ["front", "quarter", "side"];
const spec = (name: "lie_down" | "lie_down_back" | "shush" | "stand" | "walk", view: View, extra: object = {}) => {
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
    for (const name of ["lie_down", "lie_down_back"] as const) {
      expect(MOVING_POSES.has(name)).toBe(true);
      expect(viewFor(name, "front")).toBe("quarter");
    }
  });
  it("仰向け（lie_down_back）も床に平らに横たわり、うつぶせと頭の向きが逆（顔が上）", () => {
    for (const v of ["quarter", "side"] as const) {
      const j = characterJoints(spec("lie_down_back", v));
      expect(Math.abs(j.head[1] - j.hip[1]), v).toBeLessThan(300 * 0.12);
      expect(Math.abs(j.foot_near[1] - j.hip[1]), v).toBeLessThan(300 * 0.12);
      // 右向きの人: うつぶせは頭が前（右）、仰向けは頭が後ろ（左）
      expect(j.head[0], v).toBeLessThan(j.foot_near[0]);
      expect(characterJoints(spec("lie_down", v)).head[0], v).toBeGreaterThan(characterJoints(spec("lie_down", v)).foot_near[0]);
    }
  });
  it("横になる姿勢は、目だけ閉じた痛い目（くの字の線 2 本）になる。立ち姿の目は変わらない", () => {
    const painEyes = (svg: string) => (svg.match(/<path d="M[-\d.]+ [-\d.]+L[-\d.]+ [-\d.]+L[-\d.]+ [-\d.]+" stroke="#000" stroke-width="3.5"/g) ?? []).length;
    for (const v of ["quarter", "side"] as const) {
      expect(painEyes(characterSvg(spec("stand", v))), v).toBe(0);
      const want = painEyes(characterSvg(spec("stand", v, { expression: "pain" })));
      expect(want, v).toBeGreaterThan(0);
      for (const name of ["lie_down", "lie_down_back"] as const) expect(painEyes(characterSvg(spec(name, v))), `${name} ${v}`).toBe(want);
    }
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

describe("シーの正面のひじ", () => {
  it("ひじは脇の横（肩より下・胸の高さ）にあり、目の高さまで上がらない", () => {
    const j = characterJoints(spec("shush", "front"));
    expect(j.elbow_near[1]).toBeGreaterThan(j.shoulder[1]);
    expect(j.elbow_near[1]).toBeGreaterThan(j.neck[1] + 300 * 0.05);
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
  it("shock が無いときは骨も放電のしるしも描かない", () => {
    for (const v of VIEWS) {
      expect(characterSvg(spec("stand", v))).not.toContain('data-part="shock"');
      expect(characterSvg(spec("stand", v))).not.toContain('data-part="spark"');
    }
  });
  it("放電のぎざぎざ 5 本と稲妻 2 つを描く", () => {
    for (const v of VIEWS) {
      const sp = characterSvg(spec("stand", v, { shock: true })).split('<g data-part="spark">')[1];
      expect(sp, v).toBeTruthy();
      expect(sp.match(/stroke-linejoin="miter"/g)?.length, v).toBe(5);
      expect(sp.match(/Z" transform/g)?.length, v).toBe(2);
    }
  });
});
