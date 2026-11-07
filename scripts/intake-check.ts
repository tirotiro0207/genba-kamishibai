// 共有された更新を取り込むときの評価のやり直し（11/7）。
// コードは AGPL-3.0、docs と書き出した絵は CC BY 4.0 なので、ほかの会社・ほかの業界の人が直したプロンプト・採点の決まり・
// 評価データ・絵の部品を、この置き場に取り込める。取り込むたびに、精度に効くファイルが変わったかを見分け、
// 変わっていれば評価をやり直して、取り込む前の点と比べる。下がっていたら止める。
//
//   npx tsx scripts/intake-check.ts                       # 直前の merge / pull（ORIG_HEAD..HEAD）を調べる。git の post-merge から呼ぶ
//   npx tsx scripts/intake-check.ts --base origin/main    # 取り込む前の点をその ref から読む
//   npx tsx scripts/intake-check.ts --run-paid            # お金のかかる評価（調整用の 20 個・Claude の API）も流す
//   npx tsx scripts/intake-check.ts --ci                  # CI（PR）。API は呼ばず、型と単体テストも test.yml に任せる
//
// 終わりの番号: 0 通った・1 落ちた（点が下がった・型か単体テストが落ちた）・2 評価が要る（まだ流していない）・3 基準が変わった
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dayBudgetUsd, startOfJstDay, sumAllUsd } from "../src/shared/claude";
import { readState, ROOT, WATCHED } from "./eval-hook";

/** 精度に効く場所。check: paid は 20 個の評価（API）、rebase は比べる元そのものが変わる、unit は型と単体テスト、review は人の見直しも要る */
export const AREAS = [
  { key: "extract", label: "取り出しのプロンプトと決まり", paths: ["src/shared/extract/"], check: "paid" },
  { key: "judge", label: "採点の判定と数え方", paths: ["src/shared/eval/"], check: "paid" },
  { key: "evaldata", label: "評価データ（調整用の 20 個）", paths: ["eval/items_tune_"], check: "rebase" },
  { key: "safety", label: "危ない読み違いの安全網", paths: ["src/shared/verify/"], check: "unit" },
  { key: "make", label: "脚本と絵の下書きのプロンプト", paths: ["src/shared/make/", "eval/prompts/", "src/shared/card.ts"], check: "review" },
  { key: "picto", label: "絵の部品（ピクトグラム）", paths: ["src/shared/picto/"], check: "review" },
] as const;
export type AreaKey = (typeof AREAS)[number]["key"];

/** 変わったファイルを場所ごとに分ける。どこにも当たらないファイルは数えない */
export function classify(files: string[]): Map<AreaKey, string[]> {
  const out = new Map<AreaKey, string[]>();
  for (const raw of files) {
    const f = raw.replaceAll("\\", "/");
    // 最後の確認用の 10 個は取り込みでも読まない（holdout）
    if (f.startsWith("eval/holdout")) continue;
    const a = AREAS.find((x) => x.paths.some((p) => f.startsWith(p)));
    if (a) out.set(a.key, [...(out.get(a.key) ?? []), f]);
  }
  return out;
}

export interface EvalRow {
  at: string;
  hash: string;
  gold: number;
  pred: number;
  matched: number;
  wording: number;
  missed: number;
  extra: number;
  dangerous: number;
  usd: number;
}

const HEADING = "## 変更のたびの 20 項目（調整用）";

/** numbers.md の「変更のたびの 20 項目」の表の行を古い順に読む */
export function evalRows(md: string): EvalRow[] {
  const text = md.replaceAll("\r\n", "\n");
  const i = text.indexOf(HEADING);
  if (i < 0) return [];
  const rows: EvalRow[] = [];
  for (const line of text.slice(i + HEADING.length).split("\n")) {
    if (line.startsWith("## ")) break;
    const c = line.split("|").map((s) => s.trim());
    // | 日時 | ハッシュ | 項目 | 正解 | 答え | 組 | 言い方の違い | 漏れ | 取り出しすぎ | 危ない | 判定の直し | 費用 | …
    if (c.length < 13 || !/^\d{4}-\d{2}-\d{2}/.test(c[1])) continue;
    const n = (k: number) => Number(c[k]);
    rows.push({ at: c[1], hash: c[2], gold: n(4), pred: n(5), matched: n(6), wording: n(7), missed: n(8), extra: n(9), dangerous: n(10), usd: n(12) });
  }
  return rows;
}

/** 比べるときの揺れの幅（判定に AI を使うので、同じ中身でも数件は揺れる）。環境変数 INTAKE_TOLERANCE */
export const tolerance = () => {
  const n = Number(process.env.INTAKE_TOLERANCE);
  return Number.isFinite(n) && n >= 0 ? n : 2;
};

