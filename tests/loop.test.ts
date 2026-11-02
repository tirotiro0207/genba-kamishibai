import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { MemoryCallLog } from "../src/shared/claude";
import { checklistErrors, type OkRule } from "../src/shared/make/maker";
import { makeAndCheck, MAX_FIXES } from "../src/shared/make/loop";
import { readParams } from "../src/shared/verify/formal";
import { MOTION } from "./fixtures/card";

const from = (line: number) => ({ quote: "q", line, line_end: line, found: true });
const RULE: OkRule = { kind: "do", text: "盤に触る前に検電する", from: from(3), reasons: [{ text: "感電を防ぐ", from: from(4), stated: true }], checklist: false, reworded: false };
const locate = (f: { line: number }) => ({ kind: "doc" as const, doc: "m", page: 30, line: f.line });
const IMG = { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: "AAAA" } };
const reply = (obj: unknown) => ({ model: "x", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;

/** 作成・読み・照らし合わせを返す偽の client。照らすたびに credits の順に（守ること・なぜ）の判定を返す */
type C = "full" | "partial" | "none";
function fake(credits: [C, C][]) {
  const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let m = 0;
  return {
    sent,
    messages: {
      create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
        sent.push(p);
        const sys = String(p.system);
        if (sys.includes("部品ごとの経路"))
          return reply({ motion: MOTION, parts: [{ type: "figure", index: 0, statement: "s1", reason: "人" }, { type: "prop", index: 0, statement: "s1", reason: "検電器" }, { type: "prop", index: 1, statement: "s1", reason: "盤" }], why: null });
        if (sys.includes("新入社員です")) return reply({ frames: [{ frame: 1, saw: "盤の前の人" }], meaning: "盤を見ている", do: "見る", dont: null, why_guess: null, confidence: 40 });
        const [a, b] = credits[m++] ?? ["full", "full"];
        return reply({ points: [{ id: "s1", credit: a, frame: 1, reason: "検電器を当てていない" }, { id: "s2", credit: b, frame: 1, reason: "感電" }], dangerous: false, danger_reason: null, summary: "検電器を当てていない" });
      },
    },
  };
}

describe("手元の✓と直しのループ（034b）", () => {
  it("点検表の型は、チェックリストと ✓ の印が無いと通らない", () => {
    expect(checklistErrors(RULE, MOTION)).toEqual([]);
    expect(checklistErrors({ ...RULE, checklist: true }, MOTION).join()).toMatch(/checklist の小物が無い/);
    const m = structuredClone(MOTION);
    for (const k of m.keyframes) k.props.push({ kind: "checklist", show: true, figure: 0, joint: "hand_near", dx: 0, dy: 0, x: 0, y: 0, size: 0.12, inner: "none" }, { kind: "check_mark", show: true, figure: -1, joint: "hip", dx: 0, dy: 0, x: 0.6, y: 0.3, size: 0.08, inner: "none" });
    expect(checklistErrors({ ...RULE, checklist: true }, m)).toEqual([]);
  });

  it("コマは順に絵だけを渡す", () => {
    const p = readParams([IMG, IMG, IMG]);
    const c = p.messages[0].content as { type: string }[];
    expect(c.map((b) => b.type)).toEqual(["text", "image", "text", "image", "text", "image", "text"]);
    expect(JSON.stringify(p)).not.toContain("検電");
  });

  it("赤なら、どう読まれたかを渡して作り直し、緑で止まる", async () => {
    const client = fake([["none", "full"], ["full", "full"]]);
    const checks = await makeAndCheck({ client, log: new MemoryCallLog() }, "app", RULE, locate, { render: () => IMG });
    expect(checks.map((c) => [c.evidence.rate, c.red])).toEqual([[40, true], [100, false]]);
    const remake = client.sent.filter((p) => String(p.system).includes("部品ごとの経路"))[1];
    expect(String(remake.messages[0].content)).toMatch(/盤を見ている.*伝わる率 40%.*s1: 検電器を当てていない/);
  });

  it("作り直しの回数の上限は設定で変えられ、夜間は 0", async () => {
    expect(MAX_FIXES.night).toBe(0);
    const night = await makeAndCheck({ client: fake([["none", "none"], ["none", "none"], ["none", "none"]]), log: new MemoryCallLog() }, "night", RULE, locate, { render: () => IMG });
    expect(night).toHaveLength(1);
    const one = await makeAndCheck({ client: fake([["none", "none"], ["none", "none"], ["none", "none"], ["none", "none"]]), log: new MemoryCallLog() }, "app", RULE, locate, { render: () => IMG, maxFixes: 1 });
    expect(one).toHaveLength(2);
    expect(one.at(-1)?.red).toBe(true);
  });
});
