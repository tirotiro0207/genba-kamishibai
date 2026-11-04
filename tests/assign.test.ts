import { describe, expect, it } from "vitest";
import { assign, crossAssign } from "../src/shared/assign";

const P = Array.from({ length: 10 }, (_, i) => `p${i + 1}`);

describe("順番の乱数（011）", () => {
  it("同じ種なら同じ割り当て、違う種なら（たいてい）違う", () => {
    expect(assign("seed-1", P)).toEqual(assign("seed-1", P));
    const others = ["seed-2", "seed-3", "seed-4"].map((s) => JSON.stringify(assign(s, P)));
    expect(others.some((o) => o !== JSON.stringify(assign("seed-1", P)))).toBe(true);
  });

  it("項目 A と B で見せる順番が逆", () => {
    for (const a of assign("x", P)) expect(a.B).toEqual([a.A[1], a.A[0]]);
  });

  it("交差の割り当て（11/5）: 1 人が項目ごとに 1 回だけ、カードと文を 1 つずつ。国籍ごとに組が半分ずつ", () => {
    const people = [...["v1", "v2", "v3", "v4"].map((id) => ({ id, group: "ベトナム" })), ...["c1", "c2", "c3"].map((id) => ({ id, group: "カンボジア" }))];
    const a = crossAssign("seed-1", people);
    expect(crossAssign("seed-1", people)).toEqual(a);
    for (const x of a) {
      expect(x.A).toHaveLength(1);
      expect([x.A[0], x.B[0]].sort()).toEqual(["card", "text"]);
      expect(x.A[0]).toBe(x.set === 1 ? "card" : "text");
    }
    expect(a.filter((x) => x.group === "ベトナム" && x.set === 1)).toHaveLength(2);
    const odd = a.filter((x) => x.group === "カンボジア" && x.set === 1).length;
    expect([1, 2]).toContain(odd);
  });

  it("カードが先の人と文が先の人が半分ずつ", () => {
    const first = assign("x", P).map((a) => a.A[0]);
    expect(first.filter((f) => f === "card")).toHaveLength(5);
  });
});
