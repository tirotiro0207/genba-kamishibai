// 数えるスクリプトの前半（113）。git と作業の表から、コミット数・テスト数・ファイル数・日ごとの済んだマスを数えて表にする。
// 現場の確認のデータが要る数（097 の残り）はここでは数えない。
// 使い方: npx tsx scripts/count.ts（表を標準出力に出す）
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf-8" });

/** `git log --format=%ad%x09%s --date=short` の行 → 日付と件名 */
export function parseLog(log: string): { day: string; subject: string }[] {
  return log
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const [day, ...rest] = l.split("\t");
      return { day, subject: rest.join("\t") };
    });
}

/** 件名の頭のマスの番号（「002・002b: …」なら 2 つ） */
export function taskIds(subject: string): string[] {
  const m = subject.match(/^(\d{3}[a-z]?(?:・\d{3}[a-z]?)*):/);
  return m ? m[1].split("・") : [];
}

/** 作業の表から、済みのマスの番号 */
export function doneTasks(plan: string): Set<string> {
  const done = new Set<string>();
  for (const line of plan.split(/\r?\n/)) {
    const c = line.split("|").map((x) => x.trim());
    if (/^\d{3}[a-z]?$/.test(c[1] ?? "") && c.includes("済み")) done.add(c[1]);
  }
  return done;
}

/** テストのファイルの中の it / test の数（each は 1 つと数える） */
export function countTests(src: string): number {
  return src.match(/^\s*(?:it|test)(?:\.each\([^)]*\))?\(/gm)?.length ?? 0;
}

export interface Counts {
  commits: number;
  tests: { node: number; worker: number; e2e: number };
  files: { total: number; byDir: [string, number][] };
  days: { day: string; commits: number; done: string[] }[];
  /** 作業の表では済みだが、件名の頭にその番号が付いたコミットが無いマス */
  unlogged: string[];
}

/** 数える。済んだマスは、その番号が件名の頭に付いた最初のコミットの日に数える */
export function count(log: string, plan: string, files: string[], read: (f: string) => string): Counts {
  const entries = parseLog(log).reverse(); // 古い順
  const done = doneTasks(plan);
  const seen = new Set<string>();
  const days = new Map<string, { commits: number; done: string[] }>();
  for (const e of entries) {
    const d = days.get(e.day) ?? { commits: 0, done: [] };
    d.commits++;
    for (const id of taskIds(e.subject))
      if (done.has(id) && !seen.has(id)) {
        seen.add(id);
        d.done.push(id);
      }
    days.set(e.day, d);
  }
  const tests = { node: 0, worker: 0, e2e: 0 };
  const byDir = new Map<string, number>();
  for (const f of files) {
    const dir = f.includes("/") ? f.slice(0, f.indexOf("/")) : "（直下）";
    byDir.set(dir, (byDir.get(dir) ?? 0) + 1);
    if (/^tests\/.*\.test\.ts$/.test(f)) tests.node += countTests(read(f));
    else if (/^src\/worker\/.*\.test\.ts$/.test(f)) tests.worker += countTests(read(f));
    else if (/^e2e\/.*\.spec\.ts$/.test(f)) tests.e2e += countTests(read(f));
  }
  return {
    commits: entries.length,
    tests,
    files: { total: files.length, byDir: [...byDir].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) },
    days: [...days].map(([day, d]) => ({ day, ...d })),
    unlogged: [...done].filter((id) => !seen.has(id)),
  };
}

/** Markdown の表にする */
export function toMarkdown(c: Counts): string {
  const t = c.tests;
  return [
    "## 全体",
    "",
    "| 項目 | 数 |",
    "|---|---|",
    `| コミット | ${c.commits} |`,
    `| テスト（単体・node） | ${t.node} |`,
    `| テスト（単体・worker） | ${t.worker} |`,
    `| テスト（録画） | ${t.e2e} |`,
    `| ファイル（git に入っているもの） | ${c.files.total} |`,
    "",
    "## フォルダごとのファイル",
    "",
    "| フォルダ | ファイル |",
    "|---|---|",
    ...c.files.byDir.map(([d, n]) => `| ${d} | ${n} |`),
    "",
    "## 日ごと",
    "",
    "| 日付 | コミット | 済んだマス | マスの番号 |",
    "|---|---|---|---|",
    ...c.days.map((d) => `| ${d.day} | ${d.commits} | ${d.done.length} | ${d.done.join("・") || "—"} |`),
    "",
    `済みだが、件名の頭にその番号が付いたコミットが無いマス: ${c.unlogged.join("・") || "無し"}`,
    "",
  ].join("\n");
}

function main() {
  const log = git("log", "--format=%ad%x09%s", "--date=short");
  const files = git("ls-files").split(/\r?\n/).filter(Boolean);
  process.stdout.write(toMarkdown(count(log, readFileSync("docs/plan.md", "utf-8"), files, (f) => readFileSync(f, "utf-8"))));
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
