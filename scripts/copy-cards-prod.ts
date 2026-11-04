// 手元の D1 の、決めたテナントのカードを何枚か、本番の D1 の同じテナントに写す（11/6 の現場の確認のため）。
// 写すのは cards の行と、そのカードの監査の記録の行。カードの行は上書きしない（INSERT OR IGNORE）。
// 監査の記録はテナントごとに 1 本のハッシュの連鎖なので、そのまま写すと本番の連鎖が壊れる（番号がぶつかり、前の行のハッシュが合わない）。
// そこで、行の中身（カード・種類・誰が・中身・時刻）は元のまま、本番の連鎖の最後の後ろに順につなぎ直す（番号・前の行のハッシュ・ハッシュだけ作り直す）。
//
//   npx tsx scripts/copy-cards-prod.ts <テナント> <カードの ID>... --dry   # 写さずに数だけ出す
//   npx tsx scripts/copy-cards-prod.ts <テナント> <カードの ID>...         # 写す（本番の D1 に書く。作者の OK のあと）
// SQL は private/copy-prod/ に書き出してから流す（git の外。カードの中身を含むため）
import { mkdirSync, writeFileSync } from "node:fs";
import { canonical, entryHash, GENESIS } from "../src/shared/audit";
import { privatePath } from "../src/node/private-dir";
import { d1 } from "./demo-rows";

type Row = Record<string, unknown>;
const lit = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replaceAll("'", "''")}'`);
const q = (where: string, sql: string, env = "") => (JSON.parse(d1(`${where}${env}`, `--json --command ${JSON.stringify(sql)}`)) as { results: Row[] }[])[0].results;
const REMOTE = "--remote --env production";

/** 写す行を、本番の連鎖の最後（n・ハッシュ）の後ろにつなぎ直す */
export async function rechain(rows: Row[], tenant: string, chain: string, last: { n: number; hash: string } | null) {
  let n = last?.n ?? 0;
  let prev = last?.hash ?? GENESIS;
  const out: Row[] = [];
  for (const r of rows) {
    const draft = { tenant_id: tenant, chain, n: ++n, card_id: r.card_id as string | null, kind: r.kind as never, actor: String(r.actor), payload: JSON.parse(String(r.payload)), created_at: String(r.created_at), prev_hash: prev };
    const hash = await entryHash(draft);
    out.push({ ...draft, payload: canonical(draft.payload), hash });
    prev = hash;
  }
  return out;
}

export const insertSql = (table: string, r: Row) => {
  const cols = Object.keys(r);
  return `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => lit(r[c])).join(", ")});`;
};

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const [tenant, ...ids] = args.filter((a) => !a.startsWith("--"));
  if (!tenant || !/^[a-z][a-z0-9-]{1,30}$/.test(tenant) || !ids.length || !ids.every((x) => /^[0-9a-f-]{36}$/.test(x))) throw new Error("テナントとカードの ID（36 字）を渡す");
  const inList = ids.map(lit).join(", ");
  const cards = q("--local", `SELECT * FROM cards WHERE tenant_id = ${lit(tenant)} AND id IN (${inList})`);
  if (cards.length !== ids.length) throw new Error(`手元に無いカードがある（${cards.length} / ${ids.length}）`);
  const audits = q("--local", `SELECT card_id, kind, actor, payload, created_at FROM audit_log WHERE tenant_id = ${lit(tenant)} AND card_id IN (${inList}) ORDER BY chain, n`);
  const t = q("", `SELECT id, kind FROM tenants WHERE id = ${lit(tenant)}`, REMOTE);
  if (!t.length) throw new Error("本番にそのテナントが無い");
  const already = q("", `SELECT id FROM cards WHERE id IN (${inList})`, REMOTE);
  if (already.length) throw new Error(`本番にもうあるカードがある: ${already.map((r) => r.id).join(", ")}`);
  const chainRow = q("", `SELECT chain FROM audit_chains WHERE tenant_id = ${lit(tenant)} ORDER BY started_at DESC, rowid DESC LIMIT 1`, REMOTE);
  if (!chainRow.length) throw new Error("本番のテナントに監査の連鎖が無い");
  const chain = String(chainRow[0].chain);
  const lastRow = q("", `SELECT n, hash FROM audit_log WHERE tenant_id = ${lit(tenant)} AND chain = ${lit(chain)} ORDER BY n DESC LIMIT 1`, REMOTE);
  const last = lastRow.length ? { n: Number(lastRow[0].n), hash: String(lastRow[0].hash) } : null;
  const re = await rechain(audits, tenant, chain, last);
  const byStatus = cards.reduce<Record<string, number>>((m, c) => ((m[String(c.status)] = (m[String(c.status)] ?? 0) + 1), m), {});
  console.log(`テナント ${tenant}（本番の種類 ${t[0].kind}）・カード ${cards.length} 枚 ${JSON.stringify(byStatus)}・監査の行 ${audits.length}（本番の連鎖 ${chain} の ${last?.n ?? 0} の後ろに ${(last?.n ?? 0) + 1}〜${(last?.n ?? 0) + re.length} としてつなぐ）`);
  if (dry) return;
  const sql = [...cards.map((c) => insertSql("cards", c)), ...re.map((r) => insertSql("audit_log", r))].join("\n") + "\n";
  const dir = privatePath("copy-prod");
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/${tenant}-${Date.now()}.sql`;
  writeFileSync(file, sql, "utf-8");
  d1(REMOTE, `--yes --file ${JSON.stringify(file)}`);
  const n = q("", `SELECT count(*) AS n FROM cards WHERE id IN (${inList})`, REMOTE)[0].n;
  console.log(`本番に写した: カード ${n} 枚・監査の行 ${re.length}。SQL は ${file}`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main().catch((e) => { console.error((e as Error).message); process.exit(1); });
