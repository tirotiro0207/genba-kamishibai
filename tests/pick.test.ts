import { describe, expect, it } from "vitest";
import type { Rule } from "../src/shared/extract/rules";
import { choose, type PickNote, pickParams } from "../src/shared/make/pick";

// 063 の前の通しで足した、決まりを選ぶ段
const rule = (text: string, kind: "do" | "dont" = "do"): Rule => ({ kind, text, from: { quote: text, line: 1, line_end: 1, found: true }, reasons: [], checklist: false, reworded: false });
const note = (i: number, cls: PickNote["class"], weight: PickNote["weight"]): PickNote => ({ i, class: cls, weight, reason: "r" });

describe("決まりを選ぶ段", () => {
  it("「動き」だけを候補にし、危険の重い順・してはいけないことを先・同じ文は 1 つにする", () => {
    const rules = [rule("作業計画書を作る"), rule("保護メガネを着ける"), rule("と石の側面を使わない", "dont"), rule("保護メガネを着ける"), rule("回転中の刃に触らない", "dont"), rule("火花の養生をする")];
    const notes = [note(0, "書類・教育・資格", "高"), note(1, "動き", "中"), note(2, "動き", "高"), note(3, "動き", "中"), note(4, "動き", "高"), note(5, "物の名前", "高")];
    expect(choose(rules, notes, 2)).toEqual([2, 4]);
    expect(choose(rules, notes, 4)).toEqual([2, 4, 1]);
  });

  it("「動き」が無ければ 1 枚も選ばない。範囲の外の番号は捨てる", () => {
    const rules = [rule("教育を受ける"), rule("集中する")];
    expect(choose(rules, [note(0, "書類・教育・資格", "高"), note(1, "心がけ", "低"), note(7, "動き", "高")], 2)).toEqual([]);
  });

  it("決まりを番号つきで渡し、してはいけないことと点検表の印を付ける", () => {
    const p = pickParams([rule("吊り荷の下に入らない", "dont"), { ...rule("点検表で確かめる"), checklist: true }]);
    expect(JSON.stringify(p.messages)).toContain("0. [してはいけない] 吊り荷の下に入らない");
    expect(JSON.stringify(p.messages)).toContain("1. [する・点検表] 点検表で確かめる");
  });
});
