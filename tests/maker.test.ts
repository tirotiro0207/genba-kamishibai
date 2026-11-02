import { describe, expect, it } from "vitest";
import { MemoryCallLog } from "../src/shared/claude";
import { assign, makeCard, makerParams, type OkRule } from "../src/shared/make/maker";
import { fakeMaker } from "./fixtures/maker";

const from = (line: number) => ({ quote: "q", line, line_end: line, found: true });
const RULE: OkRule = { kind: "do", text: "盤に触る前に検電する", from: from(3), reasons: [{ text: "感電を防ぐ", from: from(4), stated: true }], checklist: false, reworded: false };
const locate = (f: { line: number }) => ({ kind: "doc" as const, doc: "m", page: 30, line: f.line });

describe("正式な流れの作成（034a）", () => {
  it("OK した 1 項目から、3〜4 コマで部品の全部に経路がある未承認の下書きの中身ができる", async () => {
    const client = fakeMaker();
    const log = new MemoryCallLog();
    const { card } = await makeCard({ client, log }, "app", RULE, locate);
    expect(card.frames.length).toBeGreaterThanOrEqual(3);
    expect(card.frames.length).toBeLessThanOrEqual(4);
    expect(card.statements).toEqual([
      { id: "s1", field: "rule", text: "盤に触る前に検電する", sources: [{ kind: "doc", doc: "m", page: 30, line: 3 }] },
      { id: "s2", field: "why", text: "感電を防ぐ", sources: [{ kind: "doc", doc: "m", page: 30, line: 4 }] },
    ]);
    expect(card.parts).toHaveLength(3);
    expect(log.records[0].label).toBe("作成（動きと経路）");
  });

  it("絵は直接描かせない（数字の JSON だけを求める）。点検表の型は手元の✓で描かせる", () => {
    const p = makerParams(RULE, assign(RULE, locate));
    const fmt = (p as unknown as { output_config: { format: { type: string; schema: { required: string[] } } } }).output_config.format;
    expect(fmt.type).toBe("json_schema");
    expect(fmt.schema.required).toEqual(["motion", "parts", "why"]);
    expect(String(p.system)).not.toMatch(/チェックリスト（checklist）に 1 つずつ/);
    expect(String(makerParams({ ...RULE, checklist: true }, assign(RULE, locate)).system)).toMatch(/チェックリスト（checklist）に 1 つずつ/);
  });

  it("経路の無い部品があれば 1 回だけ書き直させる", async () => {
    const client = fakeMaker({ dropPart: true });
    const { card, messages } = await makeCard({ client, log: new MemoryCallLog() }, "app", RULE, locate);
    expect(messages).toHaveLength(2);
    expect(String(client.sent[1].messages[0].content)).toMatch(/経路が無い/);
    expect(card.parts).toHaveLength(3);
  });

  it("元の文に理由が無いとき、AI が書いた理由は ai の文になる。元の文の理由は ai ではない", async () => {
    const noWhy = { ...RULE, reasons: [] };
    const { card } = await makeCard({ client: fakeMaker({ why: "電気が来ていると感電する" }), log: new MemoryCallLog() }, "app", noWhy, locate);
    expect(card.statements[1]).toMatchObject({ field: "why", text: "電気が来ていると感電する", ai: true });
    expect(card.why).toBe("電気が来ていると感電する");
    const inferred = { ...RULE, reasons: [{ text: "下の人に当たる", from: from(3), stated: false }] };
    expect(assign(inferred, locate)[1].ai).toBe(true);
  });
});
