// 取り出しのプロンプトを目隠しで合わせる（062 の前）。API ではなく、サブスクリプションの `claude -p` を呼ぶ。
// 取り出す側には、元の文とプロンプトだけを渡す（正解・○△×・注記は渡さない）。採点は別の `claude -p` で、採点する側だけが正解を見る。
// 周回中は調整用の 20 項目だけを使う。確認用の 10 項目は --final のときだけ読み、点だけを出す（ずれの中身は出さない）。
//
//   CLAUDE_BIN=<claude.exe> npx tsx scripts/blind-tune.ts --prompt eval/prompts/extract_v1.txt --round 1 [--rep 1] [--jobs 5] [--only 1,2] [--final（HOLDOUT_FILE が要る）]
//
// 書くもの: private/tune/<周>/（取り出しと採点の生の結果。git に入らない）と、docs/numbers.md の 1 行
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { privatePath } from "../src/node/private-dir";
import { numberLines } from "../src/shared/extract/rules";

const ROOT = join(import.meta.dirname, "..");
/** 取り出しと採点の既定（11/5 から両方 Opus 5.5・high。補足を探す決まりは推論が要り、Sonnet の採点はぶれが大きかったため）。
 *  前の設定（取り出し medium・採点 Sonnet 5.5 low）は --extract-effort medium --judge-model claude-sonnet-5-5 --judge-effort low */
export const EXTRACT = { model: "claude-opus-5-5", effort: "high" };
export const JUDGE = { model: "claude-opus-5-5", effort: "high" };
const TUNE = "eval/items_tune_v1r8.json";
/** 確認用の 10 項目の場所は、コードに書かず --final のときに環境変数 HOLDOUT_FILE で渡す（eval-hook のテストが見張る） */
const holdoutFile = () => {
  const f = process.env.HOLDOUT_FILE;
  if (!f || !existsSync(f)) throw new Error("--final には HOLDOUT_FILE（確認用の 10 項目のファイル）が要る");
  return f;
};
const NUMBERS = "docs/numbers.md";
const HEADING = "## 取り出しのプロンプトを合わせ直す（Opus 5.5・high、サブスクリプションの claude -p）";
const TABLE_HEAD =
  "| 周 | 日時（日本時間） | 設定 | プロンプト | 回 | 調整用（20）の点 | 確認用（10）の点 | 合う | 足りない | 余計 | 違う | 失敗 | 時間（分） | 取り出しの換算費用（USD） | 直した決まり |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";

export type Field = "do" | "dont" | "why";
const FIELDS: Field[] = ["do", "dont", "why"];
interface Item {
  no: number;
  text: string;
  do: { text: string }[];
  dont: { text: string }[];
  why: { text: string }[];
}

const SOURCE = {
  type: "object",
  additionalProperties: false,
  required: ["quote", "lines"],
  properties: { quote: { type: "string" }, lines: { type: "array", items: { type: "integer" } } },
};
/** 取り出しの形（rules.ts と同じ） */
const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rules"],
  properties: {
    rules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "text", "from", "reasons", "checklist", "reworded"],
        properties: {
          // 補足の規定がある見込みと、どこを見るか（v9 から。採点には使わない）
          check: { type: "string" },
          kind: { type: "string", enum: ["do", "dont"] },
          text: { type: "string" },
          from: SOURCE,
          reasons: {
            type: "array",
            items: { type: "object", additionalProperties: false, required: ["text", "from", "stated"], properties: { text: { type: "string" }, from: SOURCE, stated: { type: "boolean" } } },
          },
          checklist: { type: "boolean" },
          reworded: { type: "boolean" },
        },
      },
    },
  },
};

const JUDGE_SYSTEM = `あなたは、決まりの取り出しを採点する係です。
「正解」と「答え」は、どちらも 1 つの欄（やること・やらないこと・なぜ のどれか）の文の並びです。
正解の 1 つずつに、次のどれかを付けてください。
- 合う: 同じことを言っている答えがある（言い方の違い、細かさの違いは合うにする）。その答えの番号を pred に入れる
- 違う: 同じ話題の答えはあるが、意味が違う（数字・条件・対象の取り違え、向きが逆、そのとおりに動くと危ない）。その答えの番号を pred に入れる
- 足りない: どの答えにも無い。pred は -1
1 つの答えは、1 つの正解とだけ組にする。
どの正解とも組にならなかった答えは、extra に番号を入れる（余計）。ただし、正解の 1 つを 2 つに分けて言っているだけの答えは、もう 1 つの答えも同じ正解の言い換えとして extra に入れない（skip に入れる）。`;

