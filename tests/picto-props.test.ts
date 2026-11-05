import { describe, expect, it } from "vitest";
import { POSES } from "../src/shared/picto/poses";
import { characterSvg } from "../src/shared/picto/character";
import type { Outfit } from "../src/shared/picto/outfit";
import { A_POSE } from "../src/shared/picto/poses";
import { anchorPoint, craneTip, DEFAULT_JOINT, PROP_KINDS, type PropKind, type PropSpec } from "../src/shared/picto/props";
import { isWorn, renderFrame, ROLE_LOOK } from "../src/shared/picto/scene";
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
      const p: PropSpec = { kind, at, size: 0.15 };
      const svg = renderFrame({ figures: [F()], props: [p] }).svg;
      // 人に着けるかぶり物と安全帯は、小物の絵でなくキャラクターの服とかぶり物になる（11/5）
      if (isWorn(p)) expect(svg, kind).not.toBe(renderFrame({ figures: [F()] }).svg);
      else expect(svg, kind).toContain('data-part="prop"');
      expect(checkStyle(svg), kind).toEqual([]);
    }
  });

  it("白は人（肌・シャツ・新人のヘルメット）・背景・吹き出しの中だけ。頭に着けたかぶり物は役の明るさで描き分ける", () => {
    const svg = renderFrame({ figures: [F()], props: [{ kind: "helmet_new", at: { figure: 0, joint: "head" }, size: 0.1 }, { kind: "bubble_question", at: { figure: 0, joint: "head", dy: -0.1 }, size: 0.12 }] }).svg;
    expect(svg).toContain('data-part="bubble"');
    expect(checkStyle(svg)).toEqual([]);
    const hat = (kind: "helmet" | "helmet_new" | "cap_lead") => renderFrame({ figures: [F()], props: [{ kind, at: { figure: 0, joint: "head" }, size: 0.1 }] }).svg;
    expect(new Set([hat("helmet"), hat("helmet_new"), hat("cap_lead")]).size).toBe(3);
  });

  it("かぶり物は頭に着けるとキャラクターのかぶり物になり、size では変わらない", () => {
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

  it("枠・左の壁・床の線があり、人は最新のキャラクター（顔・服・丸い手）で描く（11/5 に古い人形から切り替えた）", () => {
    const svg = renderFrame({ figures: [F()] }).svg;
    for (const part of ["border", "wall", "ground", "figure"]) expect(svg, part).toContain(`data-part="${part}"`);
    const fig = svg.slice(svg.indexOf('data-part="figure"'));
    expect((fig.match(/<circle [^>]*r="15"/g) ?? []).length).toBe(2); // 丸い手 2 つ
    expect(fig).toContain('id="part_jacket"'); // 服
    expect(checkStyle(svg)).toEqual([]);
  });

  it("役を決めるとかぶり物が自動で付く（新人は白、上の人は黒、ほかの作業の人はグレー）", () => {
    const svg = (role: "new" | "lead" | "worker") => renderFrame({ figures: [{ ...F(), role }] }).svg;
    expect(new Set([svg("new"), svg("lead"), svg("worker")]).size).toBe(3);
    expect(ROLE_LOOK.new.headwear).toBe("helmet");
    expect(ROLE_LOOK.lead.headwear).toBe("cap");
    expect(ROLE_LOOK.worker.headwear).toBe("helmet");
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

  it("人に付けた安全帯はキャラクターのフルハーネスになり、置いた安全帯は小物の絵のまま（11/5）", () => {
    const on = renderFrame({ figures: [F()], props: [{ kind: "harness", at: { figure: 0, joint: "hip" }, size: 0.16 }] }).svg;
    const off = renderFrame({ figures: [F()], props: [{ kind: "harness", at: { x: 0.5, y: 0.5 }, size: 0.16 }] }).svg;
    expect(on).toContain('id="part_fullHarness"');
    expect(on).not.toContain('data-part="prop"');
    expect(off).toContain('data-part="prop"');
  });

  it("吊り元の綱は天井の線まで届く", () => {
    const svg = renderFrame({ figures: [F()], props: [{ kind: "anchor_line", at: { figure: 0, joint: "hip" }, size: 0.16 }] }).svg;
    expect(svg).toMatch(/<rect x="[\d.]+" y="46.1"/);
  });
});


describe("電気の現場の道具と保護具（11/5）", () => {
  const NEW: PropKind[] = ["aed", "cubicle", "wristband", "work_platform", "rolling_scaffold", "safety_shoes", "cut_gloves", "insulated_gloves",
    "voltage_detector", "cooling_vest", "step_stool", "armband", "crane", "insulated_boots", "dust_mask", "power_drill", "aerial_platform"];

  it("17 個の新しい小物と、今の名前の 4 個（保護めがね・台車・安全帯・脚立）がそろい、置いても手・頭に付けても絵柄のテストが通る", () => {
    for (const kind of [...NEW, "goggles", "cart", "harness", "stepladder"] as PropKind[]) {
      expect(PROP_KINDS, kind).toContain(kind);
      const placed = renderFrame({ figures: [F()], props: [{ kind, at: { x: 0.7, y: 0.86 }, size: 0.2 }] }).svg;
      expect(checkStyle(placed), kind).toEqual([]);
      const joint = DEFAULT_JOINT[kind];
      if (joint) expect(checkStyle(renderFrame({ figures: [F()], props: [{ kind, at: { figure: 0, joint }, size: 0.12 }] }).svg), kind).toEqual([]);
    }
  });

  it("クレーンの先の近くに置いた吊り荷は、先の真下へ寄ってワイヤーが先から垂れる（クレーンは自分のフックを描かない）", () => {
    const crane: PropSpec = { kind: "crane", at: { x: 0.4, y: 0.88 }, size: 0.4 };
    const tip = craneTip([0.4 * 768, 0.88 * 768], 0.4 * 768, 1);
    const alone = renderFrame({ figures: [F(0.15)], props: [crane] }).svg;
    const both = renderFrame({ figures: [F(0.15)], props: [crane, { kind: "suspended_load", at: { x: 0.66, y: 0.6 }, size: 0.14 }] }).svg;
    expect(both).toContain(`<line x1="${Math.round(tip[0] * 10) / 10}" y1="${Math.round(tip[1] * 10) / 10}"`);
    // 離れた吊り荷はつながず、上の端から吊る
    const far = renderFrame({ figures: [F(0.15)], props: [crane, { kind: "suspended_load", at: { x: 0.2, y: 0.5 }, size: 0.1 }] }).svg;
    expect(far).not.toContain(`y1="${Math.round(tip[1] * 10) / 10}"`);
    expect(alone.split("<line").length).toBeGreaterThan(1);
  });

  it("着る物は新しい人の絵にも着せられ、着せないときは今までの絵と 1 文字も変わらない", () => {
    const base = (outfit?: Outfit) => characterSvg({ angles: A_POSE.quarter, x: 100, groundY: 300, height: 270, facing: "right", view: "quarter", hair: "short", ...(outfit ? { outfit } : {}) } as never);
    const plain = base();
    expect(base({})).toBe(plain);
    const worn: Outfit[] = [{ eyewear: "goggles" }, { respirator: true }, { wear: [{ kind: "fullHarness" }] }, { wear: [{ kind: "fanJacket" }] }, { armband: "cross" },
      { wristband: true }, { glove: "cut" }, { glove: "insulated" }, { shoes: "safety" }, { bootsHigh: true }];
    for (const o of worn) expect(base(o), JSON.stringify(o)).not.toBe(plain);
    expect(base({ armband: "cross" })).not.toBe(base({ armband: true }));
  });
});
