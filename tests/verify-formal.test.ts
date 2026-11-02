import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { MemoryCallLog } from "../src/shared/claude";
import { makerParams } from "../src/shared/make/maker";
import { AGENT, bandOf, evidenceOf, type FormalReading, hasEvidence, judgeParams, rateOf, readParams, verifyCard } from "../src/shared/verify/formal";
import { sampleCard } from "./fixtures/card";

// 確かめる AI の正式版（047）
const IMG = { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: "AAAA" } };
const READING: FormalReading = { frames: [{ frame: 1, saw: "人が盤に近づく" }], meaning: "盤に触る前に道具を当てる", do: "道具を当てる", dont: null, why_guess: null, confidence: 60 };
const card = sampleCard();
const reply = (obj: unknown) => ({ model: "x", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;

describe("絵だけを順に渡す（作った側と別のエージェント）", () => {
  it("コマの番号と絵だけで、カードの文・決まり・資料の名前は入れない", () => {
    const p = readParams([IMG, IMG, IMG]);
    const c = p.messages[0].content as { type: string; text?: string }[];
    expect(c.map((b) => b.type)).toEqual(["text", "image", "text", "image", "text", "image", "text"]);
    expect(c.filter((b) => b.type === "text").map((b) => b.text)).toEqual(["1 コマ目", "2 コマ目", "3 コマ目", "全部で 3 コマです。このカードは何を伝えていますか。"]);
    const all = JSON.stringify(p);
    for (const s of [card.rule, card.why, ...card.statements.map((x) => x.text), "sample", "検電", "感電"]) expect(all).not.toContain(s);
  });

  it("作る側とは別の指示で、作る側の文脈を渡さない", () => {
    const maker = makerParams({ kind: "do", text: card.rule, from: { quote: "q", line: 1, line_end: 1, found: true }, reasons: [], checklist: false, reworded: false }, card.statements);
    expect(readParams([IMG]).system).not.toBe(maker.system);
    expect(readParams([IMG]).messages).toHaveLength(1);
    expect(String(readParams([IMG]).system)).toMatch(/日本語の文字は読めません/);
  });

  it("照らすときは、カードの文 1 つずつに番号を付けて渡す", () => {
    const t = JSON.stringify(judgeParams(card.statements, READING));
    expect(t).toContain("s1（守ること）");
    expect(t).toContain("s2（なぜ）");
  });
});

describe("伝わる率と帯", () => {
  it("守ること 6 割・なぜ 4 割。なぜが無ければ守ることで 10 割", () => {
    const pt = (id: string, credit: "full" | "partial" | "none") => ({ id, credit, frame: 1, reason: "r" });
    expect(rateOf(card.statements, [pt("s1", "full"), pt("s2", "full")])).toBe(100);
    expect(rateOf(card.statements, [pt("s1", "full"), pt("s2", "none")])).toBe(60);
    expect(rateOf(card.statements, [pt("s1", "partial"), pt("s2", "partial")])).toBe(50);
    expect(rateOf(card.statements, [pt("s1", "full")])).toBe(60);
    const onlyRule = card.statements.filter((s) => s.field === "rule");
    expect(rateOf(onlyRule, [pt("s1", "partial")])).toBe(50);
  });

  it("緑 80 以上・黄 60〜79・赤 60 未満。危ない読み違いは赤", () => {
    expect([bandOf(80, false), bandOf(79, false), bandOf(60, false), bandOf(59, false), bandOf(100, true)]).toEqual(["green", "yellow", "yellow", "red", "red"]);
  });
});

describe("証拠（どの絵を見て・何点で・なぜか）", () => {
  const j = { points: [{ id: "s1", credit: "full" as const, frame: 3, reason: "3 コマ目で当てている" }, { id: "s2", credit: "none" as const, frame: 9, reason: "理由は描かれていない" }, { id: "zz", credit: "full" as const, frame: 1, reason: "無い文" }], dangerous: false, danger_reason: null, summary: "やることは伝わるが、理由は伝わらない" };

  it("判定から証拠を作り、コマの番号が外なら外し、無い文の判定は数えない", () => {
    const e = evidenceOf(card, 3, READING, j);
    expect(e).toMatchObject({ agent: AGENT, frames: 3, cited: [3], rate: 60, band: "yellow", dangerous: false, reason: "やることは伝わるが、理由は伝わらない" });
    expect(e.points.map((p) => [p.id, p.frame])).toEqual([["s1", 3], ["s2", null]]);
    expect(hasEvidence(e, 3)).toBe(true);
    expect(hasEvidence(e, 4)).toBe(false);
  });

  it("危ない読み違いは理由に書き、赤にする", () => {
    const e = evidenceOf(card, 3, READING, { ...j, dangerous: true, danger_reason: "触ってから確かめると読める" });
    expect(e.band).toBe("red");
    expect(e.reason).toMatch(/危ない読み違い: 触ってから確かめる/);
  });

  it("見たコマ・点・理由のどれかが欠けたら証拠にならない", () => {
    const e = evidenceOf(card, 3, READING, j);
    expect(hasEvidence(null)).toBe(false);
    expect(hasEvidence({ ...e, agent: "maker" })).toBe(false);
    expect(hasEvidence({ ...e, reason: " " })).toBe(false);
    expect(hasEvidence({ ...e, rate: 120 })).toBe(false);
    expect(hasEvidence({ ...e, points: [] })).toBe(false);
    expect(hasEvidence({ ...e, frames: 0 })).toBe(false);
  });

  it("1 枚を確かめると、読む・照らすの 2 回を別々に呼び、費用の記録に残る", async () => {
    const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const client = {
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
          sent.push(p);
          return String(p.system).includes("新入社員です") ? reply(READING) : reply(j);
        },
      },
    };
    const log = new MemoryCallLog();
    const e = await verifyCard({ client, log }, "app", card, [IMG, IMG, IMG]);
    expect(sent).toHaveLength(2);
    expect(JSON.stringify(sent[0])).not.toContain(card.rule);
    expect(e.rate).toBe(60);
    expect(log.records.map((r) => r.label)).toEqual(["確かめる AI（正式・読む）", "確かめる AI（正式・照らす）"]);
  });
});