const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["gold", "extra", "skip"],
  properties: {
    gold: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["i", "label", "pred"],
        properties: { i: { type: "integer" }, label: { type: "string", enum: ["合う", "違う", "足りない"] }, pred: { type: "integer" } },
      },
    },
    extra: { type: "array", items: { type: "integer" } },
    skip: { type: "array", items: { type: "integer" } },
  },
};

/** claude.exe のパス。PATH のものは使わない */
export function claudeBin(): string {
  const bin = process.env.CLAUDE_BIN;
  if (!bin || !existsSync(bin)) throw new Error("CLAUDE_BIN に %APPDATA%\\Claude\\claude-code\\<最新の版>\\<ハッシュ>\\claude.exe を入れる");
  return bin;
}

/** 設定・指示・道具を何も読ませずに 1 回呼ぶ。返すのは構造化された出力 */
/** usd は claude -p が出す換算の費用（API の値段で数えた額。サブスクリプションでは払っていない） */
export function claudeP(o: { model: string; effort: string; system: string; schema: object; input: string; cwd: string }): Promise<{ out: unknown; sec: number; usd: number }> {
  const args = [
    "-p",
    "--model",
    o.model,
    "--effort",
    o.effort,
    "--setting-sources",
    "",
    "--tools",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--system-prompt",
    o.system,
    "--json-schema",
    JSON.stringify(o.schema),
    "--output-format",
    "json",
  ];
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const p = spawn(claudeBin(), args, { cwd: o.cwd, windowsHide: true });
    let so = "";
    let se = "";
    p.stdout.on("data", (d) => (so += d));
    p.stderr.on("data", (d) => (se += d));
    p.on("error", reject);
    p.on("close", (code) => {
      try {
        const j = JSON.parse(so) as { structured_output?: unknown; result?: string; is_error?: boolean; total_cost_usd?: number };
        if (code !== 0 || j.is_error) throw new Error(`claude -p が失敗した（${code}）: ${(j.result ?? se).slice(0, 300)}`);
        const out = j.structured_output ?? JSON.parse(j.result ?? "");
        resolve({ out, sec: (Date.now() - t0) / 1000, usd: j.total_cost_usd ?? 0 });
      } catch (e) {
        reject(e instanceof Error && e.message.startsWith("claude -p") ? e : new Error(`claude -p の出力が読めない: ${(so || se).slice(0, 300)}`));
      }
    });
    p.stdin.end(o.input);
  });
}

interface Extracted {
  rules: { kind: "do" | "dont"; text: string; reasons: { text: string; stated: boolean }[] }[];
}
/** 取り出しの結果を欄ごとの文にする。同じ理由はまとめる */
export function toFields(x: Extracted): Record<Field, string[]> {
  const why = [...new Set(x.rules.flatMap((r) => r.reasons.map((s) => s.text.trim())))];
  return { do: x.rules.filter((r) => r.kind === "do").map((r) => r.text), dont: x.rules.filter((r) => r.kind === "dont").map((r) => r.text), why };
}

export interface Count {
  合う: number;
  足りない: number;
  余計: number;
  違う: number;
}
const zero = (): Count => ({ 合う: 0, 足りない: 0, 余計: 0, 違う: 0 });
/** 点 = 合う ÷（正解の数 + 余計）。正解も答えも無い欄は 1 */
export const points = (c: Count) => {
  const d = c.合う + c.足りない + c.違う + c.余計;
  return d === 0 ? 1 : c.合う / d;
};

