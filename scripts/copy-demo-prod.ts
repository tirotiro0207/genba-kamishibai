// 手元の D1 の架空の会社（demo）のデータを、本番の D1 に写す（093b）。公開デモの「完成品を見る」の 10 枚（093a）を本番に置くため。
// 写すのは架空の会社の行だけ。本番にすでにある行は上書きしない（INSERT OR IGNORE）。絵は動きの数字から描くので、置き場（R2）は写さない。
//
//   npx tsx scripts/copy-demo-prod.ts           # 写す
//   npx tsx scripts/copy-demo-prod.ts --dry     # 行の数だけを出す
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { privatePath } from "../src/node/private-dir";

const ROOT = join(import.meta.dirname, "..");
const TENANT = "demo";
// 親の表から順に（外部キーの向き）
export const TABLES = ["cards", "audit_chains", "audit_log", "card_pairs", "glossary", "company_words", "extractions", "extraction_oks", "card_opens"] as const;

const d1 = (where: string, args: string) => execSync(`npx wrangler d1 execute DB ${where} ${args}`, { cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });

function rows(table: string): Record<string, unknown>[] {
  const out = JSON.parse(d1("--local", `--json --command "SELECT * FROM ${table} WHERE tenant_id = '${TENANT}'"`)) as { results: Record<string, unknown>[] }[];
  return out[0].results;
}

const lit = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replaceAll("'", "''")}'`);

function main() {
  const dry = process.argv.includes("--dry");
  const sql: string[] = [];
  for (const t of TABLES) {
    const rs = rows(t);
    console.log(`${t}: ${rs.length} 行`);
    for (const r of rs) {
      const cols = Object.keys(r);
      sql.push(`INSERT OR IGNORE INTO ${t} (${cols.join(", ")}) VALUES (${cols.map((c) => lit(r[c])).join(", ")});`);
    }
  }
  if (dry) return;
  mkdirSync(privatePath("tmp"), { recursive: true });
  const file = privatePath("tmp", "copy-demo-prod.sql");
  writeFileSync(file, sql.join("\n") + "\n", "utf-8");
  d1("--remote --env production", `--file "${file}" -y`);
  console.log(`本番の D1 に ${sql.length} 行を写した（すでにある行は飛ばした）`);
}

main();
