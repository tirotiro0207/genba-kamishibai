import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { runNight, type Sql } from "../src/node/night";

// 夜間の走り手の土台（023）: 1 ページずつ処理し、進み具合を DB に置く。強制終了して再開すると済んだページを飛ばして続き、同じページを二重に作らない
function memDb(): { sql: Sql; db: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY, kind TEXT, name TEXT, pin_hash TEXT); INSERT INTO tenants VALUES ('practice', 'practice', '練習用', NULL);");
  db.exec(readFileSync(join(import.meta.dirname, "..", "migrations", "0020_night.sql"), "utf-8"));
  const sql: Sql = async (s) => {
    const stmts = s.split(/;\s*$/m).filter((x) => x.trim());
    let rows: Record<string, unknown>[] = [];
    for (const st of stmts) rows = /^\s*SELECT/i.test(st) ? (db.prepare(st).all() as Record<string, unknown>[]) : (db.exec(st), []);
    return rows;
  };
  return { sql, db };
}

const PAGES = [1, 2, 3, 4, 5].map((page) => ({ page, text: page === 1 ? "目次" : `p${page} 盤に触る前に検電する` }));
const sorter = (calls: string[], crashAt?: number) => async (text: string) => {
  calls.push(text);
  if (crashAt !== undefined && calls.length === crashAt) throw new Error("強制終了");
  return { card: text !== "目次", reason: "テスト", usd: 0.01, ms: 1, session_id: `s${calls.length}` };
};

describe("夜間の走り手（023）", () => {
  it("全ページを 1 ページずつ仕分け、答えを DB に置く", async () => {
    const { sql, db } = memDb();
    const calls: string[] = [];
    const s = await runNight({ sql, runId: "r1", tenant: "practice", doc: "manual", pages: PAGES, sortPage: sorter(calls) });
    expect(s).toMatchObject({ pages: 5, done_now: 5, skipped: 0, errors: 0, resumes: 0 });
    expect(s.usd).toBeCloseTo(0.05);
    const rows = db.prepare("SELECT page, state, card FROM night_pages ORDER BY page").all();
    expect(rows).toEqual([1, 2, 3, 4, 5].map((page) => ({ page, state: "done", card: page === 1 ? 0 : 1 })));
    expect(db.prepare("SELECT finished_at IS NOT NULL AS f FROM night_runs").get()).toEqual({ f: 1 });
  });

  it("途中で止まって走らせ直すと、済んだページを飛ばして続きからやり、同じページは 1 行のまま", async () => {
    const { sql, db } = memDb();
    const calls: string[] = [];
    // 3 ページ目で落ちる（強制終了のかわり）
    const crash = async (text: string) => {
      if (text.startsWith("p3")) throw new Error("kill");
      return sorter(calls)(text);
    };
    // 1 回目: 3 ページ目で止まる（続けて失敗したら止まる数を 1 にして、そこで抜ける）
    const first = await runNight({ sql, runId: "r2", tenant: "practice", doc: "manual", pages: PAGES, sortPage: crash, maxErrorsInRow: 1 });
    expect(first).toMatchObject({ done_now: 2, errors: 1 });
    // 本当の強制終了では、そのページは running のまま残る。それも作っておく
    db.exec("UPDATE night_pages SET state = 'running' WHERE page = 3");
    const before = calls.length;
    const second = await runNight({ sql, runId: "r2", tenant: "practice", doc: "manual", pages: PAGES, sortPage: sorter(calls) });
    expect(second).toMatchObject({ done_now: 3, skipped: 2, errors: 0, resumes: 1 });
    // 2 回目に呼んだのは 3・4・5 ページだけ
    expect(calls.slice(before)).toEqual(["p3 盤に触る前に検電する", "p4 盤に触る前に検電する", "p5 盤に触る前に検電する"]);
    expect(db.prepare("SELECT count(*) AS n FROM night_pages WHERE run_id = 'r2'").get()).toEqual({ n: 5 });
    expect(db.prepare("SELECT attempts FROM night_pages WHERE page = 3").get()).toEqual({ attempts: 2 });
    // 3 回目: 全部済みなので何も呼ばない
    const third = await runNight({ sql, runId: "r2", tenant: "practice", doc: "manual", pages: PAGES, sortPage: sorter(calls) });
    expect(third).toMatchObject({ done_now: 0, skipped: 5, resumes: 2 });
  });

  it("続けて失敗したら止まり、残りのページは呼ばない", async () => {
    const { sql } = memDb();
    let n = 0;
    const s = await runNight({ sql, runId: "r3", tenant: "practice", doc: "manual", pages: PAGES, sortPage: async () => (n++, Promise.reject(new Error("API が落ちている"))) });
    expect(s).toMatchObject({ done_now: 0, errors: 3 });
    expect(n).toBe(3);
  });
});
