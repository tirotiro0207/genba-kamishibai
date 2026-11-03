// 数えるスクリプトの前半（113）。git と作業の表から、コミット数・テスト数・ファイル数・日ごとの済んだマスを数えて表にする。
// 097: 行数（コードのファイル）と、制作記録（docs/build-log.md）の日ごとの行の数も数える。
// 現場の確認のデータが要る数（docs/failures.md の 3 つの欄）はここでは数えない。
// 使い方: npx tsx scripts/count.ts（表を標準出力に出す）
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf-8" });

/** `git log --format=%ad%x09%h%x09%s --date=short` の行 → 日付・短いハッシュ・件名（ハッシュの欄は無くてもよい） */
export function parseLog(log: string): { day: string; hash: string; subject: string }[] {
  return log
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const [day, ...rest] = l.split("\t");
      const hash = rest.length > 1 && /^[0-9a-f]{7,40}$/.test(rest[0]) ? rest.shift()! : "";
      return { day, hash, subject: rest.join("\t") };
    });
}

/** 件名の頭のマスの番号（「002・002b: …」なら 2 つ） */
export function taskIds(subject: string): string[] {
  const m = subject.match(/^(\d{3}[a-z]?(?:・\d{3}[a-z]?)*):/);
  return m ? m[1].split("・") : [];
}

/** 作業の表から、済みのマスの番号 → 「コミット」の欄の最初のコミット（古い順に「, 」で並ぶ。ハッシュでなければ空） */
export function doneTasks(plan: string): Map<string, string> {
  const done = new Map<string, string>();
  for (const line of plan.split(/\r?\n/)) {
    const c = line.split("|").map((x) => x.trim());
    if (!/^\d{3}[a-z]?$/.test(c[1] ?? "") || !c.includes("済み")) continue;
    const commit = (c[c.length - 2] ?? "").split(/[,、\s]+/)[0];
    done.set(c[1], /^[0-9a-f]{7,40}$/.test(commit) ? commit : "");
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
  /** コードのファイル（CODE_EXT）の行数。空の行も数える */
  lines: { total: number; byDir: [string, number][] };
  /** 制作記録の日ごとの行（「→ 」で始まる行）の数 */
  buildLog: { day: string; entries: number }[];
  /** 作業の表では済みだが、件名の頭にその番号が付いたコミットも、表の「コミット」の欄に当たるコミットも無いマス */
  unlogged: string[];
}

export const CODE_EXT = /\.(ts|tsx|css|sql|mjs|js|py)$/;
const lineCount = (s: string) => (s ? s.split(/\r?\n/).length - (s.endsWith("\n") ? 1 : 0) : 0);

/** 制作記録の「## 2026-11-02（1 日目）」の見出しごとに、「→ 」で始まる行を数える */
export function countBuildLog(md: string): { day: string; entries: number }[] {
  const out: { day: string; entries: number }[] = [];
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^## (\d{4}-\d{2}-\d{2})/);
    if (h) out.push({ day: h[1], entries: 0 });
    else if (line.startsWith("→ ") && out.length) out[out.length - 1].entries++;
  }
  return out;
}

/** 数える。済んだマスは、その番号が件名の頭に付いた最初のコミットか、表の「コミット」の欄のコミットの、早いほうの日に数える */
export function count(log: string, plan: string, files: string[], read: (f: string) => string): Counts {
  const entries = parseLog(log).reverse(); // 古い順
  const done = doneTasks(plan);
  const seen = new Set<string>();
  const days = new Map<string, { commits: number; done: string[] }>();
  for (const e of entries) {
    const d = days.get(e.day) ?? { commits: 0, done: [] };
    d.commits++;
    const byTable = e.hash ? [...done].filter(([, h]) => h && (h.startsWith(e.hash) || e.hash.startsWith(h))).map(([id]) => id) : [];
    for (const id of [...taskIds(e.subject), ...byTable])
      if (done.has(id) && !seen.has(id)) {
        seen.add(id);
        d.done.push(id);
      }
    days.set(e.day, d);
  }
  const tests = { node: 0, worker: 0, e2e: 0 };
  const byDir = new Map<string, number>();
  const linesByDir = new Map<string, number>();
  let buildLog: Counts["buildLog"] = [];
  for (const f of files) {
    const dir = f.includes("/") ? f.slice(0, f.indexOf("/")) : "（直下）";
    byDir.set(dir, (byDir.get(dir) ?? 0) + 1);
    if (CODE_EXT.test(f)) linesByDir.set(dir, (linesByDir.get(dir) ?? 0) + lineCount(read(f)));
    if (f === "docs/build-log.md") buildLog = countBuildLog(read(f));
    if (/^tests\/.*\.test\.ts$/.test(f)) tests.node += countTests(read(f));
    else if (/^src\/worker\/.*\.test\.ts$/.test(f)) tests.worker += countTests(read(f));
    else if (/^e2e\/.*\.spec\.ts$/.test(f)) tests.e2e += countTests(read(f));
  }
  return {
    commits: entries.length,
    tests,
    files: { total: files.length, byDir: [...byDir].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) },
    days: [...days].map(([day, d]) => ({ day, ...d })),
    lines: { total: [...linesByDir.values()].reduce((a, b) => a + b, 0), byDir: [...linesByDir].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) },
    buildLog,
    unlogged: [...done.keys()].filter((id) => !seen.has(id)),
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
    `| コードの行（ts・tsx・css・sql・mjs・js・py） | ${c.lines.total} |`,
    `| 制作記録の行 | ${c.buildLog.reduce((a, d) => a + d.entries, 0)} |`,
    "",
    "## フォルダごとのファイル",
    "",
    "| フォルダ | ファイル | コードの行 |",
    "|---|---|---|",
    ...c.files.byDir.map(([d, n]) => `| ${d} | ${n} | ${c.lines.byDir.find(([x]) => x === d)?.[1] ?? 0} |`),
    "",
    "## 日ごと",
    "",
    "| 日付 | コミット | 済んだマス | 制作記録の行 | マスの番号 |",
    "|---|---|---|---|---|",
    ...c.days.map((d) => `| ${d.day} | ${d.commits} | ${d.done.length} | ${c.buildLog.find((b) => b.day === d.day)?.entries ?? 0} | ${d.done.join("・") || "—"} |`),
    "",
    `済みだが、当たるコミットが無いマス（件名の頭の番号・表の「コミット」の欄のどちらにも無い）: ${c.unlogged.join("・") || "無し"}`,
    "",
  ].join("\n");
}

function main() {
  const log = git("log", "--format=%ad%x09%h%x09%s", "--date=short");
  const files = git("ls-files").split(/\r?\n/).filter(Boolean);
  process.stdout.write(toMarkdown(count(log, readFileSync("docs/plan.md", "utf-8"), files, (f) => readFileSync(f, "utf-8"))));
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
