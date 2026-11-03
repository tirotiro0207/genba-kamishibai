// 架空の会社の種データ（125）の検査。demo/seed.sql は scripts/demo-seed.ts が手元の D1 から書き出す。
// 架空の会社の行だけであること、決まった表だけであること、署名済みのカードが 10 枚あることを調べる。入れて画面が開くかは録画（demo・try）で見る
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TABLES = ["cards", "audit_chains", "audit_log", "card_pairs", "glossary", "company_words", "extractions", "extraction_oks", "card_opens"];
const lines = readFileSync("demo/seed.sql", "utf-8").split("\n").filter((l) => l && !l.startsWith("--"));

describe("架空の会社の種データ（125）", () => {
  it("どの行も、決まった表への上書きしない INSERT で、テナントは架空の会社だけ", () => {
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      const m = l.match(/^INSERT OR IGNORE INTO (\w+) \(tenant_id, [\w, ]+\) VALUES \('([^']*)', /);
      expect(m, l.slice(0, 80)).not.toBeNull();
      expect(TABLES).toContain(m![1]);
      expect(m![2]).toBe("demo");
    }
  });

  it("カードは 10 枚で、どれも署名済み", () => {
    const cards = lines.filter((l) => l.startsWith("INSERT OR IGNORE INTO cards "));
    expect(cards).toHaveLength(10);
    for (const l of cards) {
      const cols = l.match(/\(([^)]*)\) VALUES/)![1].split(", ");
      const status = cols.indexOf("status");
      expect(status).toBeGreaterThan(0);
      expect(l).toMatch(/'signed'/);
    }
  });

  it("入れ方の 1 命令が頭に書いてあり、README の Quick Start と同じ", () => {
    const cmd = "npx wrangler d1 execute DB --local --file demo/seed.sql";
    expect(readFileSync("demo/seed.sql", "utf-8")).toContain(cmd);
    expect(readFileSync("README.md", "utf-8")).toContain(cmd);
    expect(readFileSync("README.ja.md", "utf-8")).toContain(cmd);
  });
});
