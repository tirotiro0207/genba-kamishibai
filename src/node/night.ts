// 夜間の走り手（023）。資料を 1 ページずつ仕分け、ページごとの進み具合を D1 の night_pages に置く。
// 強制終了して走らせ直すと、済んだページは飛ばし、途中だったページ（running）はもう一度やる。ページは 1 行だけなので二重にならない。
// SQL は D1 に送る関数（Sql）を通す。手元・本番は wrangler の d1 execute、テストは node:sqlite で同じ SQL を流す。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { wranglerExec } from "./d1-node";
import { privatePath } from "./private-dir";
import type { SortResult } from "../shared/sort/page";

export type Sql = (sql: string) => Promise<Record<string, unknown>[]>;

const lit = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "1" : "0") : `'${String(v).replaceAll("'", "''")}'`);

/** wrangler の d1 execute で D1 に SQL を送る（--local か --remote --env production）。行だけを返す */
export function d1Sql(where: "local" | "remote"): Sql {
  const exec = wranglerExec(where);
  return async (sql) => (await exec(sql)).results;
}

export interface NightPage {
  page: number;
  text: string;
}

/** private/pdf/<資料の名前>/pNNN.json のページの文（031b の行の文字）。range は「1-5」の形 */
export function readPages(doc: string, range?: string): NightPage[] {
  const dir = privatePath("pdf", doc);
  if (!existsSync(dir)) throw new Error(`ページの文が無い: ${dir}（先に scripts/pdf-pages.ts）`);
  const [from, to] = range ? range.split("-").map(Number) : [1, Infinity];
  return readdirSync(dir)
    .filter((f) => /^p\d{3}\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf-8")) as { page: number; lines: { text: string }[] })
    .filter((p) => p.page >= from && p.page <= (to ?? from))
    .sort((a, b) => a.page - b.page)
    .map((p) => ({ page: p.page, text: p.lines.map((l) => l.text).join("\n") }));
}

export type SortPage = (text: string) => Promise<SortResult & { usd: number | null; ms: number; session_id?: string }>;

export interface NightSummary {
  run_id: string;
  pages: number;
  /** この回に仕分けたページ */
  done_now: number;
  /** 前の回までに済んでいて飛ばしたページ */
  skipped: number;
  errors: number;
  resumes: number;
  usd: number;
}

export interface NightOptions {
  sql: Sql;
  runId: string;
  tenant: string;
  doc: string;
  pages: NightPage[];
  sortPage: SortPage;
  /** これだけ続けて失敗したら止める（夜中に同じ失敗で費用を使い続けない） */
  maxErrorsInRow?: number;
  log?: (line: string) => void;
}

export async function runNight(o: NightOptions): Promise<NightSummary> {
  const { sql, runId } = o;
  const log = o.log ?? (() => {});
  const known = await sql(`SELECT id FROM night_runs WHERE id = ${lit(runId)}`);
  if (known.length) await sql(`UPDATE night_runs SET resumes = resumes + 1, finished_at = NULL WHERE id = ${lit(runId)}`);
  else await sql(`INSERT INTO night_runs (id, tenant_id, doc, pages) VALUES (${lit(runId)}, ${lit(o.tenant)}, ${lit(o.doc)}, ${o.pages.length})`);
  if (o.pages.length)
    await sql(`INSERT OR IGNORE INTO night_pages (run_id, tenant_id, page) VALUES ${o.pages.map((p) => `(${lit(runId)}, ${lit(o.tenant)}, ${p.page})`).join(", ")}`);
  // 途中で止まったページ（running）と、前の回に失敗したページは、もう一度やる
  await sql(`UPDATE night_pages SET state = 'pending' WHERE run_id = ${lit(runId)} AND state IN ('running', 'error')`);
  const done = new Set((await sql(`SELECT page FROM night_pages WHERE run_id = ${lit(runId)} AND state = 'done'`)).map((r) => Number(r.page)));

  let doneNow = 0;
  let errors = 0;
  let inRow = 0;
  for (const p of o.pages) {
    if (done.has(p.page)) continue;
    await sql(`UPDATE night_pages SET state = 'running', attempts = attempts + 1, updated_at = datetime('now') WHERE run_id = ${lit(runId)} AND page = ${p.page}`);
    try {
      const r = await o.sortPage(p.text);
      await sql(
        `UPDATE night_pages SET state = 'done', card = ${lit(r.card)}, reason = ${lit(r.reason)}, usd = ${lit(r.usd)}, ms = ${r.ms}, session_id = ${lit(r.session_id ?? null)}, error = NULL, updated_at = datetime('now') WHERE run_id = ${lit(runId)} AND page = ${p.page}`,
      );
      doneNow++;
      inRow = 0;
      log(`p${p.page}: ${r.card ? "する" : "しない"}（${r.reason}）`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sql(`UPDATE night_pages SET state = 'error', error = ${lit(msg.slice(0, 500))}, updated_at = datetime('now') WHERE run_id = ${lit(runId)} AND page = ${p.page}`);
      errors++;
      log(`p${p.page}: 失敗（${msg}）`);
      if (++inRow >= (o.maxErrorsInRow ?? 3)) {
        log(`${inRow} ページ続けて失敗したので止める`);
        break;
      }
    }
  }
  const left = await sql(`SELECT count(*) AS n FROM night_pages WHERE run_id = ${lit(runId)} AND state != 'done'`);
  if (Number(left[0]?.n ?? 0) === 0) await sql(`UPDATE night_runs SET finished_at = datetime('now') WHERE id = ${lit(runId)}`);
  const run = (await sql(`SELECT resumes FROM night_runs WHERE id = ${lit(runId)}`))[0];
  const usd = (await sql(`SELECT coalesce(sum(usd), 0) AS usd FROM night_pages WHERE run_id = ${lit(runId)}`))[0];
  return { run_id: runId, pages: o.pages.length, done_now: doneNow, skipped: o.pages.filter((p) => done.has(p.page)).length, errors, resumes: Number(run?.resumes ?? 0), usd: Number(usd?.usd ?? 0) };
}
