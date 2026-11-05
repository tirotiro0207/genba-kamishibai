// 064: 監修者が見る 20 枚を種で選び、記入欄（CSV）を private/review64/ に書く。記入が戻ったら集計して numbers.md に貼る表を出す。
// 既定は手元の D1 を読む。夜間の一括は本番の D1 に書いているので、そのカードから選ぶときは --remote で本番の D1 を読む（読むだけで書かない）。
//
//   npx tsx scripts/sample20.ts --tenant <テナント> --seed <種> [--run <夜間の一括の run_id>] [--remote] [--include-noscript]   # 20 枚を選んで記入欄を書く
//   npx tsx scripts/sample20.ts --read <記入した CSV>                                                                       # 集計する
//
// --run があれば、その夜間の一括で作ったカード（night_drafts の card_id）から選ぶ。無ければテナントのカード全部から選ぶ。
// 脚本（body.script）の無いカード（11/5 より前の作り方）は選ぶ前に外す。外した枚数は標準出力と seed.json に出す。
// 古いカードも入れたいときだけ --include-noscript を付ける（11/6）
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Exec, execD1, wranglerExec } from "../src/node/d1-node";
import { privatePath } from "../src/node/private-dir";
import { formCsv, pickSample, readForm, SAMPLE_SIZE, scriptedOnly, summarize, summaryMarkdown } from "../src/shared/sample20";

export interface FormOptions {
  run?: string;
  /** 脚本の無いカードも選ぶ候補に入れる（11/6） */
  includeNoScript?: boolean;
}

export async function makeForm(exec: Exec, tenant: string, seed: string, opts: FormOptions = {}) {
  const db = execD1(exec);
  const all = opts.run
    ? (await db.prepare("SELECT c.id, c.body FROM night_drafts d JOIN cards c ON c.id = d.card_id WHERE d.tenant_id = ? AND d.run_id = ?").bind(tenant, opts.run).all<{ id: string; body: string }>()).results
    : (await db.prepare("SELECT id, body FROM cards WHERE tenant_id = ?").bind(tenant).all<{ id: string; body: string }>()).results;
  const f = scriptedOnly(all);
  // --include-noscript のときは脚本の無いカードも残す。本文の JSON が読めないカードは見出しも出せないので、どちらでも外す
  const rows = opts.includeNoScript ? all.filter((r) => !f.broken.includes(r.id)) : f.kept;
  const title = new Map(rows.map((r) => [r.id, String((JSON.parse(r.body) as { rule?: string }).rule ?? "")]));
  const picked = pickSample(seed, [...title.keys()]).map((id) => ({ id, title: title.get(id) ?? "" }));
  return {
    total: all.length,
    /** 選ぶ候補にした枚数 */
    eligible: rows.length,
    /** 脚本が無くて外した枚数（--include-noscript のときは 0） */
    droppedNoScript: opts.includeNoScript ? 0 : f.noScript.length,
    /** 脚本の無いカードの枚数（外したかどうかにかかわらず） */
    noScript: f.noScript.length,
    /** 本文の JSON が読めなくて外した枚数 */
    droppedBroken: f.broken.length,
    short: picked.length < SAMPLE_SIZE,
    picked,
    csv: formCsv(seed, picked),
  };
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
  if (!tenant || !seed) throw new Error("使い方: npx tsx scripts/sample20.ts --tenant <テナント> --seed <種> [--run <run_id>] [--remote] [--include-noscript]");
  const where = a.includes("--remote") ? "remote" : "local";
  const includeNoScript = a.includes("--include-noscript");
  const run = opt("--run");
  const r = await makeForm(wranglerExec(where), tenant, seed, { run, includeNoScript });
  const dir = privatePath("review64");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${tenant}-${seed}.csv`);
  writeFileSync(out, r.csv);
  writeFileSync(
    join(dir, `${tenant}-${seed}.seed.json`),
    `${JSON.stringify({ tenant, seed, run: run ?? null, d1: where, includeNoScript, total: r.total, eligible: r.eligible, droppedNoScript: r.droppedNoScript, noScript: r.noScript, droppedBroken: r.droppedBroken, picked: r.picked.map((p) => p.id), at: new Date().toISOString() }, null, 1)}\n`,
  );
  console.log(`${where === "remote" ? "本番" : "手元"}の D1: ${r.total} 枚のうち、脚本の無いカード ${r.noScript} 枚${includeNoScript ? "（--include-noscript で候補に入れた）" : "を外した"}・本文が読めないカード ${r.droppedBroken} 枚を外した。候補 ${r.eligible} 枚。`);
  if (r.short) console.log(`足りない: 候補が ${r.eligible} 枚で、目標の ${SAMPLE_SIZE} 枚に ${SAMPLE_SIZE - r.picked.length} 枚足りない。選べた ${r.picked.length} 枚で記入欄を書いた。`);
  console.log(`${r.picked.length} 枚（目標 ${SAMPLE_SIZE}）を選んだ。記入欄: ${out}`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
