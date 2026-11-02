// 変更のたびに流すフック（003b）。取り出しのプロンプトとその周りのコードが変わったときだけ、
// 調整用の 20 項目を流して docs/numbers.md の履歴に 1 行足す。最後の確認用の 10 項目は読まない。
//
//   npx tsx scripts/eval-hook.ts          # 見張るファイルが前回から変わっていれば流す
//   npx tsx scripts/eval-hook.ts --force  # 変わっていなくても流す
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Claim, claimsFromItem, type Judgement, type Score, score, sumScores } from "../src/shared/eval/score";

export const ROOT = join(import.meta.dirname, "..");
/** 見張るもの: 取り出しのプロンプトとコード、採点の判定 */
export const WATCHED = ["src/shared/extract", "src/shared/eval/judge.ts"];
export const TUNE_FILE = "eval/items_tune_v1r8.json";
const STATE_FILE = "eval/hook-state.json";
const NUMBERS = "docs/numbers.md";
const HEADING = "## 変更のたびの 20 項目（調整用）";
const TABLE_HEAD =
  "| 日時（日本時間） | 見張るファイルのハッシュ | 項目 | 正解 | 答え | 組 | 言い方の違い | 漏れ | 取り出しすぎ | 危ない読み違い | 費用（USD） | 時間（秒） |\n|---|---|---|---|---|---|---|---|---|---|---|---|";

export interface TuneItem {
  no: number;
  text: string;
  do: { text: string; span?: string }[];
  dont: { text: string; span?: string }[];
  why: { text: string; span?: string }[];
}

export type Extractor = (text: string) => Promise<Claim[]>;
export type JudgeFn = (gold: Claim[], pred: Claim[]) => Promise<Judgement>;

function listFiles(root: string, rel: string): string[] {
  const abs = join(root, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [rel];
  return readdirSync(abs).flatMap((name) => listFiles(root, join(rel, name)));
}

/** 見張るファイルの中身のハッシュ（改行の違いは見ない） */
export function watchedHash(root = ROOT, watched = WATCHED): string {
  const h = createHash("sha256");
  const files = watched.flatMap((w) => listFiles(root, w)).map((f) => f.replaceAll("\\", "/")).sort();
  for (const f of files) {
    h.update(f + "\n");
    h.update(readFileSync(join(root, f), "utf-8").replaceAll("\r\n", "\n"));
  }
  return h.digest("hex").slice(0, 12);
}

export function loadTuneItems(root = ROOT): TuneItem[] {
  return JSON.parse(readFileSync(join(root, TUNE_FILE), "utf-8")) as TuneItem[];
}

export async function runEval(items: TuneItem[], extract: Extractor, judge: JudgeFn): Promise<Score> {
  const scores = await Promise.all(
    items.map(async (it) => {
      const gold = claimsFromItem(it);
      const pred = await extract(it.text);
      return score(gold, pred, await judge(gold, pred));
    }),
  );
  return sumScores(scores);
}

export function historyRow(at: Date, hash: string, n: number, s: Score, usd: number, sec: number): string {
  const jst = new Date(at.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
  return `| ${jst} | ${hash} | ${n} | ${s.gold} | ${s.pred} | ${s.matched} | ${s.wording} | ${s.missed} | ${s.extra} | ${s.dangerous} | ${usd.toFixed(4)} | ${sec.toFixed(0)} |`;
}

/** numbers.md の履歴の表に 1 行足す。節が無ければ末尾に作る */
export function appendHistory(md: string, row: string): string {
  const text = md.replaceAll("\r\n", "\n");
  if (!text.includes(HEADING)) {
    return `${text.trimEnd()}\n\n${HEADING}\n\nプロンプトとその周りのコードを変えたときだけ流れる（\`scripts/eval-hook.ts\`）。最後の確認用の 10 項目は流さない。\n\n${TABLE_HEAD}\n${row}\n`;
  }
  const [before, after] = text.split(HEADING);
  const lines = after.split("\n");
  let last = lines.findIndex((l, i) => i > 0 && l.startsWith("|") && (lines[i + 1] === undefined || !lines[i + 1].startsWith("|")));
  if (last < 0) last = lines.length - 1;
  lines.splice(last + 1, 0, row);
  return before + HEADING + lines.join("\n");
}

export function readState(root = ROOT): { hash?: string } {
  const p = join(root, STATE_FILE);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : {};
}

async function main() {
  const force = process.argv.includes("--force");
  const hash = watchedHash();
  if (!force && readState().hash === hash) {
    console.log(`見張るファイルは変わっていない（${hash}）。流さない`);
    return;
  }
  const { EXTRACT_READY } = await import("../src/shared/extract/extract");
  if (!EXTRACT_READY) {
    console.log("取り出しがまだ無い（004）。流さない");
    return;
  }
  const { makeHookRunner } = await import("./eval-hook-runner");
  const runner = await makeHookRunner();
  const items = loadTuneItems();
  const t0 = Date.now();
  const s = await runEval(items, runner.extract, runner.judge);
  const sec = (Date.now() - t0) / 1000;
  const row = historyRow(new Date(), hash, items.length, s, await runner.usdSince(t0), sec);
  writeFileSync(join(ROOT, NUMBERS), appendHistory(readFileSync(join(ROOT, NUMBERS), "utf-8"), row), "utf-8");
  writeFileSync(join(ROOT, STATE_FILE), JSON.stringify({ hash }, null, 2) + "\n", "utf-8");
  console.log(row);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
