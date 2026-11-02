import { describe, expect, it } from "vitest";
import { assign } from "../src/shared/assign";

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

  it("カードが先の人と文が先の人が半分ずつ", () => {
    const first = assign("x", P).map((a) => a.A[0]);
    expect(first.filter((f) => f === "card")).toHaveLength(5);
  });
});
