// 30 項目（調整用の 20 ＋最後の確認用の 10）を、確定版の正解で 2 つのモデルに解かせる（090・101）。
// 最後の確認用の 10 は、まずファイルと 1 項目ずつのハッシュが eval/holdout_hashes_v1r8.json と一致するかを見てから流す。
// 10 項目の置き場はコードに書かず、流すときに EVAL_HOLDOUT で渡す（プロンプトを直すコードとテストからは読まない決まり）。
// 中身は画面に出さず、数だけを docs/numbers.md に足す。
//
//   EVAL_HOLDOUT=<10 項目のファイル> npx tsx scripts/eval30.ts --check       # ハッシュの一致だけを見る（API を呼ばない）
//   EVAL_HOLDOUT=<10 項目のファイル> npx tsx scripts/eval30.ts --run-paid    # 2 つのモデルで流す（費用の上限は MAX_USD）
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { guardedCall } from "../src/shared/claude";
import { judgeParams, parseJudgement } from "../src/shared/eval/judge";
import { claimsFromItem, repairJudgement, score, sumScores, type Score } from "../src/shared/eval/score";
import { parseRules, rulesParams, rulesToClaims } from "../src/shared/extract/rules";
import { makeClient } from "../src/node/client";
import { FileCallLog } from "../src/node/file-log";
import { loadTuneItems, ROOT, type TuneItem, watchedHash } from "./eval-hook";

/** 最後の確認用の 10 項目のファイル（流すときに環境変数で渡す） */
const holdoutFile = () => {
  const f = process.env.EVAL_HOLDOUT;
  if (!f) throw new Error("EVAL_HOLDOUT に最後の確認用の 10 項目のファイルを入れて流す");
  return f;
};
const HASH_FILE = "eval/holdout_hashes_v1r8.json";
const NUMBERS = "docs/numbers.md";
export const MODELS = ["claude-opus-5-5", "claude-fable-5-1"] as const;
/** 2 つのモデルを合わせた費用の上限（作者の OK は約 2.3 USD・上限 3 USD） */
export const MAX_USD = 3;

/** Python の json.dumps(item, ensure_ascii=False, sort_keys=True, separators=(',', ':')) と同じ形 */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");

/** 最後の確認用の 10 項目を読み、ファイルと 1 項目ずつのハッシュが一致するかを返す（中身は返すが表には出さない） */
export function loadHoldout(root = ROOT) {
  const raw = readFileSync(join(root, holdoutFile()));
  const want = JSON.parse(readFileSync(join(root, HASH_FILE), "utf-8")) as { file_sha256: string; items: { no: number; sha256: string }[] };
  const items = JSON.parse(raw.toString("utf-8")) as TuneItem[];
  const fileOk = sha(raw) === want.file_sha256;
  const bad = want.items.filter((w) => {
    const it = items.find((x) => x.no === w.no);
    return !it || sha(canonical(it)) !== w.sha256;
  });
  return { items, fileOk, itemsOk: bad.length === 0 && items.length === want.items.length, bad: bad.map((b) => b.no), n: want.items.length };
}

async function runModel(model: string, items: TuneItem[]) {
  const client = makeClient();
  const log = new FileCallLog();
  const deps = { client, log };
  const t0 = Date.now();
  const since = new Date(t0).toISOString();
  const per = await Promise.all(
    items.map(async (it) => {
      const gold = claimsFromItem(it);
      const msg = await guardedCall(deps, { purpose: "measure", label: `30 項目の取り出し（${model}）`, params: { ...rulesParams(it.text), model } });
      const pred = rulesToClaims(parseRules(msg, it.text));
      const raw = parseJudgement(await guardedCall(deps, { purpose: "measure", label: "30 項目の採点の判定", params: judgeParams(gold, pred) }));
      const { judgement } = repairJudgement(gold.length, pred.length, raw);
      return { no: it.no, s: score(gold, pred, judgement) };
    }),
  );
  return { per, usd: await log.sumUsd("measure", since), sec: (Date.now() - t0) / 1000 };
}

const row = (at: string, model: string, part: string, n: number, s: Score, usd: string, sec: string) =>
  `| ${at} | ${model} | ${part} | ${n} | ${s.gold} | ${s.pred} | ${s.matched} | ${s.wording} | ${s.missed} | ${s.extra} | ${s.dangerous} | ${usd} | ${sec} |`;

async function main() {
  const h = loadHoldout();
  console.log(`最後の確認用: ${h.n} 項目・ファイルのハッシュ ${h.fileOk ? "一致" : "不一致"}・項目ごとのハッシュ ${h.itemsOk ? "全部一致" : `不一致 ${h.bad.join(",")}`}`);
  if (!h.fileOk || !h.itemsOk) process.exit(1);
  if (!process.argv.includes("--run-paid")) return;
  const tune = loadTuneItems();
  const all = [...tune, ...h.items];
  const holdNo = new Set(h.items.map((x) => x.no));
  const at = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
  const lines: string[] = [];
  let spent = 0;
  for (const model of MODELS) {
    if (spent >= MAX_USD) throw new Error(`上限 ${MAX_USD} USD に届いたので ${model} は流さない（${spent.toFixed(4)} USD）`);
    const r = await runModel(model, all);
    spent += r.usd;
    const pick = (f: (no: number) => boolean) => sumScores(r.per.filter((p) => f(p.no)).map((p) => p.s));
    lines.push(row(at, model, "30 項目", all.length, pick(() => true), r.usd.toFixed(4), r.sec.toFixed(0)));
    lines.push(row(at, model, "うち調整用 20", tune.length, pick((n) => !holdNo.has(n)), "—", "—"));
    lines.push(row(at, model, "うち確認用 10", h.items.length, pick((n) => holdNo.has(n)), "—", "—"));
    console.log(lines.slice(-3).join("\n"));
  }
  const head = [
    "",
    "## 30 項目を確定版の正解で 2 つのモデルに解かせる（090・101）",
    "",
    `- 正解: 調整用の 20 項目（${"eval/items_tune_v1r8.json"}。11/4 に監修者の確認を取り込んだ確定版）と、最後の確認用の 10 項目`,
    `- 最後の確認用の 10 項目は、流す前にファイルと 1 項目ずつのハッシュが \`eval/holdout_hashes_v1r8.json\` と一致することを確かめた（\`npx tsx scripts/eval30.ts --check\`）。プロンプトを直す作業ではこの 10 項目を使っていない`,
    `- 取り出しのプロンプトとコードのハッシュ: ${watchedHash()}。判定（採点の AI）は 20 項目の評価と同じ。費用は API が返したトークン数から出した`,
    "",
    "| 日時（日本時間） | 取り出しのモデル | 範囲 | 項目 | 正解 | 答え | 組 | 言い方の違い | 漏れ | 取り出しすぎ | 危ない読み違い | 費用（USD） | 時間（秒） |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  const md = readFileSync(join(ROOT, NUMBERS), "utf-8");
  const nl = md.includes("\r\n") ? "\r\n" : "\n";
  writeFileSync(join(ROOT, NUMBERS), md.trimEnd() + nl + [...head, ...lines].join(nl) + nl, "utf-8");
  console.log(`合計 ${spent.toFixed(4)} USD`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
