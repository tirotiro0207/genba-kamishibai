// 手元の D1 の架空の会社（demo）のデータを、本番の D1 に写す（093b）。公開デモの「完成品を見る」の 10 枚（093a）を本番に置くため。
// 写すのは架空の会社の行だけ。本番にすでにある行は上書きしない（INSERT OR IGNORE）。絵は動きの数字から描くので、置き場（R2）は写さない。
//
//   npx tsx scripts/copy-demo-prod.ts           # 写す
//   npx tsx scripts/copy-demo-prod.ts --dry     # 行の数だけを出す
import { mkdirSync, writeFileSync } from "node:fs";
import { privatePath } from "../src/node/private-dir";
import { d1, insert, parseJson, rows, TABLES, TENANT } from "./demo-rows";

function main() {
  const dry = process.argv.includes("--dry");
  const sql: string[] = [];
  for (const t of TABLES) {
    const rs = rows(t);
    console.log(`${t}: ${rs.length} 行`);
    for (const r of rs) sql.push(insert(t, r));
  }
  if (dry) return;
  // 監査の記録はハッシュの連鎖。本番の demo に行があると、番号のぶつかる行だけ黙って捨てられ、残りの前の行のハッシュが合わなくなる
  const prodAudit = (parseJson(d1("--remote --env production", `--json --command "SELECT count(*) AS n FROM audit_log WHERE tenant_id = '${TENANT}'"`)) as { results: { n: number }[] }[])[0].results[0]?.n ?? 0;
  if (Number(prodAudit) > 0) throw new Error(`本番の ${TENANT} に監査の記録が ${prodAudit} 行ある。連鎖が切れるので写さない（copy-cards-prod.ts のようにつなぎ直す）`);
  mkdirSync(privatePath("tmp"), { recursive: true });
  const file = privatePath("tmp", "copy-demo-prod.sql");
  writeFileSync(file, sql.join("\n") + "\n", "utf-8");
  d1("--remote --env production", `--file "${file}" -y`);
  console.log(`本番の D1 に ${sql.length} 行を写した（すでにある行は飛ばした）`);
}

main();
