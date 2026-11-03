import { describe, expect, it } from "vitest";
import { POSES } from "../src/shared/picto/poses";
import { anchorPoint, DEFAULT_JOINT, PROP_KINDS, type PropSpec } from "../src/shared/picto/props";
import { renderFrame } from "../src/shared/picto/scene";
import { checkStyle } from "../src/shared/picto/style";

const F = (x = 0.4) => ({ x, height: 0.55, facing: "right" as const, angles: POSES.hands });

describe("小物の部品 2（018a）", () => {
  it("吊り荷と矢印・箒と箱・鍵と札がそろい、どれも絵柄のテストが通る", () => {
    expect([...PROP_KINDS]).toEqual(expect.arrayContaining(["suspended_load", "arrow_down", "broom", "box", "lock", "tag"]));
    for (const kind of ["suspended_load", "arrow_down", "broom", "box", "lock", "tag"] as const) {
      const svg = renderFrame({ figures: [F()], props: [{ kind, at: { figure: 0, joint: "hand_near" }, size: 0.15 }] }).svg;
      expect(svg, kind).toContain('data-part="prop"');
      expect(checkStyle(svg), kind).toEqual([]);
    }
  });

  it("人形のどこに付くかが数字で決まる（関節とずれ）", () => {
    const r = renderFrame({ figures: [F()] });
    const hand = r.posed[0].joints.hand_near;
    expect(anchorPoint({ figure: 0, joint: "hand_near" }, r.posed, 768).c).toEqual(hand);
    const moved = anchorPoint({ figure: 0, joint: "hand_near", dx: 0.1, dy: -0.05 }, r.posed, 768).c;
    expect(moved[0] - hand[0]).toBeCloseTo(0.1 * r.posed[0].h, 6);
    expect(moved[1] - hand[1]).toBeCloseTo(-0.05 * r.posed[0].h, 6);
    // 左向きの人では、ずれも左へ
    const l = renderFrame({ figures: [{ ...F(), facing: "left" }] });
    const lm = anchorPoint({ figure: 0, joint: "hand_near", dx: 0.1 }, l.posed, 768).c;
    expect(lm[0]).toBeLessThan(l.posed[0].joints.hand_near[0]);
    expect(anchorPoint({ x: 0.5, y: 0.25 }, [], 768).c).toEqual([384, 192]);
  });

  it("人形を動かすと、付けた小物もついて動く", () => {
    const p: PropSpec[] = [{ kind: "lock", at: { figure: 0, joint: "hand_near" }, size: 0.1 }];
    expect(renderFrame({ figures: [F(0.3)], props: p }).svg).not.toBe(renderFrame({ figures: [F(0.6)], props: p }).svg);
  });

  it("範囲の外は断る", () => {
    expect(() => renderFrame({ figures: [F()], props: [{ kind: "box", at: { figure: 2, joint: "hand_near" }, size: 0.1 }] })).toThrow(/人物の番号/);
    expect(() => renderFrame({ figures: [F()], props: [{ kind: "box", at: { x: 2, y: 0 }, size: 0.1 }] })).toThrow(/範囲の外/);
    expect(() => renderFrame({ figures: [F()], props: [{ kind: "box", at: { x: 0.5, y: 0.5 }, size: 0.9 }] })).toThrow(/size/);
  });
});

