import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { runNight, type Sql } from "../src/node/night";
import { checkSort, parseExpected } from "../src/shared/sort/check";
import { SORT_SYSTEM } from "../src/shared/sort/page";

// 024: 仕分けの指示と照合。見込みの一覧は仕分けに渡さず、済んだあとに照合だけに使う
const root = join(import.meta.dirname, "..");

function memSql(): Sql {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY, kind TEXT, name TEXT, pin_hash TEXT); INSERT INTO tenants VALUES ('practice', 'practice', '練習用', NULL);");
  db.exec(readFileSync(join(root, "migrations", "0020_night.sql"), "utf-8"));
  return async (s) => (/^\s*SELECT/i.test(s) ? (db.prepare(s).all() as Record<string, unknown>[]) : (db.exec(s), []));
}

// 5 ページ（架空の文）。見込みは 2・3・5 ページが「する」
const PAGES = [
  { page: 1, text: "目次\n1. はじめに …… 1\n2. 服装 …… 2" },
  { page: 2, text: "作業の前に安全帯を着ける。" },
  { page: 3, text: "盤に触る前に検電器で確かめる。" },
  { page: 4, text: "用語の説明\n検電器: 電気が来ているかを調べる道具" },
  { page: 5, text: "会社の安全の方針と、委員会のしくみ" },
];
const EXPECTED_TEXT = "2\n3\n5 ※見込みだけの印";

describe("仕分けの指示と照合（024）", () => {
  it("指示は「作業員が守る決まりがあるか」を問い、yes/no と理由の JSON を求める", () => {
    expect(SORT_SYSTEM).toContain("作業員が守る決まり");
    expect(SORT_SYSTEM).toMatch(/"card": true か false/);
    expect(SORT_SYSTEM).toContain("reason");
  });

  it("5 ページを仕分けて照合すると、一致と不一致（見込みはするが仕分けはしない／その逆）が出る。仕分けに渡るのはページの文だけ", async () => {
    const seen: string[] = [];
    const sortPage = async (text: string) => {
      seen.push(text);
      // 決まりの言い方（〜る。）があれば「する」とだけ見る作りもの。5 ページ目は見込みとずれる
      const card = /る。/.test(text);
      return { card, reason: card ? "決まりがある" : "決まりが無い", usd: 0.01, ms: 1 };
    };
    const sql = memSql();
    await runNight({ sql, runId: "c1", tenant: "practice", doc: "manual", pages: PAGES, sortPage });
    // 仕分けに渡ったのはページの文そのものだけで、見込みの一覧の中身は混ざっていない
    expect(seen).toEqual(PAGES.map((p) => p.text));
    expect(seen.join("\n")).not.toContain("見込み");
    const rows = await sql("SELECT page, card, reason FROM night_pages WHERE run_id = 'c1' ORDER BY page");
    const s = checkSort(rows.map((r) => ({ page: Number(r.page), card: Number(r.card) === 1, reason: String(r.reason) })), parseExpected(EXPECTED_TEXT));
    expect(s).toMatchObject({ pages: 5, agree: 4, extra: [], pending: [] });
    expect(s.missed).toEqual([{ page: 5, got: false, want: true, reason: "決まりが無い" }]);
  });

  it("仕分けの走り手と指示は、見込みの一覧の置き場（SORT_EXPECTED_FILE）も照合も読まない", () => {
    for (const f of ["src/node/night.ts", "src/node/managed-sort.ts", "src/shared/sort/page.ts", "scripts/night-sort.ts"]) {
      const src = readFileSync(join(root, f), "utf-8");
      expect(src, f).not.toContain("SORT_EXPECTED");
      expect(src, f).not.toMatch(/from ".*sort\/check"|parseExpected\(|checkSort\(/);
    }
  });

  it("見込みの一覧は JSON の配列・{pages}・1 行 1 つの番号か範囲を読み、済んでいないページは「まだ」に分ける", () => {
    expect([...parseExpected("[3, 7]")]).toEqual([3, 7]);
    expect([...parseExpected('{"pages": [{"page": 4}]}')]).toEqual([4]);
    expect([...parseExpected("p.10\n12-14\n\n")]).toEqual([10, 12, 13, 14]);
    expect(() => parseExpected('["x"]')).toThrow();
    const s = checkSort([{ page: 1, card: true, reason: "x" }, { page: 2, card: null, reason: null }], new Set());
    expect(s).toMatchObject({ pages: 1, agree: 0, pending: [2] });
    expect(s.extra.map((r) => r.page)).toEqual([1]);
  });
});
