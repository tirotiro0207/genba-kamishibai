import { describe, expect, it } from "vitest";
import { count, countBuildLog, countTests, fillAppendix, NOT_YET, readFailures, taskIds, toMarkdown } from "../scripts/count";

// 113: 数えるスクリプトの前半。097: 行数と制作記録の行
const log = ["2026-11-03\taaaa111\t005: 角度", "2026-11-03\tbbbb222\t表を直す", "2026-11-02\tcccc333\t費用を測る", "2026-11-02\t002・002b: 共通部品", "2026-11-02\t001: 骨組み"].join("\n");
const plan = ["| 001 | 骨組み | … | 済み |", "| 002 | 共通 | … | 済み |", "| 002b | 上限 | … | 済み |", "| 005 | 角度 | … | 済み |", "| 006 | 人形 | … | まだ |", "| 008 | 番号の無いコミット | … | 済み | 17 | cccc333 |", "| 115 | 後から足した | … | 済み | 3 | bbbb222, aaaa111 |", "| 036 | 畳んだ | … | 済み |  |  |", "| 026 | 途中 | … | 途中 |  |  |"].join("\n");
const files: Record<string, string> = {
  "README.md": "",
  "tests/a.test.ts": 'it("1", () => {});\n  it("2", () => {});\ndescribe.each([1])("x", () => { it.each([1, 2])("3", () => {}); });',
  "src/worker/b.test.ts": 'test("1", () => {});',
  "e2e/c.spec.ts": 'test("1", async () => {});\ntest("2", async () => {});',
  "docs/build-log.md": "# 制作記録\n\n→ 見出しの前の行は数えない\n\n## 2026-11-02（1 日目）\n\n→ 13:21 001 骨組み\n→ 14:00 002 共通\n\n## 2026-11-03（2 日目）\n\n→ 09:00 005 角度\n",
};

describe("数えるスクリプト（113）", () => {
  const c = count(log, plan, Object.keys(files), (f) => files[f]);

  it("件名の頭からマスの番号を読む", () => {
    expect(taskIds("002・002b: 共通部品")).toEqual(["002", "002b"]);
    expect(taskIds("表を直す（003）")).toEqual([]);
    expect(countTests(files["tests/a.test.ts"])).toBe(2);
  });

  it("コミット・テスト・ファイルを数える", () => {
    expect(c.commits).toBe(5);
    expect(c.tests).toEqual({ node: 2, worker: 1, e2e: 2 });
    expect(c.files.total).toBe(5);
    // コードの行: a.test.ts 3 行・b.test.ts 1 行・c.spec.ts 2 行。README と制作記録は数えない
    expect(c.lines).toEqual({ total: 6, byDir: [["tests", 3], ["e2e", 2], ["src", 1]] });
    expect(c.buildLog).toEqual([{ day: "2026-11-02", entries: 2 }, { day: "2026-11-03", entries: 1 }]);
    expect(countBuildLog("")).toEqual([]);
  });

  it("済んだマスを、最初のコミットの日に古い順で数える", () => {
    expect(c.days).toEqual([
      { day: "2026-11-02", commits: 3, done: ["001", "002", "002b", "008"] },
      { day: "2026-11-03", commits: 2, done: ["115", "005"] },
    ]);
    // 件名に番号が無くても、表の「コミット」の欄で日に数える（並んでいれば最初のコミット）。途中のマスは数えない
    expect(c.unlogged).toEqual(["036"]);
  });

  it("表の形: 全体・フォルダごと・日ごとの 3 つの表", () => {
    const md = toMarkdown(c);
    expect(md.match(/^## .+$/gm)).toEqual(["## 全体", "## フォルダごとのファイル", "## 日ごと"]);
    expect(md).toContain("| コミット | 5 |");
    expect(md).toContain("| 2026-11-02 | 3 | 4 | 2 | 001・002・002b・008 |");
    expect(md).toContain("| コードの行（ts・tsx・css・sql・mjs・js・py） | 6 |");
    expect(md).toContain("| 制作記録の行 | 3 |");
    expect(md).toContain("| tests | 1 | 3 |");
    for (const row of md.split("\n").filter((l) => l.startsWith("|"))) expect(row.endsWith("|"), row).toBe(true);
  });

  it("期間を渡すと、全体の表のあとに最初と最後のコミットの表が入る。渡さなければ入らない", () => {
    const span = { first: { at: "2026-11-02 13:21:39 +0900", hash: "cccc333" }, last: { at: "2026-11-03 09:00:00 +0900", hash: "aaaa111" } };
    const md = toMarkdown({ ...c, span });
    expect(md.match(/^## .+$/gm)).toEqual(["## 全体", "## 期間", "## フォルダごとのファイル", "## 日ごと"]);
    expect(md).toContain("| 最初のコミット | 2026-11-02 13:21:39 +0900 | cccc333 |");
    expect(toMarkdown(c)).not.toContain("## 期間");
  });

  it("付録の「数えた表」の節だけを貼り替え、数えた時点の行を書き換える", () => {
    const md = "# 付録\n\n- 数えた時点: コミット 0000000（2026-11-02）\n\n## 数えた表\n\n古い表\n\n## 数え方\n\n- そのまま\n";
    const out = fillAppendix(md, toMarkdown(c), { hash: "aaaa111", day: "2026-11-03" });
    expect(out).toContain("- 数えた時点: コミット aaaa111（2026-11-03）");
    expect(out).not.toContain("古い表");
    expect(out.match(/^### .+$/gm)).toEqual(["### 全体", "### フォルダごとのファイル", "### 日ごと"]);
    expect(out.endsWith("## 数え方\n\n- そのまま\n")).toBe(true);
    expect(() => fillAppendix("# 節が無い\n", "", { hash: "a", day: "b" })).toThrow();
  });

  it("failures.md の 3 つの欄を読み、数が空なら「まだ」と出す（097）", () => {
    const md = ["# x", "", "## 1. 書き足し", "", "| 項目 | 数 |", "|---|---|", "| 見た枚数 | 20 |", "| 書き足しの合計 |  |", "", "## 2. 文を添えたカード", "", "| 項目 | 数 |", "|---|---|", "| 文を添えたカード |  |"].join("\n");
    const rows = readFailures(md);
    expect(rows).toEqual([
      { section: "1. 書き足し", item: "見た枚数", value: "20" },
      { section: "1. 書き足し", item: "書き足しの合計", value: null },
      { section: "2. 文を添えたカード", item: "文を添えたカード", value: null },
    ]);
    const c = { ...count("", "", [], () => ""), failures: rows };
    const out = toMarkdown(c);
    expect(out).toContain("| 1. 書き足し | 見た枚数 | 20 |");
    expect(out).toContain(`| 2. 文を添えたカード | 文を添えたカード | ${NOT_YET} |`);
    expect(toMarkdown(count("", "", [], () => ""))).not.toContain("うまくいかなかったこと");
  });
});
