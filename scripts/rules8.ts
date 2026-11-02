// デモの 8 項目を、正式な取り出し（021）で取り出す。ページは 031b の行番号付きの文字（private/pdf/<資料>）から読み、
// どのページを使うかとテーマは、git の外の台本の config.json から読む（コードに書かない）。
// 画面に出すのは数だけ。取り出した中身は台本のフォルダにだけ置く。
//
//   npx tsx scripts/rules8.ts [台本のフォルダ] [資料の名前]   （既定は scratch/measure8 と manual）
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeClient } from "../src/node/client";
import { FileCallLog } from "../src/node/file-log";
import type { PdfLine } from "../src/node/pdf";
import { privatePath } from "../src/node/private-dir";
import { extractRules, type From } from "../src/shared/extract/rules";

interface Config {
  items: { id: number; topic: string; pages: number[]; note: string }[];
}

const dir = process.argv[2] ?? join(import.meta.dirname, "..", "scratch", "measure8");
const doc = process.argv[3] ?? "manual";
const cfg = JSON.parse(readFileSync(join(dir, "config.json"), "utf-8")) as Config;
const pageLines = (p: number) => (JSON.parse(readFileSync(privatePath("pdf", doc, `p${String(p).padStart(3, "0")}.json`), "utf-8")) as { lines: PdfLine[] }).lines;

const log = new FileCallLog();
const deps = { client: makeClient(), log };
const t0 = Date.now();
const results = await Promise.all(
  cfg.items.map(async (it) => {
    // 何ページかをつないで渡し、渡した行の番号から元のページと行に戻す
    const map: { page: number; line: number }[] = [];
    const text = it.pages.flatMap((p) => pageLines(p).map((l) => (map.push({ page: p, line: l.n }), l.text))).join("\n");
    const rules = await extractRules(deps, "measure", text, [it.topic, it.note].filter(Boolean).join("。"));
    const where = (f: From) => ({ ...f, page: map[f.line - 1]?.page, line: map[f.line - 1]?.line, line_end: map[f.line_end - 1]?.line });
    return { id: it.id, rules: rules.map((r) => ({ ...r, from: where(r.from), reasons: r.reasons.map((x) => ({ ...x, from: where(x.from) })) })) };
  }),
);
writeFileSync(join(dir, "out_rules021.json"), JSON.stringify(results, null, 1), "utf-8");
const usd = await log.sumUsd("measure", new Date(t0).toISOString());
for (const r of results) {
  const all = [...r.rules.map((x) => x.from), ...r.rules.flatMap((x) => x.reasons.map((y) => y.from))];
  console.log(
    `${r.id}: 決まり ${r.rules.length}（手元の✓ ${r.rules.filter((x) => x.checklist).length}）・理由 ${r.rules.reduce((s, x) => s + x.reasons.length, 0)}（元の文に無い ${r.rules.reduce((s, x) => s + x.reasons.filter((y) => !y.stated).length, 0)}）・どこからが元の文にある ${all.filter((f) => f.found).length}/${all.length}`,
  );
}
console.log(`費用 ${usd.toFixed(4)} USD・${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