describe("小物の部品 3（018b）", () => {
  const KINDS = ["clock", "checklist", "prohibit", "circle_mark", "cross_mark"] as const;

  it("時計・手元のチェックリスト・禁止・○と× がそろい、どれも絵柄のテストが通る", () => {
    expect([...PROP_KINDS]).toEqual(expect.arrayContaining([...KINDS]));
    for (const kind of KINDS) {
      const svg = renderFrame({ figures: [F()], props: [{ kind, at: { x: 0.75, y: 0.3 }, size: 0.2 }] }).svg;
      expect(svg, kind).toContain('data-part="prop"');
      expect(checkStyle(svg), kind).toEqual([]);
    }
  });

  it("禁止の赤は禁止の部品の中だけで、ほかの部品は赤を使わない", () => {
    const svg = renderFrame({ figures: [F()], props: [{ kind: "prohibit", at: { figure: 0, joint: "hand_near" }, size: 0.3 }] }).svg;
    expect(svg).toContain('data-part="prohibit"');
    expect(svg).toMatch(/#d42a1e/);
    for (const kind of ["clock", "checklist", "circle_mark", "cross_mark"] as const) {
      expect(renderFrame({ figures: [F()], props: [{ kind, at: { x: 0.5, y: 0.3 }, size: 0.2 }] }).svg, kind).not.toMatch(/#d42a1e/);
    }
  });

  it("チェックリストは手に付き、人形を動かすとついて動く", () => {
    const p: PropSpec[] = [{ kind: "checklist", at: { figure: 0, joint: "hand_near" }, size: 0.15 }];
    expect(renderFrame({ figures: [F(0.3)], props: p }).svg).not.toBe(renderFrame({ figures: [F(0.6)], props: p }).svg);
  });
});

describe("小物の部品 1（017）", () => {
  const KINDS = ["helmet", "helmet_new", "cap_lead", "harness", "tester", "wire", "panel", "bubble_question", "bubble_check"] as const;

  it("輪 1〜5 の道具・役のかぶり物・吹き出しがそろい、どれも絵柄のテストが通る", () => {
    expect([...PROP_KINDS]).toEqual(expect.arrayContaining([...KINDS]));
    for (const kind of KINDS) {
      const joint = DEFAULT_JOINT[kind];
      const at = joint ? { figure: 0, joint } : { x: 0.8, y: 0.86 };
      const svg = renderFrame({ figures: [F()], props: [{ kind, at, size: 0.15 }] }).svg;
      expect(svg, kind).toContain('data-part="prop"');
      expect(checkStyle(svg), kind).toEqual([]);
    }
  });

  it("新人の白いヘルメットと吹き出しの白は、決まった部品の中だけ", () => {
    const svg = renderFrame({ figures: [F()], props: [{ kind: "helmet_new", at: { figure: 0, joint: "head" }, size: 0.1 }, { kind: "bubble_question", at: { figure: 0, joint: "head", dy: -0.1 }, size: 0.12 }] }).svg;
    expect(svg).toContain('data-part="helmet-new"');
    expect(svg).toContain('data-part="bubble"');
    expect(checkStyle(svg)).toEqual([]);
    // 作業の人のヘルメットと上の人の帽子は白を使わない
    for (const kind of ["helmet", "cap_lead"] as const) {
      const svg = renderFrame({ figures: [F()], props: [{ kind, at: { figure: 0, joint: "head" }, size: 0.1 }] }).svg;
      expect(svg.slice(svg.indexOf('data-part="prop"')), kind).not.toMatch(/#fff\b/);
    }
  });

  it("かぶり物は頭に付けると頭の大きさに合わせ、size では変わらない", () => {
    const a = renderFrame({ figures: [F()], props: [{ kind: "helmet", at: { figure: 0, joint: "head" }, size: 0.05 }] }).svg;
    const b = renderFrame({ figures: [F()], props: [{ kind: "helmet", at: { figure: 0, joint: "head" }, size: 0.3 }] }).svg;
    expect(a).toBe(b);
    const tall = renderFrame({ figures: [{ ...F(), height: 0.7 }], props: [{ kind: "helmet", at: { figure: 0, joint: "head" }, size: 0.05 }] }).svg;
    expect(tall).not.toBe(a);
  });

  it("手・腰・頭のどこに付くかが決まっていて、向きで左右が入れ替わる", () => {
    expect(DEFAULT_JOINT.tester).toBe("hand_near");
    expect(DEFAULT_JOINT.harness).toBe("hip");
    expect(DEFAULT_JOINT.helmet_new).toBe("head");
    const r = renderFrame({ figures: [F()], props: [{ kind: "tester", at: { figure: 0, joint: "hand_near" }, size: 0.12 }] }).svg;
    const l = renderFrame({ figures: [{ ...F(), facing: "left" }], props: [{ kind: "tester", at: { figure: 0, joint: "hand_near" }, size: 0.12 }] }).svg;
    expect(r).not.toBe(l);
  });
});

describe("作者のスケッチに合わせた見た目（11/2）", () => {
  const P = (kind: (typeof PROP_KINDS)[number], at: PropSpec["at"], size = 0.25, inner?: PropSpec["inner"]): PropSpec => ({ kind, at, size, ...(inner ? { inner } : {}) });

  it("枠・左の壁・床の線があり、人は丸い頭に目と口、ベスト、丸い手で描く", () => {
    const svg = renderFrame({ figures: [F()] }).svg;
    for (const part of ["border", "wall", "ground", "figure"]) expect(svg, part).toContain(`data-part="${part}"`);
    const fig = svg.slice(svg.indexOf('data-part="figure"'));
    expect((fig.match(/<circle /g) ?? []).length).toBeGreaterThanOrEqual(4); // 頭・目・手 2 つ
    expect(checkStyle(svg)).toEqual([]);
  });

  it("役を決めるとかぶり物が自動で付く（新人は白、上の人は黒、ほかの作業の人はグレー）", () => {
    const svg = (role: "new" | "lead" | "worker") => renderFrame({ figures: [{ ...F(), role }] }).svg;
    expect(svg("new")).toContain('data-part="helmet-new"');
    expect(svg("lead")).not.toContain('data-part="helmet-new"');
    expect(svg("lead")).not.toBe(svg("worker"));
    expect(() => renderFrame({ figures: [{ ...F(), role: "boss" as never }] })).toThrow(/role/);
  });

  it("考える吹き出しは点線と小さい丸、話す吹き出しはしっぽ。中に道具と「？」か「✓」", () => {
    const think = renderFrame({ figures: [F()], props: [P("think_question", { figure: 0, joint: "head", dy: -0.4 }, 0.27, "panel")] }).svg;
    const say = renderFrame({ figures: [F()], props: [P("bubble_check", { figure: 0, joint: "head", dy: -0.4 }, 0.27, "outlet")] }).svg;
    expect(think).toContain("stroke-dasharray");
    expect(say).toContain("<polygon");
    expect(say).not.toContain("stroke-dasharray");
    for (const s of [think, say]) expect(checkStyle(s)).toEqual([]);
    // 吹き出しでない小物に中身は付けられない
    expect(() => renderFrame({ figures: [F()], props: [P("lock", { x: 0.5, y: 0.5 }, 0.1, "panel")] })).toThrow(/inner/);
  });

  it("盤・コンセント・道具箱・✓ の丸がそろい、絵柄のテストが通る", () => {
    for (const kind of ["panel", "outlet", "toolbox", "check_mark", "tester"] as const) {
      const svg = renderFrame({ figures: [F()], props: [P(kind, { x: 0.2, y: 0.5 }, 0.15)] }).svg;
      expect(checkStyle(svg), kind).toEqual([]);
    }
  });
});

describe("伝わらない絵を直すために足した小物（058）", () => {
  it("体の具合が悪い印・幅の矢印・床の端・吊り元の綱・ごみ箱がそろい、どれも絵柄のテストが通る", () => {
    for (const kind of ["unwell", "anchor_line"] as const) {
      const svg = renderFrame({ figures: [F()], props: [{ kind, at: { figure: 0, joint: DEFAULT_JOINT[kind]! }, size: 0.16 }] }).svg;
      expect(svg, kind).toContain('data-part="prop"');
      expect(checkStyle(svg), kind).toEqual([]);
    }
    for (const kind of ["span_arrow", "edge", "trash_bin"] as const) {
      const svg = renderFrame({ figures: [F()], props: [{ kind, at: { x: 0.6, y: 0.88 }, size: 0.2 }] }).svg;
      expect(checkStyle(svg), kind).toEqual([]);
    }
  });

  it("人に付けた安全帯は肩とももにもベルトが付き、吹き出しの中の安全帯は腰のベルトだけ", () => {
    const on = renderFrame({ figures: [F()], props: [{ kind: "harness", at: { figure: 0, joint: "hip" }, size: 0.16 }] }).svg;
    const off = renderFrame({ figures: [F()], props: [{ kind: "harness", at: { x: 0.5, y: 0.5 }, size: 0.16 }] }).svg;
    // 肩から腰へ 2 本・胸 1 本・もも 2 本を、縁と中の 2 本の線で描く
    expect(on.split("<line").length - off.split("<line").length).toBe(10);
  });

  it("吊り元の綱は天井の線まで届く", () => {
    const svg = renderFrame({ figures: [F()], props: [{ kind: "anchor_line", at: { figure: 0, joint: "hip" }, size: 0.16 }] }).svg;
    expect(svg).toMatch(/<rect x="[\d.]+" y="46.1"/);
  });
});

