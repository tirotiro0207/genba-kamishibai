// 公開デモで使った費用（USD）を、本番の D1 の api_calls から日本時間の日ごとに出す（093b・毎日の報告の 1 行）。
//
//   npx tsx scripts/demo-cost.ts          # 本番
//   npx tsx scripts/demo-cost.ts --local  # 手元
import { execSync } from "node:child_process";
import { parseJson } from "./demo-rows";
import { join } from "node:path";

const where = process.argv.includes("--local") ? "--local" : "--remote --env production";
// at は UTC の ISO 文字列。9 時間足して日本時間の日付にする
const sql = "SELECT date(at, '+9 hours') AS day, count(*) AS calls, round(sum(usd), 4) AS usd FROM api_calls WHERE purpose = 'demo' GROUP BY day ORDER BY day";
const out = parseJson(execSync(`npx wrangler d1 execute DB ${where} --json --command "${sql}"`, { cwd: join(import.meta.dirname, ".."), encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] })) as { results: { day: string; calls: number; usd: number }[] }[];
const rows = out[0].results;
if (!rows.length) console.log("公開デモの費用: まだ 0 USD（呼び出し 0 回）");
for (const r of rows) console.log(`公開デモの費用 ${r.day}: ${r.usd} USD（呼び出し ${r.calls} 回、出どころは本番の D1 の api_calls）`);
