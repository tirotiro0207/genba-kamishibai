// 夜間の下書きの回を数えて確かめる（063）。再開でずれていないか（同じページの取り出しが二重・同じ枠のカードが二重・枠の無いカード）、
// 取り出しが空のページ、取り出した決まりの数と使った数、帯ごとの枚数、1 枚の時間と費用、失敗を、1 件 1 行で出す。
//
//   npx tsx scripts/night-draft-check.ts --run <下書きの番号> [--remote] [--tenant company]
import { execD1, wranglerExec } from "../src/node/d1-node";

async function main() {
  const args = process.argv.slice(2);
  const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const runId = opt("--run");
  if (!runId) throw new Error("使い方: night-draft-check.ts --run <下書きの番号> [--remote] [--tenant company]");
  const tenant = opt("--tenant") ?? "company";
  const db = execD1(wranglerExec(args.includes("--remote") ? "remote" : "local"));
  type D = { page: number; item: number; state: string; extraction_id: string | null; card_id: string | null; band: string | null; dangerous: number | null; rate: number | null; usd: number | null; ms: number | null; attempts: number; error: string | null };
  const rows = (await db.prepare("SELECT page, item, state, extraction_id, card_id, band, dangerous, rate, usd, ms, attempts, error, pick FROM night_drafts WHERE run_id = ? AND tenant_id = ? ORDER BY page, item").bind(runId, tenant).all<D>()).results;
  const heads = rows.filter((r) => r.item === -1);
  const items = rows.filter((r) => r.item >= 0);
  const out: string[] = [];
  const line = (s: string) => out.push(`- ${s}`);

  const ids = heads.map((h) => h.extraction_id).filter((x): x is string => !!x);
  const counts = new Map<string, number>();
  for (const id of ids) {
    const x = await db.prepare("SELECT rules FROM extractions WHERE id = ? AND tenant_id = ?").bind(id, tenant).first<{ rules: string }>();
    counts.set(id, x ? (JSON.parse(x.rules) as unknown[]).length : -1);
  }
  const rules = heads.map((h) => ({ page: h.page, n: h.extraction_id ? (counts.get(h.extraction_id) ?? -1) : -1 }));
  const empty = rules.filter((r) => r.n === 0).map((r) => `p${r.page}`);
  const total = rules.reduce((s, r) => s + Math.max(0, r.n), 0);
  line(`ページ ${heads.length}（取り出し済み ${ids.length}・失敗 ${heads.filter((h) => h.state === "error").length}）・取り出した決まり ${total}（1 ページ 平均 ${(total / Math.max(1, ids.length)).toFixed(1)}・最多 ${Math.max(0, ...rules.map((r) => r.n))}）・カードにした ${items.length}`);
  line(`決まりが 0 のページ: ${empty.length ? empty.join(" ") : "無し"}`);

  // 再開でずれていないか
  const dupCards = [...Map.groupBy(items.filter((r) => r.card_id), (r) => r.card_id!)].filter(([, v]) => v.length > 1).map(([k]) => k);
  const cardRows = (await db.prepare("SELECT c.id FROM cards c JOIN night_drafts d ON d.card_id = c.id WHERE d.run_id = ? AND c.tenant_id = ?").bind(runId, tenant).all<{ id: string }>()).results;
  const mixed = [...Map.groupBy(items, (r) => r.page)].filter(([, v]) => new Set(v.map((r) => r.extraction_id)).size > 1).map(([p]) => `p${p}`);
  const verifies = (await db.prepare("SELECT a.card_id, count(*) AS n FROM audit_log a JOIN night_drafts d ON d.card_id = a.card_id WHERE d.run_id = ? AND a.kind = 'verify' AND a.tenant_id = ? GROUP BY a.card_id").bind(runId, tenant).all<{ card_id: string; n: number }>()).results;
  const twice = verifies.filter((v) => Number(v.n) > 1);
  line(`再開: 同じカードが 2 つの枠に ${dupCards.length}・カードの行 ${cardRows.length}（枠 ${items.filter((r) => r.card_id).length}）・1 ページで取り出しが 2 つ ${mixed.length ? mixed.join(" ") : "0"}・確かめる AI を 2 回以上通ったカード ${twice.length}`);

  // 作ったのに枠の無いカード（作ってから印を付けるまでの間で止まったもの）。この回の時間の中で night が作ったカードから数える
  const span = (await db.prepare("SELECT (SELECT datetime(min(c.created_at), '-1 hour') FROM cards c JOIN night_drafts d ON d.card_id = c.id WHERE d.run_id = ?) AS a, (SELECT max(updated_at) FROM night_drafts WHERE run_id = ?) AS b").bind(runId, runId).first<{ a: string; b: string }>())!;
  const orphans = (
    await db
      .prepare("SELECT count(DISTINCT a.card_id) AS n FROM audit_log a WHERE a.tenant_id = ? AND a.kind = 'make' AND a.actor = 'night' AND datetime(a.created_at) BETWEEN ? AND ? AND NOT EXISTS (SELECT 1 FROM night_drafts d WHERE d.card_id = a.card_id)")
      .bind(tenant, span.a, span.b)
      .first<{ n: number }>()
  )?.n;
  line(`枠の無い夜間のカード: ${orphans ?? "数えられない"}`);
  const picks = heads.flatMap((h) => (h as D & { pick?: string | null }).pick ? (JSON.parse((h as D & { pick: string }).pick) as { class: string }[]) : []);
  if (picks.length) line(`選ぶ段の分け: ${[...Map.groupBy(picks, (x) => x.class)].map(([k, v]) => `${k} ${v.length}`).join("・")}`);

  const done = items.filter((r) => r.state === "done");
  const red = done.filter((r) => r.band === "red" || r.dangerous === 1);
  line(`帯: 済み ${done.length}・赤 ${red.length}（うち危険 ${done.filter((r) => r.dangerous === 1).length}）・黄 ${done.filter((r) => r.band === "yellow" && r.dangerous !== 1).length}・緑 ${done.filter((r) => r.band === "green" && r.dangerous !== 1).length}`);
  const rates = done.map((r) => r.rate ?? 0);
  const hist = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((b) => `${b}%: ${rates.filter((x) => x === b).length}`).filter((s) => !s.endsWith(": 0"));
  line(`読み取りの点の分かれ方: ${hist.join("・")}`);
  const ms = done.map((r) => r.ms ?? 0).sort((a, b) => a - b);
  const usd = done.map((r) => r.usd ?? 0);
  line(`1 枚の時間: 中央 ${(ms[Math.floor(ms.length / 2)] / 60000).toFixed(1)} 分・最長 ${((ms.at(-1) ?? 0) / 60000).toFixed(1)} 分／1 枚の費用（換算）: 平均 ${(usd.reduce((s, x) => s + x, 0) / Math.max(1, usd.length)).toFixed(3)} USD・最高 ${Math.max(0, ...usd).toFixed(3)} USD`);
  const bad = items.filter((r) => r.state !== "done");
  line(`済みでない枠: ${bad.length ? bad.map((r) => `p${r.page}-${r.item}（${r.state}）`).join(" ") : "無し"}／2 回以上やり直した枠: ${items.filter((r) => r.attempts > 1).map((r) => `p${r.page}-${r.item}`).join(" ") || "無し"}`);
  for (const r of rows.filter((x) => x.error)) line(`残っている失敗 p${r.page}-${r.item}: ${r.error?.slice(0, 120)}`);
  console.log(out.join("\n"));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
