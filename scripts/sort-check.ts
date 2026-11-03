// 仕分けの結果と、会期前の見込みの一覧を照合する（024・043）。仕分けが済んだあとに流す。
// 見込みの一覧はリポジトリの外のファイルで、場所は環境変数 SORT_EXPECTED_FILE（.env）で渡す。仕分けの走り手はこの変数を読まない。
// 結果の表は private/sort/<番号>.md に書く（ページの理由に資料の中身が入るので、git に入れない）。
//
//   npx tsx scripts/sort-check.ts --run <番号> [--remote]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadEnv } from "../src/node/client";
import { d1Sql } from "../src/node/night";
import { privatePath } from "../src/node/private-dir";
import { checkSort, parseExpected, type CheckRow } from "../src/shared/sort/check";

async function main() {
  const args = process.argv.slice(2);
  const runId = args.includes("--run") ? args[args.indexOf("--run") + 1] : undefined;
  if (!runId) throw new Error("使い方: sort-check.ts --run <番号> [--remote]");
  loadEnv();
  const file = process.env.SORT_EXPECTED_FILE;
  if (!file || !existsSync(file)) throw new Error("見込みの一覧が無い（.env の SORT_EXPECTED_FILE にリポジトリの外のファイルの場所を書く）");
  const expected = parseExpected(readFileSync(file, "utf-8"));
  const sql = d1Sql(args.includes("--remote") ? "remote" : "local");
  const rows = await sql(`SELECT page, state, card, reason FROM night_pages WHERE run_id = '${runId.replaceAll("'", "''")}' ORDER BY page`);
  if (!rows.length) throw new Error(`走り手 ${runId} のページが無い`);
  const s = checkSort(
    rows.map((r) => ({ page: Number(r.page), card: r.state === "done" ? Number(r.card) === 1 : null, reason: (r.reason as string) ?? null })),
    expected,
  );
  const line = (r: CheckRow) => `| ${r.page} | ${r.want ? "する" : "しない"} | ${r.got ? "する" : "しない"} | ${r.reason.replaceAll("|", "／")} |`;
  const md = [
    `# 仕分けの照合（走り手 ${runId}）`,
    "",
    `照合したページ ${s.pages}・一致 ${s.agree}（${s.pages ? ((s.agree / s.pages) * 100).toFixed(1) : "0"}%）・見込みはするが仕分けはしない ${s.missed.length}・見込みはしないが仕分けはする ${s.extra.length}・まだ ${s.pending.length}`,
    "",
    "| ページ | 見込み | 仕分け | 仕分けの理由 |",
    "|---|---|---|---|",
    ...[...s.missed, ...s.extra].sort((a, b) => a.page - b.page).map(line),
    "",
  ].join("\n");
  mkdirSync(privatePath("sort"), { recursive: true });
  writeFileSync(privatePath("sort", `${runId}.md`), md, "utf-8");
  console.log(md.split("\n")[2]);
  console.log(`不一致のページ: ${[...s.missed, ...s.extra].map((r) => r.page).sort((a, b) => a - b).join(", ") || "なし"}`);
  console.log(`表: ${privatePath("sort", `${runId}.md`)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
