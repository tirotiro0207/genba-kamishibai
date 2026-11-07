// プロンプトに、試す資料の言葉が漏れていないかを調べる（063 の前の通しで足した）。
// 調べる相手の文のどれかと、8 字続く語句が重なったら漏れ。重なりがあれば 1 で終わる（その版は使わない）。
// 相手: 手元の D1 の取り出しの決まり（夜間の下書きの回で取り出したもの全部）・当日のカードの文の表・確認の項目（調整用と確認用）。
// 確認用の項目は HOLDOUT_FILE で受け、重なった語句は出さずに数だけを出す（確認用の中身を表に出さない）。
// 確認の項目は「問題の文」（法令の本文と、答えが引いた本文の箇所）・「答え」（採点に使う do・dont・why の text。claimsFromItem と同じ欄）・「注記」（監修者の補足。採点に使わない）に分ける。
// 漏れに数えるのは答えとの重なりだけ。問題の文は解くときに AI へそのまま渡すので、指示に同じ語句があっても答えを教えたことにならない（11/7 作者の決まり）。
// 問題の文と注記との重なりは数だけを出し、漏れには数えない。
//
//   HOLDOUT_FILE=<確認用> npx tsx scripts/leak-check.ts <プロンプト>... [--runs 回,回] [--table <当日のカードの表 .md>]
import { existsSync, readFileSync } from "node:fs";
import { execD1, wranglerExec } from "../src/node/d1-node";

const strip = (s: string) => s.replace(/[\s、。・「」『』（）()，,.：:；;!?！？—\-［］[\]【】/／|｜]/g, "");

/** 相手の文と 8 字続けて重なる語句 */
export function overlaps(prompt: string, texts: string[], n = 8): string[] {
  const p = strip(prompt);
  const hit = new Set<string>();
  for (const t of texts) {
    const s = strip(t);
    for (let i = 0; i + n <= s.length; i++) if (p.includes(s.slice(i, i + n))) hit.add(s.slice(i, i + n));
  }
  return [...hit];
}

type Item = Record<string, unknown>;
type Part = { text?: unknown; span?: unknown; note?: unknown };
const str = (v: unknown) => (typeof v === "string" && v ? [v] : []);
const parts = (it: Item, k: string) => (Array.isArray(it[k]) ? (it[k] as unknown[]) : []).map((g) => (typeof g === "string" ? { text: g } : ((g ?? {}) as Part)));
const ANSWER_KEYS = ["do", "dont", "why"];
/** 問題の文: 法令の本文と、答えが根拠に引いた本文の箇所（span）。解くときに AI へ渡すもの */
export const inputTexts = (items: Item[]) => items.flatMap((it) => [...str(it.text), ...ANSWER_KEYS.flatMap((k) => parts(it, k).flatMap((g) => str(g.span)))]);
/** 答え: 採点に使う欄（do・dont・why の text） */
export const answerTexts = (items: Item[]) => items.flatMap((it) => ANSWER_KEYS.flatMap((k) => parts(it, k).flatMap((g) => str(g.text))));
/** 注記: 監修者の補足（採点に使わない） */
export const noteTexts = (items: Item[]) => items.flatMap((it) => ANSWER_KEYS.flatMap((k) => parts(it, k).flatMap((g) => str(g.note))));

async function main() {
  const args = process.argv.slice(2);
  const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const prompts = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
  const runs = (opt("--runs") ?? "").split(",").filter(Boolean);
  const db = execD1(wranglerExec("local"));
  const rules: string[] = [];
  for (const run of runs) {
    const xs = (await db.prepare("SELECT x.rules FROM night_drafts d JOIN extractions x ON x.id = d.extraction_id WHERE d.run_id = ? AND d.item = -1").bind(run).all<{ rules: string }>()).results;
    for (const x of xs) for (const r of JSON.parse(x.rules) as { text: string; reasons: { text: string }[] }[]) rules.push(r.text, ...r.reasons.map((y) => y.text));
  }
  const table = opt("--table");
  const cards = table ? readFileSync(table, "utf-8").split("\n").filter((l) => l.startsWith("|") && !/^\|\s*-/.test(l)).map((l) => l.split("|")[1]?.trim() ?? "") : [];
  const tuneItems = JSON.parse(readFileSync("eval/items_tune_v1r8.json", "utf-8")) as Item[];
  const tune = answerTexts(tuneItems);
  const tuneInput = inputTexts(tuneItems);
  const tuneNote = noteTexts(tuneItems);
  const hf = process.env.HOLDOUT_FILE;
  const holdout = hf && existsSync(hf) ? answerTexts(JSON.parse(readFileSync(hf, "utf-8")) as Item[]) : null;
  let bad = false;
  console.log(`相手: 取り出しの決まりと理由 ${rules.length}（${runs.join("・") || "無し"}）・当日のカードの表 ${cards.length} 行・調整用の答え ${tune.length} 文（問題の文 ${tuneInput.length}・注記 ${tuneNote.length} は数だけ）・確認用 ${holdout ? `${holdout.length} 文` : "無し（HOLDOUT_FILE が無い）"}`);
  for (const p of prompts) {
    const text = readFileSync(p, "utf-8");
    const a = overlaps(text, rules);
    const b = overlaps(text, cards);
    const c = overlaps(text, tune);
    const d = holdout ? overlaps(text, holdout).length : null;
    const e = overlaps(text, tuneInput).length;
    const f = overlaps(text, tuneNote).length;
    if (a.length || b.length || c.length || d) bad = true;
    console.log(`${p}: 取り出し ${a.length}${a.length ? `（${a.slice(0, 8).join("・")}）` : ""}・当日のカード ${b.length}${b.length ? `（${b.slice(0, 8).join("・")}）` : ""}・調整用 ${c.length}${c.length ? `（${c.slice(0, 8).join("・")}）` : ""}・確認用 ${d ?? "未"}・調整用の問題の文との重なり ${e}・注記との重なり ${f}（この 2 つは漏れに数えない）`);
  }
  process.exit(bad ? 1 : 0);
}

if (process.argv[1]?.endsWith("leak-check.ts"))
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  });
