// 064: 監修者が見る 20 枚を種で選び、記入欄（CSV）を private/review64/ に書く。記入が戻ったら集計して numbers.md に貼る表を出す。
// 手元の D1 だけを読む（本番は読まない）。
//
//   npx tsx scripts/sample20.ts --tenant <テナント> --seed <種> [--run <夜間の一括の run_id>]   # 20 枚を選んで記入欄を書く
//   npx tsx scripts/sample20.ts --read <記入した CSV>                                         # 集計する
//
// --run があれば、その夜間の一括で作ったカード（night_drafts の card_id）から選ぶ。無ければテナントのカード全部から選ぶ
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Exec, execD1, wranglerExec } from "../src/node/d1-node";
import { privatePath } from "../src/node/private-dir";
import { formCsv, pickSample, readForm, SAMPLE_SIZE, summarize, summaryMarkdown } from "../src/shared/sample20";

export async function makeForm(exec: Exec, tenant: string, seed: string, run?: string) {
  const db = execD1(exec);
  const rows = run
    ? (await db.prepare("SELECT c.id, c.body FROM night_drafts d JOIN cards c ON c.id = d.card_id WHERE d.tenant_id = ? AND d.run_id = ?").bind(tenant, run).all<{ id: string; body: string }>()).results
    : (await db.prepare("SELECT id, body FROM cards WHERE tenant_id = ?").bind(tenant).all<{ id: string; body: string }>()).results;
  const title = new Map(rows.map((r) => [r.id, String((JSON.parse(r.body) as { rule?: string }).rule ?? "")]));
  const picked = pickSample(seed, [...title.keys()]).map((id) => ({ id, title: title.get(id) ?? "" }));
  return { total: rows.length, picked, csv: formCsv(seed, picked) };
}

async function main() {
  const a = process.argv.slice(2);
  const opt = (k: string) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
  const read = opt("--read");
  if (read) {
    const f = readForm(readFileSync(read, "utf-8"));
    process.stdout.write(summaryMarkdown(f.seed, summarize(f.entries), f.blank));
    return;
  }
  const tenant = opt("--tenant");
  const seed = opt("--seed");
  if (!tenant || !seed) throw new Error("使い方: npx tsx scripts/sample20.ts --tenant <テナント> --seed <種> [--run <run_id>]");
  const { total, picked, csv } = await makeForm(wranglerExec("local"), tenant, seed, opt("--run"));
  const dir = privatePath("review64");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${tenant}-${seed}.csv`);
  writeFileSync(out, csv);
  writeFileSync(join(dir, `${tenant}-${seed}.seed.json`), `${JSON.stringify({ tenant, seed, run: opt("--run") ?? null, total, picked: picked.map((p) => p.id), at: new Date().toISOString() }, null, 1)}\n`);
  console.log(`${total} 枚から ${picked.length} 枚（目標 ${SAMPLE_SIZE}）を選んだ。記入欄: ${out}`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
