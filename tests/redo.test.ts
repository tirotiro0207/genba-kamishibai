import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { type CardScript, routeOf } from "../src/shared/card";
import { MemoryCallLog } from "../src/shared/claude";
import { keyIndexAt, mergeRedo, partsInBox, redoCard, redoParams } from "../src/shared/redo";
import { POSES } from "../src/shared/picto/poses";
import { SCRIPT, STORY, sampleCard } from "./fixtures/card";

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

  it("向き（facing）も取り込む。選んだ人だけで、left・right 以外の値は元のまま（11/6）", () => {
    const old = m.keyframes[2].figures[0].facing;
    const flip = old === "left" ? "right" : "left";
    const got = structuredClone(m.keyframes[2]);
    got.figures[0] = { ...got.figures[0], facing: flip };
    expect(mergeRedo(m, 2, got, { figures: [0], props: [], parts: ["p1"] }).keyframes[2].figures[0].facing).toBe(flip);
    expect(mergeRedo(m, 2, got, { figures: [], props: [1], parts: ["p3"] }).keyframes[2].figures[0].facing).toBe(old);
    const bad = structuredClone(m.keyframes[2]);
    bad.figures[0] = { ...bad.figures[0], facing: "up" as never };
    expect(mergeRedo(m, 2, bad, { figures: [0], props: [], parts: ["p1"] }).keyframes[2].figures[0].facing).toBe(old);
    expect(String(redoParams(m.keyframes[2], { figures: [0], props: [], parts: ["p1"] }, "親方の方を向いて").system)).toMatch(/向き（facing/);
  });
});

// 作り直しにも脚本（物語とそのコマの役）を渡す（11/6）
describe("作り直しに、カードの脚本を渡す", () => {
  const c = sampleCard();
  const m = c.motion.kind === "keyframes" ? c.motion.json : null!;
  const key = m.keyframes[2];
  const targets = { figures: [0], props: [], parts: ["p1"] };
  const script: CardScript = { ...SCRIPT, story: STORY };
  const content = (p: Anthropic.MessageCreateParamsNonStreaming) => String(p.messages[0].content);

  it("脚本の無いカードは、今までと同じ system と中身を渡す", () => {
    const p = redoParams(key, targets, "しゃがむのをやめる");
    expect(p.system).not.toMatch(/脚本/);
    expect(String(p.system).split("\n")).toHaveLength(4);
    expect(String(p.system)).toMatch(/^あなたは安全の絵カードの直し係です。/);
    expect(String(p.system)).toMatch(/吹き出しの中身は、受け取ったままの値で返してください。$/);
    expect(content(p)).toBe(`今の絵の JSON:\n${JSON.stringify(key)}\n\n直してよい部品:\nfigures[0]（new）の関節の角度と向き\n\n監修者の頼み: しゃがむのをやめる`);
    expect(redoParams(key, targets, "しゃがむのをやめる", undefined)).toEqual(p);
  });

  it("脚本のあるカードは、物語の要点と、作り直すコマの役と中身を渡す", () => {
    const p = redoParams(key, targets, "しゃがむのをやめる", { script, frame: 1, frameCount: 3 });
    const body = content(p);
    expect(body).toContain(`新人が最後に分かること: ${STORY.takeaway}`);
    expect(body).toContain(`山場の絵: ${STORY.peak_picture}`);
    expect(body).toContain(`結果の絵: ${STORY.result_picture}`);
    expect(body).toContain("作り直すコマ（2 コマ目・役は「山場」）: 新人／検電器を盤に当てる／見る人が分かること: 先に検電する");
    // 脚本は頼みの前。頼みは最後のまま
    expect(body.indexOf("このカードの物語")).toBeLessThan(body.indexOf("監修者の頼み"));
    expect(body.endsWith("監修者の頼み: しゃがむのをやめる")).toBe(true);
    // system は今までの文に、脚本の決まりを足しただけ
    const before = String(redoParams(key, targets, "x").system);
    expect(String(p.system).startsWith(before)).toBe(true);
    expect(String(p.system)).toMatch(/コマの役と物語から外れない/);
    expect(String(p.system)).toMatch(/頼みを優先/);
  });

  it("コマの数が脚本と合わないときは、コマの役は渡さず物語だけ渡す", () => {
    const body = content(redoParams(key, targets, "x", { script, frame: 1, frameCount: 4 }));
    expect(body).toContain(`新人が最後に分かること: ${STORY.takeaway}`);
    expect(body).not.toContain("作り直すコマ");
    expect(body).not.toContain("山場」");
  });

  it("物語の無い脚本は、きっかけとなぜの見せ方を物語の代わりに渡す", () => {
    const body = content(redoParams(key, targets, "x", { script: SCRIPT, frame: 0, frameCount: 3 }));
    expect(body).toContain(`きっかけ: ${SCRIPT.trigger}`);
    expect(body).toContain(`なぜの見せ方: ${SCRIPT.why_shown}`);
    expect(body).toContain("作り直すコマ（1 コマ目・役は「きっかけ」）");
  });

  it("redoCard は body.script と、そのコマの番号・カードのコマの数を渡す", async () => {
    const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const client = {
      messages: {
        create: async (params: Anthropic.MessageCreateParamsNonStreaming) => {
          sent.push(params);
          return { id: "m", type: "message", role: "assistant", model: params.model, stop_reason: "end_turn", stop_sequence: null, content: [{ type: "text", text: JSON.stringify(m.keyframes[2]) }], usage: { input_tokens: 10, output_tokens: 10 } } as unknown as Anthropic.Message;
        },
      },
    };
    const person = { x: 0, y: 0.1, w: 0.6, h: 0.8 };
    await redoCard({ client, log: new MemoryCallLog() }, "app", { ...c, script }, 1, person, "x");
    expect(content(sent[0])).toContain("作り直すコマ（2 コマ目・役は「山場」）");
    await redoCard({ client, log: new MemoryCallLog() }, "app", c, 1, person, "x");
    expect(content(sent[1])).not.toContain("このカードの物語");
    expect(sent[1].system).toBe(redoParams(m.keyframes[2], { figures: [0], props: [], parts: [] }, "x").system);
  });
});
