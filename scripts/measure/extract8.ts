// デモの 8 項目を、git の外の台本の文から取り出す（004）。
// どのページを使うかと注意書きは、台本のフォルダの config.json から読む（コードに書かない）。
// 画面に出すのは数だけ。取り出した中身は台本のフォルダにだけ置く。
//
//   npx tsx scripts/measure/extract8.ts [台本のフォルダ]   （既定は scratch/measure8）
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeClient } from "../../src/node/client";
import { FileCallLog } from "../../src/node/file-log";
import { extractClaims } from "../../src/shared/extract/extract";

interface Config {
  frame_page: number;
  items: { id: number; topic: string; pages: number[]; note: string }[];
}

const dir = process.argv[2] ?? join(import.meta.dirname, "..", "..", "scratch", "measure8");
const cfg = JSON.parse(readFileSync(join(dir, "config.json"), "utf-8")) as Config;
const page = (p: number) => readFileSync(join(dir, "pages", `p${String(p).padStart(3, "0")}.txt`), "utf-8");

const log = new FileCallLog();
const deps = { client: makeClient(), log };
const t0 = Date.now();
const results = await Promise.all(
  cfg.items.map(async (it) => {
    const text = it.pages.map(page).join("\n");
    const note = [`テーマ「${it.topic}」の決まりだけを取り出す`, it.note].filter(Boolean).join("。");
    const claims = await extractClaims(deps, "measure", text, note);
    return { id: it.id, claims };
  }),
);
writeFileSync(join(dir, "out_extract004.json"), JSON.stringify(results, null, 1), "utf-8");
const usd = await log.sumUsd("measure", new Date(t0).toISOString());
for (const r of results) {
  const n = (k: string) => r.claims.filter((c) => c.kind === k).length;
  console.log(`${r.id}: do ${n("do")} / dont ${n("dont")} / why ${n("why")} / どこからが元の文にある ${r.claims.filter((c) => c.spanFound).length}/${r.claims.length}`);
}
console.log(`費用 ${usd.toFixed(4)} USD・${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
