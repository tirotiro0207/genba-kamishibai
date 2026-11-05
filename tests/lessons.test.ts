import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addDrawExtra, LESSONS, SUPERSEDED } from "../src/shared/make/lessons";
import { assign, makerParams, type OkRule } from "../src/shared/make/maker";

const from = (line: number) => ({ quote: "q", line, line_end: line, found: true });
const RULE: OkRule = { kind: "do", text: "盤に触る前に検電する", from: from(3), reasons: [{ text: "感電を防ぐ", from: from(4), stated: true }], checklist: false, reworded: false };
const locate = (f: { line: number }) => ({ kind: "doc" as const, doc: "m", page: 30, line: f.line });
const rulesOf = (s: string) => s.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("- "));
const D5 = readFileSync(join(import.meta.dirname, "..", "eval", "prompts", "draw_d5.txt"), "utf-8");
const D4 = readFileSync(join(import.meta.dirname, "..", "eval", "prompts", "draw_d4.txt"), "utf-8");

describe("作者の直しの教訓を作る係に入れる（11/6）", () => {
  it("絵を描く係の system に、既定で教訓が入る。lessons: false で外せる", () => {
    const sys = String(makerParams(RULE, assign(RULE, locate)).system);
    expect(sys).toContain(LESSONS);
    expect(sys).toContain("登場人物は少なく（ふつう 2 人まで）");
    expect(sys).toContain("danger_zone");
    expect(sys.indexOf(LESSONS)).toBeGreaterThan(sys.indexOf("部品ごとの経路"));
    const off = String(makerParams(RULE, assign(RULE, locate), undefined, undefined, undefined, undefined, undefined, { lessons: false }).system);
    expect(off).not.toContain("作者の直しから取り出した決まり");
  });

  it("教訓は eval/prompts/draw_d5.txt の決まりの行と同じで、脚本の話は入っていない", () => {
    expect(rulesOf(LESSONS)).toEqual(rulesOf(D5));
    expect(LESSONS).not.toContain("脚本");
  });

  it("足す決まり（--draw-extra）に、もう入っている行があれば省き、全部入っていれば何も足さない", () => {
    const sys = String(makerParams(RULE, assign(RULE, locate)).system);
    expect(addDrawExtra(sys, D5)).toBe(sys);
    const extra = "試しの決まり:\n- 新しい決まりの行\n- 登場人物は少なく（ふつう 2 人まで）。小物は決まりに要る物だけ。○・×・禁止の印ではっきり見せる。";
    const out = addDrawExtra(sys, extra);
    expect(out).toBe(`${sys}\n試しの決まり:\n- 新しい決まりの行`);
    expect(rulesOf(out).filter((l) => l.startsWith("- 登場人物は少なく"))).toHaveLength(1);
  });

  it("前の足す決まり d4 を渡しても、教訓とぶつかる古い行（台に立たせない・灯りは変えられない）も脚本の見出しも足さない", () => {
    const sys = String(makerParams(RULE, assign(RULE, locate)).system);
    for (const l of SUPERSEDED) expect(rulesOf(D4)).toContain(l);
    expect(addDrawExtra(sys, D4)).toBe(sys);
    expect(addDrawExtra(sys, D4)).not.toContain("床より高い所には立たせない");
  });
});
