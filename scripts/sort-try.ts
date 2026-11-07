// 022 の試作: 同じ 1 ページを、Managed Agents と、API の自前の 1 回の呼び出しの両方で仕分けて、答え・時間・費用を並べる。
// ページは公開デモの元の文（架空の会社）と、決まりの無い目次のページ（ここに書いた架空の文）の 2 つ。
//
//   npx tsx scripts/sort-try.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { costUsd, guardedCall } from "../src/shared/claude";
import { makeClient } from "../src/node/client";
import { FileCallLog } from "../src/node/file-log";
import { ensureAgent, MA_MODEL, sortPageManaged } from "../src/node/managed-sort";
import { parseSort, SORT_SYSTEM } from "../src/shared/sort/page";

const PAGES = [
  { name: "労働条件通知書（架空の会社）", text: readFileSync(join(import.meta.dirname, "..", "demo", "notice.ja.txt"), "utf-8"), want: true },
  { name: "目次（架空）", text: "目次\n1. はじめに …… 1\n2. 会社の紹介 …… 3\n3. 用語の説明 …… 5\n4. 問い合わせ先 …… 8", want: false },
];

async function main() {
  const client = makeClient();
  const ids = await ensureAgent(client);
  const log = new FileCallLog();
  for (const p of PAGES) {
    const ma = await sortPageManaged(client, ids, p.text, { log });
    const t0 = Date.now();
    const msg = await guardedCall(
      { client, log },
      { purpose: "measure", label: "仕分けの試作（自前の 1 回）", params: { model: MA_MODEL, max_tokens: 2000, system: SORT_SYSTEM, messages: [{ role: "user", content: `次のページを仕分けてください。\n\n${p.text}` }] } },
    );
    const own = parseSort(msg.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
    console.log(`■ ${p.name}（見込み: ${p.want ? "する" : "しない"}）`);
    console.log(`  Managed Agents: ${ma.card ? "する" : "しない"} / ${ma.reason} / ${(ma.ms / 1000).toFixed(1)} 秒 / ${ma.usd ?? "?"} USD / セッションを消した: ${ma.deleted}`);
    console.log(`  自前の 1 回:     ${own.card ? "する" : "しない"} / ${own.reason} / ${((Date.now() - t0) / 1000).toFixed(1)} 秒 / ${costUsd(msg.model, msg.usage).toFixed(4)} USD`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
