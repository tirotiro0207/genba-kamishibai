import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { numberLines, parseRules, rulesParams, rulesToClaims, toSourceRef } from "../src/shared/extract/rules";

const TEXT = "高い所の作業\n足場の上では安全帯を使う。\n墜落を防ぐためである。\n使用前点検表の項目を確かめる。";
const reply = (obj: unknown) => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }] }) as unknown as Anthropic.Message;

describe("正式な取り出し（021）", () => {
  it("行番号を付けて渡し、評価の答えをプロンプトに入れていない", () => {
    expect(numberLines("a\nb")).toBe("1| a\n2| b");
    const p = JSON.stringify(rulesParams(TEXT));
    expect(p).toContain("2| 足場の上では安全帯を使う。");
    const items = JSON.parse(readFileSync("eval/items_tune_v1r8.json", "utf-8")) as { text: string; do: { text: string }[]; dont: { text: string }[]; why: { text: string }[] }[];
    const sys = String(rulesParams("x").system);
    for (const it of items) {
      for (const c of [...it.do, ...it.dont, ...it.why]) expect(sys).not.toContain(c.text);
      expect(sys).not.toContain(it.text.slice(0, 20));
    }
  });

  it("どこからは行の範囲と言葉で、行番号がずれていても言葉から直す", () => {
    const rules = parseRules(
      reply({
        rules: [
          { kind: "do", text: "足場の上では安全帯を使う", from: { quote: "足場の上では安全帯を使う", lines: [3] }, reasons: [{ text: "墜落を防ぐ", from: { quote: "墜落を防ぐため", lines: [3] }, stated: true }], checklist: false, reworded: false },
          { kind: "do", text: "点検表の項目を 1 つずつ確かめる", from: { quote: "使用前点検表の項目を確かめる", lines: [4, 4] }, reasons: [], checklist: true, reworded: false },
          { kind: "dont", text: "作り話", from: { quote: "どこにも無い言葉", lines: [9] }, reasons: [], checklist: false, reworded: false },
        ],
      }),
      TEXT,
    );
    expect(rules[0].from).toEqual({ quote: "足場の上では安全帯を使う", line: 2, line_end: 2, found: true });
    expect(rules[0].reasons[0]).toMatchObject({ stated: true, from: { line: 3, found: true } });
    expect(rules[1]).toMatchObject({ checklist: true, from: { line: 4, found: true } });
    expect(rules[2].from.found).toBe(false);
    expect(toSourceRef(rules[0].from, { doc: "manual", page: 30, lineOffset: 10 })).toEqual({ kind: "doc", doc: "manual", page: 30, line: 12 });
  });

  it("採点の形にすると、決まりは do・dont、理由は why で、同じ理由は 1 つ", () => {
    const f = { quote: "q", line: 1, line_end: 1, found: true };
    const claims = rulesToClaims([
      { kind: "do", text: "a", from: f, reasons: [{ text: "墜落を防ぐ", from: f, stated: true }], checklist: false, reworded: false },
      { kind: "dont", text: "b", from: f, reasons: [{ text: "墜落を 防ぐ", from: f, stated: false }], checklist: false, reworded: false },
    ]);
    expect(claims.map((c) => c.kind)).toEqual(["do", "dont", "why"]);
  });

  it("最後まで返らなければ止める", () => {
    expect(() => parseRules({ stop_reason: "max_tokens", content: [] } as unknown as Anthropic.Message, TEXT)).toThrow(/最後まで/);
  });
});
