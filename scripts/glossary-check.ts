// 用語表と 8 枚の「言葉」の欄の照合（056）。手元の D1 のそのテナントのカードと用語表を読み、食い違いを並べる。
// 食い違いがあれば終わりのコードを 1 にする。
//
//   npx tsx scripts/glossary-check.ts <テナント>
import { execSync } from "node:child_process";
import type { CardBody } from "../src/shared/card";
import { checkGlossary, type GlossaryRow } from "../src/shared/make/glossary-check";

// カードの本文は 1 枚で数百 KB になることがあり、execSync の既定（1 MB）では入りきらずに落ちた（11/5）。上限を 256 MB にする
const MAX_BUFFER = 256 * 1024 * 1024;
const d1 = <T>(q: string) =>
  (JSON.parse(execSync(`npx wrangler d1 execute DB --local --json --command "${q}"`, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: MAX_BUFFER })) as { results: T[] }[])[0].results;

function main() {
  const tenant = process.argv[2];
  if (!tenant || !/^[\w-]+$/.test(tenant)) throw new Error("テナントを渡す");
  const cards = d1<{ id: string; body: string }>(`SELECT id, body FROM cards WHERE tenant_id = '${tenant}'`).map((r) => ({ id: r.id, body: JSON.parse(r.body) as CardBody }));
  const rows = d1<GlossaryRow>(`SELECT ja, vi, card_id FROM glossary WHERE tenant_id = '${tenant}'`);
  const out = checkGlossary(cards, rows);
  for (const m of out) console.log(`${m.kind}\t${m.card_id.slice(0, 8)}\t${m.ja}\t${m.detail}`);
  console.log(`カード ${cards.length} 枚・用語 ${rows.length} 語・食い違い ${out.length} 件`);
  if (out.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
