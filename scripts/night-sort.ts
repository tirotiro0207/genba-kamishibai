// 夜間の仕分けを流す（023 の土台・043 で本番に流す）。private/pdf/<資料の名前>/pNNN.json のページの文を、1 ページずつ Managed Agents で仕分ける。
// 進み具合は D1 の night_pages に置くので、止めて同じ --run で流し直すと続きからになる。
//
//   npx tsx scripts/night-sort.ts <資料の名前> --run <番号> [--tenant <テナント>] [--remote] [--pages 1-5] [--fake]
//   --fake は API を呼ばず、決まった答えを返す（走り手の通しの確かめ用）。--remote は本番の D1 に置く
import { makeClient } from "../src/node/client";
import { ensureAgent, sortPageManaged } from "../src/node/managed-sort";
import { d1Sql, readPages, runNight, type SortPage } from "../src/node/night";

async function main() {
  const args = process.argv.slice(2);
  const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const doc = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !["--remote", "--fake"].includes(args[i - 1])));
  const runId = opt("--run");
  if (!doc || !runId) throw new Error("使い方: night-sort.ts <資料の名前> --run <番号> [--tenant <テナント>] [--remote] [--pages 1-5] [--fake]");
  const pages = readPages(doc, opt("--pages"));
  let sortPage: SortPage;
  if (args.includes("--fake")) {
    sortPage = async (text) => ({ card: text.length > 200, reason: "（API を呼ばない確かめ）", usd: 0, ms: 0 });
  } else {
    const client = makeClient();
    const ids = await ensureAgent(client);
    sortPage = (text) => sortPageManaged(client, ids, text);
  }
  const s = await runNight({ sql: d1Sql(args.includes("--remote") ? "remote" : "local"), runId, tenant: opt("--tenant") ?? "company", doc, pages, sortPage, log: (l) => console.log(l) });
  console.log(`走り手 ${s.run_id}: ${s.pages} ページ、この回 ${s.done_now}・飛ばした ${s.skipped}・失敗 ${s.errors}・走らせ直し ${s.resumes} 回・費用 ${s.usd.toFixed(2)} USD`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
