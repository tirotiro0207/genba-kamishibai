import { describe, expect, it } from "vitest";
import { count, countTests, taskIds, toMarkdown } from "../scripts/count";

// 113: 数えるスクリプトの前半
const log = ["2026-11-03\t005: 角度", "2026-11-03\t表を直す", "2026-11-02\t002・002b: 共通部品", "2026-11-02\t001: 骨組み"].join("\n");
const plan = ["| 001 | 骨組み | … | 済み |", "| 002 | 共通 | … | 済み |", "| 002b | 上限 | … | 済み |", "| 005 | 角度 | … | 済み |", "| 006 | 人形 | … | まだ |", "| 008 | 畳んだ | … | 済み |"].join("\n");
const files: Record<string, string> = {
  "README.md": "",
  "tests/a.test.ts": 'it("1", () => {});\n  it("2", () => {});\ndescribe.each([1])("x", () => { it.each([1, 2])("3", () => {}); });',
  "src/worker/b.test.ts": 'test("1", () => {});',
  "e2e/c.spec.ts": 'test("1", async () => {});\ntest("2", async () => {});',
};

describe("数えるスクリプト（113）", () => {
  const c = count(log, plan, Object.keys(files), (f) => files[f]);

  it("件名の頭からマスの番号を読む", () => {
    expect(taskIds("002・002b: 共通部品")).toEqual(["002", "002b"]);
    expect(taskIds("表を直す（003）")).toEqual([]);
    expect(countTests(files["tests/a.test.ts"])).toBe(2);
  });

  it("コミット・テスト・ファイルを数える", () => {
    expect(c.commits).toBe(4);
    expect(c.tests).toEqual({ node: 2, worker: 1, e2e: 2 });
    expect(c.files.total).toBe(4);
  });

  it("済んだマスを、最初のコミットの日に古い順で数える", () => {
    expect(c.days).toEqual([
      { day: "2026-11-02", commits: 2, done: ["001", "002", "002b"] },
      { day: "2026-11-03", commits: 2, done: ["005"] },
    ]);
    expect(c.unlogged).toEqual(["008"]);
  });

  it("表の形: 全体・フォルダごと・日ごとの 3 つの表", () => {
    const md = toMarkdown(c);
    expect(md.match(/^## .+$/gm)).toEqual(["## 全体", "## フォルダごとのファイル", "## 日ごと"]);
    expect(md).toContain("| コミット | 4 |");
    expect(md).toContain("| 2026-11-02 | 2 | 3 | 001・002・002b |");
    for (const row of md.split("\n").filter((l) => l.startsWith("|"))) expect(row.endsWith("|"), row).toBe(true);
  });
});
