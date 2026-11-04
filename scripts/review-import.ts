// 060: 監修者の確認表を取り込む。命令 1 つで、調整用の 20 項目を直した版に差し替え、差分を eval/review-history.md に足す。
// 確認用の 10 項目は読まない。直した版の 10 項目を確認用と同じ形にしてハッシュだけを比べ、変わっていれば番号だけを出して止まる。
// 作り直すときは --rehash <書き出し先>: 新しい確認用をその場所に書き（置き場へは作者が移す）、ハッシュの表を作り直す。
//
//   npx tsx scripts/review-import.ts <直した 30 項目の JSON> [--marks <印の CSV>] [--rehash <書き出し先>] [--dry]
//
// 印の CSV は見出し `no,mark,note`（mark は ○ △ ×）。直した版の項目に mark の欄があれば、それも読む。
// 取り込んだあとは、フックを確定版で流す（API を使うので、流すかは作者が決める）: npx tsx scripts/eval-hook.ts --force
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { historyEntry, type ImportResult, importReview, type Item, readMarks, toTune } from "../src/shared/eval/review";

const ROOT = join(import.meta.dirname, "..");
export const PATHS = {
  tune: "eval/items_tune_v1r8.json",
  hashes: "eval/holdout_hashes_v1r8.json",
  history: "eval/review-history.md",
};

/** キーを並べた JSON（Python の json.dumps(sort_keys=True, separators=(',', ':'), ensure_ascii=False) と同じ） */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}
export const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

interface Hashes {
  version: string;
  algorithm: string;
  file_sha256: string;
  items: { no: number; sha256: string }[];
}

const readJson = <T>(root: string, rel: string) => JSON.parse(readFileSync(join(root, rel), "utf-8")) as T;
const listOf = (v: unknown): Item[] => (Array.isArray(v) ? v : (v as { items: Item[] }).items).map((i) => ({ ...i, no: Number(i.no) }));

export interface RunOptions {
  marks?: string;
  /** 新しい確認用の書き出し先。あれば作り直す */
  rehash?: string;
  dry?: boolean;
  root?: string;
  now?: Date;
}

/** 取り込む。書いたファイルと結果を返す。確認用が変わっていて --rehash が無ければ、何も書かずに結果だけ返す */
export function run(nextPath: string, o: RunOptions = {}): { result: ImportResult; wrote: string[]; stopped: boolean } {
  const root = o.root ?? ROOT;
  const next = listOf(JSON.parse(readFileSync(nextPath, "utf-8")));
  const tune = listOf(readJson(root, PATHS.tune));
  const hashes = readJson<Hashes>(root, PATHS.hashes);
  const marks = o.marks ? readMarks(readFileSync(o.marks, "utf-8")) : undefined;
  // 担当者の名前 → 役割を、調整用の 20 項目の組から作る（確認用は読まない）。確認用も同じ形にしてからハッシュを比べる
  const nextByNo = new Map(next.map((i) => [i.no, i]));
  // 監修者に送った版では担当者の欄が owner の名前のこともある
  const who = (i: Item | undefined) => String(i?.reviewer ?? i?.owner ?? "");
  const role = new Map(tune.map((t) => [who(nextByNo.get(t.no)), t.reviewer]));
  const asHoldout = (i: Item) => toTune(i, { no: i.no, reviewer: role.get(who(i)) ?? who(i) });
  const hashOf = (i: Item) => sha(stable(asHoldout(i)));
  const result = importReview(next, tune, new Map(hashes.items.map((h) => [h.no, h.sha256])), hashOf, marks);
  const wrote: string[] = [];
  const stopped = result.holdoutChanged.length > 0 && !o.rehash;
  if (o.dry || stopped) return { result, wrote, stopped };

  const at = (o.now ?? new Date()).toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 16);
  // 今の調整用と同じ字下げ（1）にして、差分を中身の違いだけにする
  writeFileSync(join(root, PATHS.tune), `${JSON.stringify(result.tune, null, 1)}\n`);
  wrote.push(PATHS.tune);
  const head = "# 監修者の確認の取り込みの履歴（060）\n\n調整用の 20 項目の直した差分。確認用の 10 項目は番号と数だけ。\n\n";
  const hist = join(root, PATHS.history);
  if (!existsSync(hist)) writeFileSync(hist, head);
  appendFileSync(hist, `\n${historyEntry(at, basename(nextPath), result)}`);
  wrote.push(PATHS.history);
  if (o.rehash && result.holdoutChanged.length) {
    const items = hashes.items.map((h) => nextByNo.get(h.no)).filter((i): i is Item => !!i).map(asHoldout);
    const body = `${JSON.stringify(items, null, 2)}\n`;
    writeFileSync(o.rehash, body);
    const fresh: Hashes = { ...hashes, file_sha256: sha(body), items: items.map((i) => ({ no: i.no, sha256: sha(stable(i)) })) };
    writeFileSync(join(root, PATHS.hashes), `${JSON.stringify(fresh, null, 1)}\n`);
    wrote.push(o.rehash, PATHS.hashes);
  }
  return { result, wrote, stopped };
}

function main() {
  const a = process.argv.slice(2);
  const opt = (k: string) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
  const file = a.find((x, i) => !x.startsWith("--") && a[i - 1] !== "--marks" && a[i - 1] !== "--rehash");
  if (!file) throw new Error("使い方: npx tsx scripts/review-import.ts <直した 30 項目の JSON> [--marks <CSV>] [--rehash <書き出し先>] [--dry]");
  const { result: r, wrote, stopped } = run(file, { marks: opt("--marks"), rehash: opt("--rehash"), dry: a.includes("--dry") });
  console.log(`直した項目（調整用）: ${r.changes.filter((c) => c.diffs.length).map((c) => c.no).join("・") || "無し"}`);
  console.log(`確認用でハッシュが変わったもの: ${r.holdoutChanged.join("・") || "無し"}`);
  if (r.missing.length) console.log(`直した版に無かった番号: ${r.missing.join("・")}`);
  if (r.dropped.length) console.log(`落とした欄: ${r.dropped.join("・")}`);
  if (stopped) {
    console.log("確認用の項目が変わっているので止めた。作り直すなら --rehash <書き出し先> を付けて流し直す");
    process.exitCode = 1;
  } else if (wrote.length) console.log(`書いた: ${wrote.join("・")}\n次（API を使う）: npx tsx scripts/eval-hook.ts --force`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
