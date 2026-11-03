import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 097: docs/failures.md の骨組み。3 つの欄があり、どの表の行にも数の欄がある（数は現場の確認のあとに入れる）
const s = readFileSync("docs/failures.md", "utf-8");

describe("うまくいかなかったことの骨組み（097）", () => {
  it("3 つの欄が決まった順に並ぶ", () => {
    expect(s.match(/^## .+$/gm)).toEqual(["## 1. 書き足しの件数と、止まったか", "## 2. 文を添えたカード", "## 3. 予測が外れたカード"]);
  });

  it("表の行は「項目 | 数」の 2 つの欄で、数は空か 0 以上の整数", () => {
    const rows = s.split("\n").filter((l) => /^\| (?!項目|---)/.test(l));
    expect(rows.length).toBe(10);
    for (const r of rows) {
      const c = r.split("|").slice(1, -1).map((x) => x.trim());
      expect(c, r).toHaveLength(2);
      expect(c[1], r).toMatch(/^(\d+)?$/);
    }
  });
});
