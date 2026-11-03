// 付録（103・途中）: docs/appendix-build-effort.md の表の形。数は scripts/count.ts の出力を貼ったもので、
// 全体の表の項目が数えるスクリプトの項目と同じこと、数え方・前提・限界の節があること、人間のチームの推定は空欄でもよいことを見る
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toMarkdown } from "../scripts/count";

const md = readFileSync("docs/appendix-build-effort.md", "utf-8").replace(/\r\n/g, "\n");
const rowsOf = (text: string) => text.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| 項目")).map((l) => l.split("|")[1].trim());

describe("付録の表の形（103）", () => {
  it("数え方・前提・限界・人間のチームの推定の節が、この順にある", () => {
    const h2 = (md.match(/^## .+$/gm) ?? []).map((h) => h.slice(3));
    expect(h2).toEqual(["数えた表", "数え方", "前提", "限界", "人間のチームで作ったら（推定）"]);
  });

  it("全体の表の項目は、数えるスクリプトの全体の表の項目と同じ並び", () => {
    const zero = { commits: 0, tests: { node: 0, worker: 0, e2e: 0 }, files: { total: 0, byDir: [] }, days: [], lines: { total: 0, byDir: [] }, buildLog: [], unlogged: [] };
    const want = rowsOf(toMarkdown(zero).split("\n## ")[0]);
    const got = rowsOf(md.split("### 全体")[1].split("\n### ")[0]);
    expect(got).toEqual(want);
    for (const l of md.split("### 全体")[1].split("\n### ")[0].split("\n").filter((x) => x.startsWith("| ") && !x.startsWith("| 項目")))
      expect(l.split("|")[2].trim(), l).toMatch(/^\d+$/);
  });

  it("数えた時点のコミットと、数え直しの命令が書いてある", () => {
    expect(md).toMatch(/数えた時点: コミット [0-9a-f]{7}/);
    expect(md).toContain("npx tsx scripts/count.ts");
  });
});
