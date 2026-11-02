// 動画の素材を集める（013）。録画のテストの出力（RECORD_DIR/runs）から .webm を日付のフォルダへ写し、
// 素材の一覧（index.md）を作る。どれもリポジトリの外に置く。
//
//   npx tsx scripts/collect-recordings.ts           # 今日の日付のフォルダへ
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const RECORD_DIR = process.env.RECORD_DIR || join(tmpdir(), "genba-kamishibai-rec");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

export function materialName(runsDir: string, file: string): string {
  return relative(runsDir, file).replaceAll("\\", "/").replace(/\/video(-\d+)?\.webm$/, "$1").replaceAll("/", "__") + ".webm";
}

function main() {
  const runs = join(RECORD_DIR, "runs");
  const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const out = join(RECORD_DIR, "material", day);
  mkdirSync(out, { recursive: true });
  const files = walk(runs).filter((f) => f.endsWith(".webm"));
  const rows = files.map((f) => {
    const name = materialName(runs, f);
    copyFileSync(f, join(out, name));
    return `| ${name} | ${(statSync(f).size / 1024).toFixed(0)} KB | ${statSync(f).mtime.toISOString()} |`;
  });
  writeFileSync(join(out, "index.md"), `# 動画の素材 ${day}\n\n| ファイル | 大きさ | 録った時刻（UTC） |\n|---|---|---|\n${rows.join("\n")}\n`, "utf-8");
  console.log(`${files.length} 本を素材の置き場に写した`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
