import { describe, expect, it } from "vitest";
import { framePngs, loadConf, loadNotice, pickRule, stampPng } from "../scripts/demo-cards";
import { assign, makerParams, type OkRule, SCENE_TEXT } from "../src/shared/make/maker";
import { sampleCard } from "./fixtures/card";

// 公開デモの架空の会社の元の文と 10 枚（093a）
const isPng = (b64: string) => Buffer.from(b64, "base64").subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

describe("架空の会社の元の文と 10 枚の割り当て", () => {
  const text = loadNotice();
  const lines = text.split("\n");
  const conf = loadConf();

  it("元の文がリポジトリにあり、架空の会社と分かる", () => {
    expect(lines[0]).toContain("架空の会社");
    expect(text).toContain("モデル労働条件通知書");
  });

  it("8 枚と ○× の組が、それぞれ見出しでない別の行を指す", () => {
    expect(conf.cards.map((c) => c.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const at = [...conf.cards.map((c) => c.line), conf.pair.good.line, conf.pair.bad.line];
    expect(new Set(at).size).toBe(10);
    for (const n of at) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(lines[n - 1]).not.toMatch(/^【/);
      expect(lines[n - 1].length).toBeGreaterThan(5);
    }
  });

  it("その行から取り出した、元の文に見つかった最初の決まりを選ぶ", () => {
    const r = (line: number, line_end = line, found = true) => ({ kind: "do" as const, text: "t", from: { line, line_end, found } });
    expect(pickRule([r(3), r(4, 5), r(4)], 4)).toBe(1);
    expect(pickRule([r(4, 4, false), r(4)], 4)).toBe(1);
    expect(pickRule([r(3)], 4)).toBe(-1);
  });

  it("確かめる AI に送るコマと電子印鑑は PNG", () => {
    const frames = framePngs(sampleCard());
    expect(frames.length).toBe(sampleCard().frames.length);
    expect(frames.every(isPng)).toBe(true);
    expect(isPng(stampPng().slice("data:image/png;base64,".length))).toBe(true);
  });

  it("○× の組は、○ と × の印の場面を作成の指示に入れる。場面が無ければ入れない", () => {
    const rule: OkRule = { kind: "do", text: "異常に気づいたら知らせる", from: { quote: "q", line: 1, line_end: 1, found: true }, reasons: [], checklist: false, reworded: false };
    const st = assign(rule, (f) => ({ kind: "doc", doc: "d", page: 1, line: f.line }));
    expect(String(makerParams(rule, st, undefined, undefined, "good").system)).toContain(SCENE_TEXT.good);
    expect(String(makerParams(rule, st, undefined, undefined, "bad").system)).toContain(SCENE_TEXT.bad);
    expect(SCENE_TEXT.good).toContain("circle_mark");
    expect(SCENE_TEXT.bad).toContain("cross_mark");
    expect(String(makerParams(rule, st).system)).not.toContain("○× の組");
  });
});
