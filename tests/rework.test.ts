import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { CardBody } from "../src/shared/card";
import { MemoryCallLog } from "../src/shared/claude";
import type { MotionJson } from "../src/shared/picto/motion";
import { POSES } from "../src/shared/picto/poses";
import { ReworkError, reworkCard, reworkErrors, reworkParams, takeAll, takeFrame } from "../src/shared/rework";
import { SCRIPT, sampleCard } from "./fixtures/card";

// 言葉で直す（11/6）: カード全体か 1 コマを、口語の頼みで作り直す
const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;
const motionOf = (c: CardBody) => (c.motion.kind === "keyframes" ? c.motion.json : null!);
const routes = (c: CardBody) => c.parts.map((p) => ({ type: (p.target as { type: "figure" | "prop" }).type, index: (p.target as { index: number }).index, statement: p.statement, reason: p.reason }));
const check = { kind: "check_mark" as const, show: true, figure: -1, joint: "hip" as const, dx: 0, dy: 0, x: 0.5, y: 0.15, size: 0.12, inner: "none" as const };

/** 作り直しの係の偽物。answers を順に返し、受け取った中身を残す */
function fake(...answers: unknown[]) {
  const seen: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client = {
    messages: {
      create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
        seen.push(p);
        return reply(answers[Math.min(seen.length - 1, answers.length - 1)]);
      },
    },
  };
  return { deps: { client, log: new MemoryCallLog() } as Parameters<typeof reworkCard>[0], seen };
}

/** カード全体の直しの答え: 2 つ目のキーフレームにも印を付けて 4 コマにし、最後のコマに ✓ を出す */
function wholeAnswer(c: CardBody) {
  const m = structuredClone(motionOf(c));
  m.keyframes[1].mark = true;
  m.keyframes.forEach((k, i) => k.props.push({ ...check, show: i === 3 }));
  m.keyframes[3].figures[0].expression = "serious" as never;
  return { motion: m, parts: [...routes(c), { type: "prop" as const, index: 2, statement: "s1", reason: "確かめた印" }], why: null };
}

describe("頼みを渡す中身", () => {
  it("今の絵の JSON・カードの文・範囲・頼みを渡し、脚本は渡さない", () => {
    const c = { ...sampleCard(), script: SCRIPT };
    const p = reworkParams(c, "1 コマ目を作業している場面に替えて", null);
    const user = String(p.messages[0].content);
    expect(user).toContain(JSON.stringify(motionOf(c)));
    expect(user).toContain("s1（守ること）: 盤に触る前に");
    expect(user).toContain("直す範囲: カード全体");
    expect(user).toContain("頼み: 1 コマ目を作業している場面に替えて");
    expect(user).not.toContain(SCRIPT.trigger);
    expect(String(p.system)).toContain("人数・小物・コマの数が変わるときは変えてよい");
    const one = reworkParams(c, "への字の顔に", 1);
    expect(String(one.messages[0].content)).toContain("直す範囲: 2 コマ目だけ（keyframes[2]）");
    expect(String(one.system)).toContain("ほかのキーフレームは受け取った値のまま返す");
  });
});