interface Judged {
  gold: { i: number; label: "合う" | "違う" | "足りない"; pred: number }[];
  extra: number[];
  skip: number[];
}
/** 採点の結果を数える。範囲の外の番号や、付け忘れた正解は「足りない」に倒す */
export function countJudged(goldN: number, predN: number, j: Judged): Count {
  const c = zero();
  const seen = new Set<number>();
  for (let i = 0; i < goldN; i++) {
    const g = j.gold.find((x) => x.i === i);
    const ok = g && g.label !== "足りない" && g.pred >= 0 && g.pred < predN && !seen.has(g.pred);
    if (ok) seen.add(g.pred);
    c[ok ? g.label : "足りない"]++;
  }
  const skip = new Set(j.skip.filter((p) => p >= 0 && p < predN));
  for (let p = 0; p < predN; p++) if (!seen.has(p) && !skip.has(p)) c.余計++;
  return c;
}

/** プロンプトに正解の特徴的な語句（記号を除いて 8 字続く所）が入っていないか。入っていた語句を返す */
export function leaks(prompt: string, items: Item[], n = 8): string[] {
  const strip = (s: string) => s.replace(/[\s、。・「」（）()，,.：:；;!?！？—\-]/g, "");
  const p = strip(prompt);
  const hit = new Set<string>();
  for (const it of items)
    for (const f of FIELDS)
      for (const g of it[f]) {
        const s = strip(g.text);
        for (let i = 0; i + n <= s.length; i++) if (p.includes(s.slice(i, i + n))) hit.add(s.slice(i, i + n));
      }
  return [...hit];
}

async function pool<T, R>(xs: T[], jobs: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(jobs, xs.length) }, async () => {
      while (next < xs.length) {
        const i = next++;
        out[i] = await f(xs[i]);
      }
    }),
  );
  return out;
}

