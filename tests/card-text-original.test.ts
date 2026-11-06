// 絵のカードの文を直す（withText）と、原文の整え方（spans・tidy）（11/6 作者）
import { describe, expect, it } from "vitest";
import { withText } from "../src/client/card/TextEdit";
import { spans, tidy } from "../src/client/home/Original";
import { sampleCard } from "./fixtures/card";
import { validateCard } from "../src/shared/card";

describe("文を直す", () => {
  it("決まりを直すと statements の文も同じになり、2 文に分かれていたら 1 文にまとめて部品を付け替える", () => {
    const c = sampleCard();
    const why = c.statements.find((s) => s.field === "why")!;
    const extra = { ...why, id: "s9", text: "もう 1 文", sources: [{ kind: "doc" as const, doc: "manual", page: 9, line: 2 }] };
    c.statements.push(extra);
    c.parts[0] = { ...c.parts[0], statement: "s9" };
    const next = withText(c, "why", "新しい理由");
    expect(next.why).toBe("新しい理由");
    const mine = next.statements.filter((s) => s.field === "why");
    expect(mine).toHaveLength(1);
    expect(mine[0].text).toBe("新しい理由");
    expect(mine[0].sources).toContainEqual({ kind: "doc", doc: "manual", page: 9, line: 2 });
    expect(next.parts[0].statement).toBe(why.id);
    expect(validateCard(next)).toEqual([]);
    expect(withText(c, "rule", c.rule)).toBe(c);
  });
});

describe("原文の整え方", () => {
  it("同じページの続く行をまとめ、「・」だけの行を落としてつなぐ", () => {
    expect(spans([{ kind: "doc", doc: "m", page: 54, line: 31 }, { kind: "doc", doc: "m", page: 54, line: 30 }, { kind: "doc", doc: "m", page: 60, line: 2 }])).toEqual([
      { doc: "m", page: 54, from: 30, to: 31 },
      { doc: "m", page: 60, from: 2, to: 2 },
    ]);
    expect(tidy(["・", "施工上の誤りの有無、電線屑等の", "除去を行うこと"])).toEqual(["施工上の誤りの有無、電線屑等の除去を行うこと"]);
    expect(tidy(["・ 一つ目", "続き", "・二つ目"])).toEqual(["一つ目続き", "二つ目"]);
  });
});
