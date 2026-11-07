// 夜間の仕分けを流す（023 の土台・043 で本番に流す）。private/pdf/<資料の名前>/pNNN.json のページの文を、1 ページずつ Managed Agents で仕分ける。
// 進み具合は D1 の night_pages に置くので、止めて同じ --run で流し直すと続きからになる。
//
//   npx tsx scripts/night-sort.ts <資料の名前> --run <番号> [--tenant <テナント>] [--remote] [--pages 1-5] [--fake]
//   --fake は API を呼ばず、決まった答えを返す（走り手の通しの確かめ用）。--remote は本番の D1 に置く
//   --sub は Managed Agents の代わりに、同じ指示をサブスクリプションの claude -p で 1 ページずつ呼ぶ（063 の前の通しの確かめ。手元の D1 だけ）
import { claudePMessage } from "../src/node/claude-p-client";
import { makeClient } from "../src/node/client";
import { FileCallLog } from "../src/node/file-log";
import { ensureAgent, MA_MODEL, sortPageManaged } from "../src/node/managed-sort";
import { costUsd } from "../src/shared/claude";
import { parseSort, SORT_SYSTEM } from "../src/shared/sort/page";
import { d1Sql, readPages, runNight, type SortPage } from "../src/node/night";

async function main() {
  const args = process.argv.slice(2);
  const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const doc = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !["--remote", "--fake", "--sub"].includes(args[i - 1])));
  const runId = opt("--run");
  if (!doc || !runId) throw new Error("使い方: night-sort.ts <資料の名前> --run <番号> [--tenant <テナント>] [--remote] [--pages 1-5] [--fake]");
  const pages = readPages(doc, opt("--pages"));
  let sortPage: SortPage;
  if (args.includes("--sub")) {
    if (args.includes("--remote")) throw new Error("--sub は手元の D1 だけ（本番には書かない）");
    sortPage = async (text) => {
      const t0 = Date.now();
      const m = await claudePMessage({ model: MA_MODEL, max_tokens: 4000, system: SORT_SYSTEM, output_config: { effort: "high" }, messages: [{ role: "user", content: `次のページを仕分けてください。

${text}` }] } as never);
      const r = parseSort(m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""));
      return { ...r, usd: costUsd(MA_MODEL, m.usage), ms: Date.now() - t0 };
    };
  } else if (args.includes("--fake")) {
    // 作りものの答えを本番に書くと、夜間の作成が監修者の答えとして読んでしまう
    if (args.includes("--remote")) throw new Error("--fake は手元の D1 だけ（本番には書かない）");
    sortPage = async (text) => ({ card: text.length > 200, reason: "（API を呼ばない確かめ）", usd: 0, ms: 0 });
  } else {
    const client = makeClient();
    const ids = await ensureAgent(client);
    // 夜間の費用も、ほかの呼び出しと同じ台帳（private/logs）に足し、全体の 1 日の上限を見てから呼ぶ
    const log = new FileCallLog();
    sortPage = (text) => sortPageManaged(client, ids, text, { log });
  }
  const s = await runNight({ sql: d1Sql(args.includes("--remote") ? "remote" : "local"), runId, tenant: opt("--tenant") ?? "company", doc, pages, sortPage, log: (l) => console.log(l) });
  console.log(`走り手 ${s.run_id}: ${s.pages} ページ、この回 ${s.done_now}・飛ばした ${s.skipped}・失敗 ${s.errors}・走らせ直し ${s.resumes} 回・費用 ${s.usd.toFixed(2)} USD`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
