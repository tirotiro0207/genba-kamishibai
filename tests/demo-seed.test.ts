// 架空の会社の種データ（125）の検査。demo/seed.sql は scripts/demo-seed.ts が手元の D1 から書き出す。
// 架空の会社の行だけであること、決まった表だけであること、署名済みのカードが 10 枚あることを調べる。入れて画面が開くかは録画（demo・try）で見る
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TABLES = ["cards", "audit_chains", "audit_log", "card_pairs", "glossary", "company_words", "extractions", "extraction_oks", "card_opens", "card_posts", "sample_reviews", "morning_sets"];
const lines = readFileSync("demo/seed.sql", "utf-8").split("\n").filter((l) => l && !l.startsWith("--"));

/** INSERT の VALUES (...) を列ごとの値に割る。文字は '' を ' に戻し、文字でない値（数・NULL）はそのままの字で返す */
function sqlValues(line: string): string[] {
  const s = line.slice(line.indexOf(") VALUES (") + ") VALUES (".length);
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    while (s[i] === " ") i++;
    if (s[i] === "'") {
      let v = "";
      for (i++; i < s.length; i++) {
        if (s[i] === "'" && s[i + 1] === "'") (v += "'"), i++;
        else if (s[i] === "'") break;
        else v += s[i];
      }
      out.push(v);
      i++;
    } else {
      const end = s.slice(i).search(/[,)]/);
      out.push(s.slice(i, i + end).trim());
      i += end;
    }
    while (s[i] === " ") i++;
    if (s[i] !== ",") break;
    i++;
  }
  return out;
}

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
      // 列の位置の値そのものを見る（本文の JSON の中に 'signed' があっても通さない）
      expect(sqlValues(l)[status]).toBe("signed");
    }
  });

  it("入れ方の 1 命令が頭に書いてあり、README の Quick Start と同じ", () => {
    const cmd = "npx wrangler d1 execute DB --local --file demo/seed.sql";
    expect(readFileSync("demo/seed.sql", "utf-8")).toContain(cmd);
    expect(readFileSync("README.md", "utf-8")).toContain(cmd);
    expect(readFileSync("README.ja.md", "utf-8")).toContain(cmd);
  });
});
