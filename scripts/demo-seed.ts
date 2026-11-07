// 架空の会社の種データ（125）を書き出す。手元の D1 にある架空の会社の行（093a の署名済みの 10 枚と、その監査の記録・○× の組・言葉の欄）を
// demo/seed.sql に書く。まっさらな clone では、これを手元の D1 に入れると鍵なしで公開デモの画面が見られる（README の Quick Start）。
// 入れるのは架空の会社の行だけ。練習用と会社のテナントの行は読まない。
//
//   npx tsx scripts/demo-seed.ts       # 手元の D1 から demo/seed.sql を書き直す
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { insert, rows, TABLES } from "./demo-rows";

export const SEED = "demo/seed.sql";

type Row = Record<string, unknown>;

/**
 * 監査の記録のうち、種のカードに無いカードを指す行を落とす。記録はハッシュの連鎖なので、連鎖の途中だけを落とすと
 * 確かめ（/audit/verify）が「行が抜けている」で止まる。落とすのは、連鎖の行が全部種に無いカードを指すときだけで、
 * そのときは連鎖の名前（audit_chains の行）も落とす。一部だけ外れる連鎖は書き出さずに止める
 */
function keepAudit(cardIds: Set<string>, chains: Row[], log: Row[]): { chains: Row[]; log: Row[]; dropped: string[] } {
  const dropped: string[] = [];
  for (const { chain } of chains) {
    const own = log.filter((r) => r.chain === chain);
    const outside = own.filter((r) => r.card_id !== null && r.card_id !== undefined && !cardIds.has(String(r.card_id)));
    if (outside.length === 0) continue;
    if (outside.length !== own.length) throw new Error(`連鎖 ${String(chain)} の一部（${outside.length}/${own.length} 行）が種に無いカードを指す。途中を落とすと連鎖が切れるので止めた`);
    dropped.push(String(chain));
  }
  return { chains: chains.filter((r) => !dropped.includes(String(r.chain))), log: log.filter((r) => !dropped.includes(String(r.chain))), dropped };
}

function main() {
  const sql = ["-- 架空の会社（demo）の種データ。scripts/demo-seed.ts が手元の D1 から書き出す。手で直さない", "-- 入れ方: npx wrangler d1 execute DB --local --file demo/seed.sql"];
  const all = Object.fromEntries(TABLES.map((t) => [t, rows(t)])) as Record<(typeof TABLES)[number], Row[]>;
  const cardIds = new Set(all.cards.map((r) => String(r.id)));
  const kept = keepAudit(cardIds, all.audit_chains, all.audit_log);
  if (kept.dropped.length) console.log(`種に無いカードだけを指す連鎖を落とした: ${kept.dropped.join(", ")}`);
  all.audit_chains = kept.chains;
  all.audit_log = kept.log;
  for (const t of TABLES) {
    const rs = all[t];
    console.log(`${t}: ${rs.length} 行`);
    for (const r of rs) sql.push(insert(t, r));
  }
  writeFileSync(join(import.meta.dirname, "..", SEED), sql.join("\n") + "\n", "utf-8");
  console.log(`${SEED} に書いた`);
}

main();
