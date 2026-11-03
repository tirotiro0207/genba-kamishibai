// Node のスクリプトから D1 を Worker と同じ形（prepare → bind → first / all / run）で使う（062）。
// 夜間の下書きの走り手が、Worker の createCard・appendAudit をそのまま使って、手元か本番の D1 にカードと監査の記録を書くため。
// 1 文ずつ wrangler の d1 execute に送る（手元は --local、本番は --remote --env production）。テストは node:sqlite に同じ SQL を流す。
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export interface ExecResult {
  results: Record<string, unknown>[];
  changes: number;
}
/** SQL を 1 文送り、行と変わった行の数を返す */
export type Exec = (sql: string) => Promise<ExecResult>;

/** wrangler の d1 execute で D1 に SQL を送る。シェルを通さず node で wrangler を直に呼ぶので、SQL の引用符をそのまま渡せる */
export function wranglerExec(where: "local" | "remote"): Exec {
  const root = join(import.meta.dirname, "..", "..");
  const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
  const flags = where === "local" ? ["--local"] : ["--remote", "--env", "production", "-y"];
  return async (sql) => {
    let out: string;
    try {
      out = execFileSync(process.execPath, [wrangler, "d1", "execute", "DB", ...flags, "--json", "--command", sql], { cwd: root, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 });
    } catch (e) {
      // wrangler は失敗の理由を標準出力の JSON か標準エラーに書く
      const x = e as { stdout?: string; stderr?: string };
      throw new Error(`D1 に送れなかった: ${(x.stdout || x.stderr || String(e)).slice(-600)}`);
    }
    // JSON の前に案内の行が付いても読めるよう、最初の [ から読む
    const parsed = JSON.parse(out.slice(out.indexOf("["))) as { results?: Record<string, unknown>[]; meta?: { changes?: number } }[];
    return { results: parsed.flatMap((r) => r.results ?? []), changes: parsed.reduce((s, r) => s + (r.meta?.changes ?? 0), 0) };
  };
}

/** 値を SQL の文字に埋める（? の数だけ、引用符の外の ? を順に置き換える） */
export function bindSql(sql: string, values: unknown[]): string {
  const lit = (v: unknown) =>
    v === null || v === undefined ? "NULL" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "NULL") : typeof v === "boolean" ? (v ? "1" : "0") : `'${String(v).replaceAll("'", "''")}'`;
  let i = 0;
  let quoted = false;
  let out = "";
  for (const ch of sql) {
    if (ch === "'") quoted = !quoted;
    if (ch === "?" && !quoted) {
      if (i >= values.length) throw new Error("? の数より値が少ない");
      out += lit(values[i++]);
    } else out += ch;
  }
  if (i !== values.length) throw new Error("? の数より値が多い");
  return out;
}

/** Exec を D1Database の形にする（走り手が使う prepare・bind・first・all・run・batch だけ） */
export function execD1(exec: Exec): D1Database {
  const stmt = (sql: string, values: unknown[] = []) => {
    const go = () => exec(bindSql(sql, values));
    const s = {
      bind: (...v: unknown[]) => stmt(sql, v),
      first: async (col?: string) => {
        const row = (await go()).results[0] ?? null;
        return col && row ? row[col] : row;
      },
      all: async () => ({ results: (await go()).results, success: true, meta: {} }),
      run: async () => {
        const r = await go();
        return { results: r.results, success: true, meta: { changes: r.changes } };
      },
      raw: async () => (await go()).results.map((r) => Object.values(r)),
      _go: go,
    };
    return s;
  };
  const db = {
    prepare: (sql: string) => stmt(sql),
    batch: async (stmts: { run: () => Promise<unknown> }[]) => {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
    exec: async (sql: string) => (await exec(sql), { count: 1, duration: 0 }),
  };
  return db as unknown as D1Database;
}
