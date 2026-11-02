import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendHistory, historyRow, loadTuneItems, ROOT, runEval, watchedHash } from "../scripts/eval-hook";
import { privatePath } from "../src/node/private-dir";
import { claimsFromItem } from "../src/shared/eval/score";

describe("変更のたびに流すフック（003b）", () => {
  it("見張るファイルの中身が変わったときだけハッシュが変わる（改行の違いは見ない）", () => {
    mkdirSync(privatePath("tmp"), { recursive: true });
    const dir = mkdtempSync(join(privatePath("tmp"), "hook-"));
    mkdirSync(join(dir, "w"));
    writeFileSync(join(dir, "w", "a.ts"), "const a = 1;\n");
    const h1 = watchedHash(dir, ["w"]);
    writeFileSync(join(dir, "w", "a.ts"), "const a = 1;\r\n");
    expect(watchedHash(dir, ["w"])).toBe(h1);
    writeFileSync(join(dir, "other.ts"), "x");
    expect(watchedHash(dir, ["w"])).toBe(h1);
    writeFileSync(join(dir, "w", "a.ts"), "const a = 2;\n");
    expect(watchedHash(dir, ["w"])).not.toBe(h1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("調整用の 20 項目だけを読む", () => {
    expect(loadTuneItems()).toHaveLength(20);
  });

  it("最後の確認用の 10 項目を、フックのコードもテストも読まない", () => {
    const files = ["scripts", "src"].flatMap((d) => readdirSync(join(ROOT, d), { recursive: true, withFileTypes: true }).filter((f) => f.isFile()).map((f) => join(f.parentPath, f.name)));
    for (const f of files) expect(readFileSync(f, "utf-8")).not.toMatch(/eval\/holdout\//);
  });

  it("20 項目を流して数を合計し、履歴に 1 行ずつ増える", async () => {
    const items = loadTuneItems();
    // 偽物の取り出し: 正解の 1 つ目だけを返す。偽物の判定: 0 番どうしを組にする
    const byText = new Map(items.map((it) => [it.text, claimsFromItem(it)]));
    // 判定はわざと同じ組を 2 回返す。2 回目は落とされ、落とした数に数える
    const { score: s, dropped, repairs, before } = await runEval(items, async (t) => byText.get(t)!.slice(0, 1), async () => ({
      pairs: [{ gold: 0, pred: 0, verdict: "same" as const }, { gold: 0, pred: 0, verdict: "same" as const }],
      dangerousExtras: [],
    }));
    expect(dropped).toBe(20);
    expect(repairs).toHaveLength(20);
    expect(repairs[0]).toMatchObject({ no: items[0].no, reason: "duplicate" });
    const gold = items.reduce((n, it) => n + claimsFromItem(it).length, 0);
    expect(s).toMatchObject({ gold, pred: 20, matched: 20, missed: gold - 20, extra: 0, dangerous: 0 });

    const md1 = appendHistory("# 数字\n", historyRow(new Date("2026-11-02T06:00:00Z"), "abc", 20, s, dropped, 0.31, 42, before));
    const md2 = appendHistory(md1 + "\n## 次の節\n", historyRow(new Date("2026-11-02T07:00:00Z"), "def", 20, s, dropped, 0.3, 40, before));
    const rows = md2.split("\n").filter((l) => /^\| 2026-11-02/.test(l));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("| 2026-11-02 15:00 | abc |");
    expect(md2.indexOf("def")).toBeLessThan(md2.indexOf("## 次の節"));
  });
});
