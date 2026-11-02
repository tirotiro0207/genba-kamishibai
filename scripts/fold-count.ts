// 折りたたんだ量を数えるスクリプト（081）。元のページの文字数を空白を除いて数え、ページごとの数と合計だけを出す（中身は出さない）。
//
//   npx tsx scripts/fold-count.ts <PDF か 文字にした資料のフォルダ> <ページ（例: 26,27,32-36）> [--json <書き出す先>]
// PDF は文字の層だけを読む（図の中の文字は入らない）。フォルダは pdf-pages.ts が作る p<3 桁>.json の並び。
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { type FoldPage, foldPage, foldTotal } from "../src/shared/fold";
import { pdfPages } from "../src/node/pdf";

export function parsePageList(s: string): number[] {
  const out = new Set<number>();
  for (const part of s.split(/[,、\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`ページの書き方が違う: ${part}`);
    for (let p = Number(m[1]); p <= Number(m[2] ?? m[1]); p++) out.add(p);
  }
  return [...out].sort((a, b) => a - b);
}

/** 文字にした資料のフォルダから数える */
export function countFolder(dir: string, pages: number[]): FoldPage[] {
  const doc = basename(dir);
  return pages.map((p) => {
    const f = join(dir, `p${String(p).padStart(3, "0")}.json`);
    if (!existsSync(f)) throw new Error(`${p} ページが無い`);
    const { lines } = JSON.parse(readFileSync(f, "utf8")) as { lines: { text: string }[] };
    return foldPage(doc, p, lines.map((l) => l.text));
  });
}

/** 出すもの: ページごとの字数と合計だけ（行の長さも中身も出さない） */
export const report = (pages: FoldPage[]) => ({ pages: pages.map((p) => ({ doc: p.doc, page: p.page, chars: p.chars })), total: foldTotal(pages), cards: 1, face_chars: 0 });

async function main() {
  const args = process.argv.slice(2);
  const out = args.includes("--json") ? args[args.indexOf("--json") + 1] : undefined;
  const [src, list] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json");
  if (!src || !list) throw new Error("使い方: fold-count.ts <PDF か フォルダ> <ページ> [--json <書き出す先>]");
  const pages = parsePageList(list);
  let got: FoldPage[];
  if (statSync(src).isDirectory()) got = countFolder(src, pages);
  else {
    const all = await pdfPages(new Uint8Array(readFileSync(src)));
    const name = basename(src).replace(/\.pdf$/i, "");
    got = pages.map((p) => {
      const pg = all.find((x) => x.page === p);
      if (!pg) throw new Error(`${p} ページが無い`);
      return foldPage(name, p, pg.lines.map((l) => l.text));
    });
  }
  const r = report(got);
  for (const p of r.pages) console.log(`p.${p.page}\t${p.chars} 字`);
  console.log(`合計（${r.pages.length} ページ）\t${r.total} 字 → 1 枚・0 字`);
  if (out) writeFileSync(out, `${JSON.stringify(r, null, 2)}\n`);
}

if (process.argv[1] && import.meta.filename === process.argv[1])
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