async function main() {
  const a = process.argv.slice(2);
  const opt = (k: string) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
  const promptPath = opt("--prompt");
  const round = opt("--round");
  if (!promptPath || !round) throw new Error("使い方: blind-tune.ts --prompt <プロンプト> --round <周> [--jobs 5] [--only 1,2] [--final] [--note <直した決まり>]");
  const final = a.includes("--final");
  const ex = { model: EXTRACT.model, effort: opt("--extract-effort") ?? EXTRACT.effort };
  const ju = { model: opt("--judge-model") ?? JUDGE.model, effort: opt("--judge-effort") ?? JUDGE.effort };
  const rep = opt("--rep") ?? "1";
  const setting = `取り出し ${ex.model.replace("claude-", "")} ${ex.effort}・採点 ${ju.model.replace("claude-", "")} ${ju.effort}`;
  const jobs = Number(opt("--jobs") ?? 5);
  const only = opt("--only")?.split(",").map(Number);
  const prompt = readFileSync(join(ROOT, promptPath), "utf-8");
  const tune = JSON.parse(readFileSync(join(ROOT, TUNE), "utf-8")) as Item[];

  // 正解の語句がプロンプトに入っていたら、その周は無効
  const leaked = leaks(prompt, tune);
  if (leaked.length) {
    console.log(`無効: プロンプトに正解の語句が ${leaked.length} 個入っている（${leaked.slice(0, 5).join("・")}）`);
    process.exitCode = 2;
    return;
  }
  const items = (final ? (JSON.parse(readFileSync(holdoutFile(), "utf-8")) as Item[]) : tune).filter((i) => !only || only.includes(i.no));
  const dir = privatePath("tune", final ? `${round}-final` : `${round}-${rep}`);
  mkdirSync(dir, { recursive: true });
  // 取り出す側も採点する側も、リポジトリの外の空のフォルダで動かす（リポジトリの指示や正解のファイルを読ませない）
  const cwd = privatePath("tune", "_empty");
  mkdirSync(cwd, { recursive: true });
  const t0 = Date.now();
  let failed = 0;
  let extractUsd = 0;
  const per = await pool(items, jobs, async (it) => {
    try {
      const x = await claudeP({ ...ex, system: prompt, schema: EXTRACT_SCHEMA, input: `元の文:\n${numberLines(it.text)}`, cwd });
      extractUsd += x.usd;
      const pred = toFields(x.out as Extracted);
      const counts = {} as Record<Field, Count>;
      const judged = {} as Record<Field, Judged>;
      await Promise.all(
        FIELDS.map(async (f) => {
          const gold = it[f].map((g) => g.text);
          if (!gold.length && !pred[f].length) {
            counts[f] = zero();
            return;
          }
          const list = (xs: string[]) => xs.map((s, i) => `${i}. ${s}`).join("\n") || "（なし）";
          const input = `欄: ${f === "do" ? "やること" : f === "dont" ? "やらないこと" : "なぜ"}\n\n正解:\n${list(gold)}\n\n答え:\n${list(pred[f])}`;
          const j = await claudeP({ ...ju, system: JUDGE_SYSTEM, schema: JUDGE_SCHEMA, input, cwd });
          judged[f] = j.out as Judged;
          counts[f] = countJudged(gold.length, pred[f].length, judged[f]);
        }),
      );
      if (!final) writeFileSync(join(dir, `${it.no}.json`), JSON.stringify({ no: it.no, pred, checks: (x.out as { rules: { check?: string }[] }).rules.map((r) => r.check ?? "").filter(Boolean), judged, counts, sec: x.sec, usd: x.usd }, null, 1));
      console.log(`${it.no}: ${FIELDS.map((f) => `${f} ${points(counts[f]).toFixed(2)}`).join("・")}（${x.sec.toFixed(0)} 秒）`);
      return counts;
    } catch (e) {
      failed++;
      console.log(`${it.no}: 失敗 ${e instanceof Error ? e.message : e}`);
      return null;
    }
  });
  const ok = per.filter((c): c is Record<Field, Count> => !!c);
  const total = zero();
  for (const c of ok) for (const f of FIELDS) for (const k of Object.keys(total) as (keyof Count)[]) total[k] += c[f][k];
  // 点は項目 × 欄の点の平均（失敗した項目は 0 点）
  const cells = ok.flatMap((c) => FIELDS.map((f) => points(c[f])));
  const score = cells.reduce((s, x) => s + x, 0) / (items.length * FIELDS.length);
  const min = (Date.now() - t0) / 60000;
  const at = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 16);
  console.log(`周 ${round}${final ? "（取っておく用）" : ""}: 点 ${score.toFixed(3)}・合う ${total.合う}・足りない ${total.足りない}・余計 ${total.余計}・違う ${total.違う}・失敗 ${failed}・${min.toFixed(1)} 分・取り出しの換算 ${extractUsd.toFixed(3)} USD（1 項目 ${(extractUsd / Math.max(1, items.length - failed)).toFixed(4)}）・${setting}`);
  if (only) return;
  const numbers = join(ROOT, NUMBERS);
  if (!readFileSync(numbers, "utf-8").includes(HEADING)) appendFileSync(numbers, `\n${HEADING}\n\n点 = 項目 × 欄（やること・やらないこと・なぜ）ごとの 合う ÷（正解の数 + 余計）の平均。同じ版を 2 回流して平均で比べる。換算費用は claude -p が出す API の値段での額（サブスクリプションなので払っていない）。確認用は前の合わせ込みで 2 回流し、2 項目の書き込みも読んでいるので、ここでの確認用の点は目隠しの点ではなく参考の点\n\n${TABLE_HEAD}\n`);
  const s = score.toFixed(3);
  const row = `| ${round} | ${at} | ${setting} | ${promptPath.split("/").pop()} | ${rep} | ${final ? "" : s} | ${final ? `${s}（参考）` : ""} | ${total.合う} | ${total.足りない} | ${total.余計} | ${total.違う} | ${failed} | ${min.toFixed(1)} | ${extractUsd.toFixed(3)} | ${opt("--note") ?? ""} |`;
  writeFileSync(numbers, insertRow(readFileSync(numbers, "utf-8"), HEADING, row));
}

/** 見出しの下の表の最後の行のすぐ後ろに 1 行足す（表の下に書いた要点より上） */
export function insertRow(doc: string, heading: string, row: string): string {
  const lines = doc.split("\n");
  let i = lines.indexOf(heading);
  while (i + 1 < lines.length && !lines[i + 1].startsWith("|")) i++;
  while (i + 1 < lines.length && lines[i + 1].startsWith("|")) i++;
  lines.splice(i + 1, 0, row);
  return lines.join("\n");
}

if (process.argv[1]?.endsWith("blind-tune.ts"))
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
