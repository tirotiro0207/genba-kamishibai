// 架空の会社の種データ（125）を書き出す。手元の D1 にある架空の会社の行（093a の署名済みの 10 枚と、その監査の記録・○× の組・言葉の欄）を
// demo/seed.sql に書く。まっさらな clone では、これを手元の D1 に入れると鍵なしで公開デモの画面が見られる（README の Quick Start）。
// 入れるのは架空の会社の行だけ。練習用と会社のテナントの行は読まない。
//
//   npx tsx scripts/demo-seed.ts       # 手元の D1 から demo/seed.sql を書き直す
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { insert, rows, TABLES } from "./demo-rows";

export const SEED = "demo/seed.sql";

function main() {
  const sql = ["-- 架空の会社（demo）の種データ。scripts/demo-seed.ts が手元の D1 から書き出す。手で直さない", "-- 入れ方: npx wrangler d1 execute DB --local --file demo/seed.sql"];
  for (const t of TABLES) {
    const rs = rows(t);
    console.log(`${t}: ${rs.length} 行`);
    for (const r of rs) sql.push(insert(t, r));
  }
  writeFileSync(join(import.meta.dirname, "..", SEED), sql.join("\n") + "\n", "utf-8");
  console.log(`${SEED} に書いた`);
}

main();