/** 取り込む前と後の点を比べる。危ない読み違いは 1 件でも増えたら落ちる。組・漏れ・取り出しすぎは揺れの幅を超えたら落ちる */
export function compare(before: EvalRow, after: EvalRow, tol = tolerance()): { ok: boolean; comparable: boolean; reasons: string[] } {
  if (before.gold !== after.gold) return { ok: false, comparable: false, reasons: [`正解の数が違う（${before.gold} → ${after.gold}）。評価データが変わったので比べられない`] };
  const reasons: string[] = [];
  if (after.dangerous > before.dangerous) reasons.push(`危ない読み違いが増えた（${before.dangerous} → ${after.dangerous}）`);
  if (after.matched < before.matched - tol) reasons.push(`組（合った数）が減った（${before.matched} → ${after.matched}）`);
  if (after.missed > before.missed + tol) reasons.push(`漏れが増えた（${before.missed} → ${after.missed}）`);
  if (after.extra > before.extra + tol) reasons.push(`取り出しすぎが増えた（${before.extra} → ${after.extra}）`);
  return { ok: reasons.length === 0, comparable: true, reasons };
}

/** 20 個の評価の見込みの費用: 近い 5 回のいちばん高い額の 1.2 倍。履歴が無ければ 1 USD */
export function estimateUsd(rows: EvalRow[]): number {
  const recent = rows.slice(-5).map((r) => r.usd).filter((x) => Number.isFinite(x) && x > 0);
  return recent.length ? Math.round(Math.max(...recent) * 1.2 * 100) / 100 : 1;
}

export const LOG_FILE = "eval/intake-log.md";
const LOG_HEAD =
  "# 取り込みの記録\n\n共有された更新を取り込むたびに `scripts/intake-check.ts` が 1 行足す（追記だけ）。説明は [docs/sharing.md](../docs/sharing.md)。\n\n| 日時（日本時間） | 取り込んだ範囲 | 変わった所 | 型・単体テスト | 20 個（前 → 後） | 結果 |\n|---|---|---|---|---|---|\n";

/** 記録に 1 行足す。ファイルが無ければ見出しから作る */
export function logLine(cells: string[]): string {
  return `| ${cells.map((c) => c.replaceAll("|", "／").replaceAll("\n", " ")).join(" | ")} |\n`;
}
export function appendLog(root: string, cells: string[]) {
  const p = join(root, LOG_FILE);
  if (!existsSync(p)) writeFileSync(p, LOG_HEAD, "utf-8");
  appendFileSync(p, logLine(cells), "utf-8");
}

const short = (r: EvalRow) => `組 ${r.matched}・漏れ ${r.missed}・取り出しすぎ ${r.extra}・危ない ${r.dangerous}`;
const jst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf-8" }).trim();
}
function gitOr(args: string[], fallback: string): string {
  try {
    return git(args);
  } catch {
    return fallback;
  }
}
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** eval-hook の watchedHash と同じ作り方のハッシュを、作業中のファイルではなく ref の中身から作る（CI と、取り込んだ先を調べるとき） */
export function refWatchedHash(ref: string): string {
  const files = gitOr(["ls-tree", "-r", "--name-only", ref, "--", ...WATCHED], "").split("\n").filter(Boolean).sort();
  const h = createHash("sha256");
  for (const f of files) {
    h.update(f + "\n");
    h.update(execFileSync("git", ["show", `${ref}:${f}`], { cwd: ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }).replaceAll("\r\n", "\n"));
  }
  return h.digest("hex").slice(0, 12);
}

/** 取り込んだコミットに、手元の作者以外のコミットがあるか（もう 1 台の PC からの pull は手元の作者と同じ） */
function fromOutside(base: string, head: string): boolean {
  const me = gitOr(["config", "user.email"], "");
  const authors = gitOr(["log", "--format=%ae", `${base}..${head}`], "").split("\n").filter(Boolean);
  return authors.some((a) => a !== me);
}

function run(cmd: string, args: string[]): boolean {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
  return r.status === 0;
}

