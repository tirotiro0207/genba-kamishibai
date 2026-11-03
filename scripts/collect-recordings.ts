// 動画の素材を集める（013）。録画のテストの出力（RECORD_DIR/runs）から .webm を日付のフォルダへ写し、
// 素材の一覧（index.md）を作る。素材は private/material（git に入らない）。
//
// マスごとに RECORD_DIR を分けた録画（runs-<マス>）も拾い、その日に録ったものだけを写す（029）。
//
//   npx tsx scripts/collect-recordings.ts             # 今日の日付のフォルダへ
//   npx tsx scripts/collect-recordings.ts 2026-11-03  # その日（日本時間）に録ったものだけ
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { privatePath, RECORD_DIR } from "../src/node/private-dir";

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

export function materialName(runsDir: string, file: string): string {
  return relative(runsDir, file).replaceAll("\\", "/").replace(/\/video(-\d+)?\.webm$/, "$1").replaceAll("/", "__") + ".webm";
}

/** 日本時間の日付 */
export const jstDay = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

function main() {
  const day = process.argv[2] ?? jstDay(new Date());
  const out = privatePath("material", day);
  mkdirSync(out, { recursive: true });
  const dirs = existsSync(RECORD_DIR) ? readdirSync(RECORD_DIR).filter((d) => /^runs(-[\w-]+)?$/.test(d)).map((d) => join(RECORD_DIR, d)) : [];
  const files = dirs.flatMap((d) => walk(d)).filter((f) => f.endsWith(".webm") && jstDay(statSync(f).mtime) === day);
  // その日の録画が無ければ、前に作った一覧を上書きしない
  if (!files.length) return console.log(`${day} に録った録画が無いので、一覧はそのまま`);
  const rows = files.map((f) => {
    const name = materialName(RECORD_DIR, f);
    copyFileSync(f, join(out, name));
    return `| ${name} | ${(statSync(f).size / 1024).toFixed(0)} KB | ${statSync(f).mtime.toISOString()} |`;
  });
  writeFileSync(join(out, "index.md"), `# 動画の素材 ${day}\n\n| ファイル | 大きさ | 録った時刻（UTC） |\n|---|---|---|\n${rows.join("\n")}\n`, "utf-8");
  console.log(`${files.length} 本を素材の置き場に写した`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
