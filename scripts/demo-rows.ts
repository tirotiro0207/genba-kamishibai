// 手元の D1 から架空の会社（demo）の行を読む（093b・125）。本番に写すとき（copy-demo-prod.ts）と、種データを書き出すとき（demo-seed.ts）が使う
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
export const TENANT = "demo";
// 親の表から順に（外部キーの向き）
export const TABLES = ["cards", "audit_chains", "audit_log", "card_pairs", "glossary", "company_words", "extractions", "extraction_oks", "card_opens", "card_posts", "sample_reviews", "morning_sets"] as const;

/** 自動で振る番号の列。書き出さずに入れる先の D1 に振らせる（ほかのテナントの行と番号がぶつからないように） */
const AUTO_COLUMNS: Record<string, string[]> = { extraction_oks: ["seq"], card_posts: ["id"], morning_sets: ["id"] };

export const d1 = (where: string, args: string) => execSync(`npx wrangler d1 execute DB ${where} ${args}`, { cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });

/** wrangler の --json の出力を読む。JSON の前に案内の行が付くことがあるので、最初の [ から読む */
export const parseJson = (out: string): unknown => JSON.parse(out.slice(Math.max(0, out.indexOf("["))));

export function rows(table: string): Record<string, unknown>[] {
  const out = parseJson(d1("--local", `--json --command "SELECT * FROM ${table} WHERE tenant_id = '${TENANT}'"`)) as { results: Record<string, unknown>[] }[];
  return out[0].results;
}

const lit = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replaceAll("'", "''")}'`);

/** 1 行を、すでにある行を上書きしない INSERT の 1 文にする。tenant_id を先頭の列に置く（種データの検査が読む）。自動の番号の列は入れない */
export function insert(table: string, r: Record<string, unknown>): string {
  const skip = AUTO_COLUMNS[table] ?? [];
  const cols = ["tenant_id", ...Object.keys(r).filter((c) => c !== "tenant_id" && !skip.includes(c))];
  return `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => lit(r[c])).join(", ")});`;
}