describe("カード全体の直し", () => {
  it("コマの数・小物・経路は答えのまま、文は元のまま、脚本は外れる", async () => {
    const c = { ...sampleCard(), script: SCRIPT };
    const { deps, seen } = fake(wholeAnswer(c));
    const out = await reworkCard(deps, "app", c, "最後に ✓ を出して、4 コマにして", null);
    expect(seen).toHaveLength(1);
    expect(seen[0].model).toBe("claude-opus-5-5");
    expect(out.calls).toBe(1);
    expect(out.body.frames.map((f) => f.t)).toEqual([0, 1, 2, 3]);
    expect(motionOf(out.body).keyframes[3].props[2]).toMatchObject({ kind: "check_mark", show: true });
    expect(out.body.parts.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(out.body.statements).toEqual(c.statements);
    expect(out.body.rule).toBe(c.rule);
    expect(out.body.script).toBeUndefined();
    expect(reworkErrors(out.body, null)).toEqual([]);
  });
});

describe("1 コマだけの直し", () => {
  it("そのコマのキーフレームだけを取り込み、ほかのコマは 1 つも変わらない。足した小物はほかのコマでは隠す", async () => {
    const c = sampleCard();
    const m = motionOf(c);
    const got = structuredClone(m);
    // 直すコマ（2 コマ目 = keyframes[2]）: しゃがむ → 手を出す、✓ を足す
    got.keyframes[2].figures[0].angles = { ...POSES.hands };
    got.keyframes[2].figures[0].expression = "serious" as never;
    // 足した ✓ を、頼んでいないコマにも show: true で入れてきた（ほかのコマでは隠す）
    got.keyframes.forEach((k) => k.props.push({ ...check, show: true }));
    // 頼んでいないコマも勝手に変えてきた（取り込まない）
    got.keyframes[0].figures[0].x = 0.8;
    got.keyframes[0].t = 0.5;
    const { deps } = fake({ motion: got, parts: [...routes(c), { type: "prop", index: 2, statement: "s1", reason: "確かめた" }], why: null });
    const out = await reworkCard(deps, "app", c, "2 コマ目は手を出して、真剣な顔に", 1);
    const k = motionOf(out.body).keyframes;
    expect(k[2].figures[0].angles).toEqual(POSES.hands);
    expect(k[2].figures[0].expression).toBe("serious");
    expect(k[2].props[2]).toMatchObject({ kind: "check_mark", show: true });
    for (const i of [0, 1, 3]) {
      expect(k[i].figures).toEqual(m.keyframes[i].figures);
      expect(k[i].props.slice(0, 2)).toEqual(m.keyframes[i].props);
      expect(k[i].t).toBe(m.keyframes[i].t);
    }
    // 足した小物は、答えが show: true でも、ほかのコマでは show: false
    for (const i of [0, 1, 3]) expect(k[i].props[2]).toMatchObject({ kind: "check_mark", show: false });
    expect(out.body.frames).toEqual(c.frames);
    expect(out.body.parts.slice(0, 3)).toEqual(c.parts);
    expect(out.body.parts[3]).toMatchObject({ id: "p4", target: { type: "prop", index: 2 } });
  });

  it("答えのキーフレームの数が違えば、そのコマの時刻の印のキーフレームを取り込み、足した小物はほかのコマで show: false にする", () => {
    const c = sampleCard();
    const m = motionOf(c);
    const key = structuredClone(m.keyframes[3]);
    key.props.push({ ...check });
    const got = { motion: { keyframes: [structuredClone(m.keyframes[0]), key] } as MotionJson, parts: [{ type: "prop" as const, index: 2, statement: "s1", reason: "確かめた" }] };
    const out = takeFrame(c, 3, got);
    const k = motionOf(out).keyframes;
    expect(k).toHaveLength(4);
    expect(k[3].props[2].show).toBe(true);
    for (const i of [0, 1, 2]) expect(k[i].props[2]).toMatchObject({ kind: "check_mark", show: false });
    expect(reworkErrors(out, 2)).toEqual([]);
  });

  it("端で切れる人は、直すコマだけを見る（ほかのコマは元のまま残すので）", () => {
    const c = sampleCard();
    motionOf(c).keyframes[0].figures[0].facing = "left";
    expect(reworkErrors(c, null)[0]).toMatch(/^1 コマ目の figures\[0\].*端で切れている/);
    expect(reworkErrors(c, 0)).toHaveLength(1);
    expect(reworkErrors(c, 1)).toEqual([]);
  });

  it("人数を変えた答えは 1 回だけ直させ、直れば取り込む", async () => {
    const c = sampleCard();
    const m = motionOf(c);
    const bad = structuredClone(m);
    bad.keyframes.forEach((k) => k.figures.push({ ...k.figures[0], role: "lead", x: 0.7 }));
    const good = structuredClone(m);
    good.keyframes[0].figures[0].angles = { ...POSES.stand };
    const { deps, seen } = fake({ motion: bad, parts: routes(c), why: null }, { motion: good, parts: routes(c), why: null });
    const out = await reworkCard(deps, "app", c, "1 コマ目は立ち止まって", 0);
    expect(out.calls).toBe(2);
    expect(String(seen[1].messages[0].content)).toContain("人数と役を変えない");
    expect(motionOf(out.body).keyframes[0].figures[0].angles).toEqual(POSES.stand);
  });
});

describe("形が壊れたとき", () => {
  it("2 回とも壊れていれば 502 で投げる", async () => {
    const c = sampleCard();
    const broken = structuredClone(motionOf(c));
    broken.keyframes.forEach((k) => (k.mark = false));
    const { deps, seen } = fake({ motion: broken, parts: routes(c), why: null });
    const e = await reworkCard(deps, "app", c, "全部やり直して", null).catch((x) => x);
    expect(e).toBeInstanceOf(ReworkError);
    expect((e as ReworkError).status).toBe(502);
    expect(seen).toHaveLength(2);
    expect(String(seen[1].messages[0].content)).toContain("前の答えを直してください");
  });

  it("経路の無い部品がある・JSON でない答えも直させる", async () => {
    const c = sampleCard();
    const noRoute = { ...wholeAnswer(c), parts: routes(c) };
    const { deps, seen } = fake(noRoute, wholeAnswer(c));
    expect((await reworkCard(deps, "app", c, "✓ を足して", null)).calls).toBe(2);
    expect(String(seen[1].messages[0].content)).toMatch(/経路|prop:2/);
    expect(takeAll(c, wholeAnswer(c)).frames).toHaveLength(4);
  });

  it("頼みが空・コマの番号が外れ・動きの HTML のカードは、呼ばずに 400", async () => {
    const c = sampleCard();
    const { deps, seen } = fake(wholeAnswer(c));
    for (const [text, frame] of [["  ", null], ["直して", 3], ["直して", -1]] as const) {
      const e = await reworkCard(deps, "app", c, text, frame).catch((x) => x);
      expect((e as ReworkError).status, `${text}・${frame}`).toBe(400);
    }
    const html = { ...c, motion: { kind: "html" as const, html: "<div data-part='a'></div>", duration: 3 } };
    expect(((await reworkCard(deps, "app", html, "直して", null).catch((x) => x)) as ReworkError).status).toBe(400);
    expect(seen).toHaveLength(0);
  });
});