async function main() {
  const ci = process.argv.includes("--ci");
  const base = arg("--base") ?? "ORIG_HEAD";
  const head = arg("--head") ?? "HEAD";
  const source = arg("--source");
  const say = (s: string) => {
    console.log(s);
    if (ci && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${s}\n\n`);
  };
  const baseSha = gitOr(["rev-parse", "--short", base], "");
  if (!baseSha) {
    say(`取り込む前の ref（${base}）が無い。調べない`);
    return 0;
  }
  const headSha = git(["rev-parse", "--short", head]);
  const changed = gitOr(["diff", "--name-only", base, head], "").split("\n").filter(Boolean);
  const hits = classify(changed);
  if (!hits.size) {
    say(`精度に効くファイルは変わっていない（${baseSha}..${headSha}）`);
    return 0;
  }
  const range = `${baseSha}..${headSha}${source ? `（${source}）` : ""}`;
  const where = [...hits.keys()].map((k) => AREAS.find((a) => a.key === k)!.label).join("・");
  say(`取り込んだ更新で精度に効く所が変わった: ${where}`);
  for (const [k, fs] of hits) say(`- ${AREAS.find((a) => a.key === k)!.label}: ${fs.join(", ")}`);
  const checks = new Set([...hits.keys()].map((k) => AREAS.find((a) => a.key === k)!.check));
  const notes: string[] = [];
  let code = 0;

  // 型と単体テスト（お金はかからない）。CI では test.yml が同じものを流すので、ここでは流さない
  let unit = ci ? "test.yml に任せる" : "";
  if (!ci) {
    const ok = run("npx", ["tsc"]) && run("npx", ["vitest", "run"]);
    unit = ok ? "通った" : "落ちた";
    if (!ok) code = 1;
  }

  // 20 個の評価（取り出し・採点が変わったとき）
  let evalCell = "要らない";
  const md = (ref: string | null) => (ref ? gitOr(["show", `${ref}:docs/numbers.md`], "") : readFileSync(join(ROOT, "docs/numbers.md"), "utf-8"));
  const beforeRows = evalRows(md(base));
  const before = beforeRows.at(-1);
  if (checks.has("rebase")) {
    notes.push("評価データが変わったので、前の点と比べられない。中身を人が確かめ、--accept-new-baseline を付けて流し直し、新しい基準にする");
    if (!process.argv.includes("--accept-new-baseline") && code === 0) code = 3;
  }
  if (checks.has("paid")) {
    const hash = refWatchedHash(head);
    const afterRows = evalRows(md(ci ? head : null));
    const isNew = (r: EvalRow) => !beforeRows.some((b) => b.at === r.at && b.hash === r.hash);
    // CI: PR に、取り込んだ先の中身で流した新しい行が入っていれば、それを比べる（入っていなければ評価が要る）。
    // 手元: 手元の作者がもう流してある（同じ中身のハッシュが記録にある）なら、その結果を比べる。ほかの人の更新は流し直す
    let after = ci
      ? afterRows.findLast((r) => r.hash === hash && isNew(r))
      : !fromOutside(base, head) && readState().hash === hash
        ? afterRows.findLast((r) => r.hash === hash)
        : undefined;
    if (!after && !ci) {
      const { loadEnv } = await import("../src/node/client");
      loadEnv();
      const est = estimateUsd(beforeRows);
      const { FileCallLog } = await import("../src/node/file-log");
      const today = await sumAllUsd(new FileCallLog(), startOfJstDay(Date.now()));
      const budget = dayBudgetUsd(process.env);
      say(`20 個の評価の見込み: ${est.toFixed(2)} USD（近い 5 回の最高の 1.2 倍）。今日の合計 ${today.toFixed(2)} / 上限 ${budget} USD`);
      if (!process.env.ANTHROPIC_API_KEY) notes.push("Claude の鍵が無いので 20 個の評価を流せない");
      else if (today + est > budget) notes.push(`流すと 1 日の上限（${budget} USD）を超えるので流さない`);
      else if (!process.argv.includes("--run-paid")) notes.push("20 個の評価がまだ。--run-paid を付けて流す（Claude の API を呼ぶ）");
      else if (run("npx", ["tsx", "scripts/eval-hook.ts", "--force"])) after = evalRows(md(null)).at(-1);
      else notes.push("20 個の評価が途中で落ちた");
    }
    if (ci && !after) notes.push("20 個の評価の結果が PR に入っていない。鍵を持つ人が手元で npm run intake -- --run-paid を流す（CI は API を呼ばない）");
    if (!after) {
      evalCell = before ? `${short(before)} → まだ` : "まだ";
      if (code === 0) code = 2;
    } else if (!before) {
      evalCell = `（前の点なし）→ ${short(after)}`;
    } else {
      const c = compare(before, after);
      evalCell = `${short(before)} → ${short(after)}`;
      if (!c.ok) {
        notes.push(...c.reasons);
        if (!c.comparable && process.argv.includes("--accept-new-baseline")) notes.push("新しい基準として受け入れた");
        else code = c.comparable ? 1 : code || 3;
      }
    }
  }
  if (checks.has("review")) notes.push("脚本・絵の部品は 20 個の評価では測れない。カードの見た目を監修者が見直す（キャラの部品は見直し台、カードは確認待ちの列）");

  const verdict = code === 0 ? "通った" : code === 1 ? "落ちた" : code === 2 ? "評価が要る" : "基準が変わった";
  for (const n of notes) say(`- ${n}`);
  say(`結果: ${verdict}`);
  if (!ci) appendLog(ROOT, [jst(), range, where, unit, evalCell, [verdict, ...notes].join("。")]);
  return code;
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    },
  );
}
