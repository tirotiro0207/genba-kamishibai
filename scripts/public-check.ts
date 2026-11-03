// 102: 公開物（リポジトリと公開デモ）に、禁句・鍵・個人情報・資料の文が無いかを調べる。見つけたものは直さずに一覧にする。
// 一覧は private/audit/102-public-check.json（git の外）。画面には件数と、どのファイルのどの種類かだけを出し、見つけた値は出さない。
//
//   BANNED_RULES=<約束のファイル> PUBLIC_CHECK_NAMES_FILE=<名前の一覧> npx tsx scripts/public-check.ts [--no-demo]
//
// 調べる所: git に入っているファイル全部・コミットの文全部・公開デモ（GET だけ。入口・画面の JS・架空の会社の API）。
// 禁句: BANNED_RULES のファイルの banned のコードブロック（コミットのフックと同じ読み方）。
// 鍵: 鍵の形の文字列と、private/tenants の PIN と鍵の値（値は出さない）。
// 個人情報: メール（noreply と例を除く）・電話番号・.dev.vars の *_NAME の値・PUBLIC_CHECK_NAMES_FILE の名前の一覧（1 行 1 語。中身は出さず、一覧の何行目かだけを出す）。
// 資料の文: 手元のマニュアルの文（private/pdf/manual）と 20 文字続けて同じ所。確認用の 10 項目は読まない
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { privatePath } from "../src/node/private-dir";
import { copiedRuns } from "../src/shared/overlap";

const ROOT = join(import.meta.dirname, "..");
export const DEMO_URL = "https://genba-kamishibai.ikjshare.workers.dev";

export type Kind = "禁句" | "鍵" | "PIN" | "メール" | "電話" | "名前" | "資料の文";
export interface Hit {
  where: string;
  kind: Kind;
  /** 何に当たったか（禁句の語・名前の欄の名前など。鍵と PIN の値は出さない） */
  what: string;
}

const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");

/** 約束のファイルの ```banned のコードブロック → 禁句と、それを探す正規表現（英数字の語は前後が英数字でないときだけ） */
export function loadBanned(rules: string): { word: string; re: RegExp }[] {
  const m = rules.replace(/\r\n/g, "\n").match(/```banned\n([\s\S]*?)```/);
  if (!m) throw new Error("約束のファイルに banned のコードブロックが無い");
  return m[1]
    .split("\n")
    .map((raw) => ({ raw: raw.trim(), w: norm(raw) }))
    .filter((x) => x.w)
    .map(({ raw, w }) => {
      const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // biome-ignore lint/suspicious/noControlCharactersInRegex: ASCII だけかを見る
      return { word: raw, re: /^[\x00-\x7f]+$/.test(w) ? new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`, "i") : new RegExp(esc) };
    });
}

const KEY_RES: [string, RegExp][] = [
  ["Anthropic の鍵", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["鍵の代入", /\b(api[_-]?key|secret|token|password)\b\s*[:=]\s*["'][A-Za-z0-9_\-+/=]{20,}["']/i],
  ["AWS の鍵", /\bAKIA[0-9A-Z]{16}\b/],
  ["秘密鍵", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["GitHub の鍵", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
];
const MAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MAIL_OK = /(@users\.noreply\.github\.com|@example\.(com|org|jp)|@anthropic\.com|^noreply@|^git@github\.com)$/i;
const PHONE = /(?<![\d.-])0\d{1,4}-\d{1,4}-\d{4}(?![\d-])/g;

export interface Secrets {
  banned: { word: string; re: RegExp }[];
  /** 鍵と PIN の値（ラベル → 値） */
  values: [string, string][];
  /** 名前（ラベル → 値） */
  names: [string, string][];
  /** 資料の文（行） */
  material: string[];
}

/** 1 つの文書を調べる。資料の文は、比べる文書が多いので外で別に見る */
export function scan(where: string, text: string, s: Omit<Secrets, "material">): Hit[] {
  const hits: Hit[] = [];
  const add = (kind: Kind, what: string) => hits.some((h) => h.kind === kind && h.what === what) || hits.push({ where, kind, what });
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const n = norm(line);
    for (const b of s.banned) if (b.re.test(n)) add("禁句", b.word);
    for (const [label, re] of KEY_RES) if (re.test(line)) add("鍵", label);
    for (const m of line.match(MAIL) ?? []) if (!MAIL_OK.test(m)) add("メール", m.replace(/^[^@]+/, "…"));
    for (const _ of line.match(PHONE) ?? []) add("電話", "電話番号の形");
  }
  for (const [label, v] of s.values) if (v.length >= 4 && text.includes(v)) add(label.startsWith("PIN") ? "PIN" : "鍵", label);
  const nt = norm(text);
  for (const [label, v] of s.names) {
    const nv = norm(v);
    if (nv.length < 2 || !nt.includes(nv)) continue;
    const at = lines.flatMap((l, i) => (norm(l).includes(nv) ? [i + 1] : []));
    add("名前", `${label}（${at.length ? `${at.slice(0, 5).join("・")} 行目` : "行をまたぐ"}）`);
  }
  return hits;
}

/** private/tenants/*.json の中の PIN（役割の PIN の people も）と鍵の値（文字列で 4 文字以上のもの）を、ファイルと欄の名前のラベルで集める */
export function secretValues(json: unknown, label: string): [string, string][] {
  const out: [string, string][] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string" && v.length >= 4 && /pin|people|key|token|secret/i.test(path)) out.push([`${/pin|people/i.test(path) ? "PIN" : "鍵"}（${label}${path}）`, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(json, "");
  return out;
}

/** 名前の一覧（1 行 1 語。空の行と # の行は飛ばす）→ ラベルは「名前の一覧の N 行目」 */
export function namesFromList(list: string): [string, string][] {
  return list
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l, i) => [`名前の一覧の ${i + 1} 行目`, l.trim()] as [string, string])
    .filter(([, v]) => v && !v.startsWith("#"));
}

/** .dev.vars の *_NAME の値（ラベルは変数の名前） */
export function namesFromVars(vars: string): [string, string][] {
  return [...vars.matchAll(/^([A-Z0-9_]+_NAME)\s*=\s*"?([^"\r\n]*)"?\s*$/gm)].map((m) => [m[1], m[2].trim()] as [string, string]).filter(([, v]) => v);
}

const TEXT = /\.(md|ts|tsx|js|mjs|cjs|json|css|html|yml|yaml|txt|toml|py|sh|ps1|sql|csv|svg|example)$|(^|\/)(\.gitignore|LICENSE|CLAUDE\.md)$/;
const LOCK = /(^|\/)package-lock\.json$/;
const git = (...a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });

function loadSecrets(): Secrets {
  const rulesPath = process.env.BANNED_RULES;
  if (!rulesPath) throw new Error("BANNED_RULES に約束のファイルの場所を入れて流す");
  const tenants = privatePath("tenants");
  const values = existsSync(tenants)
    ? readdirSync(tenants)
        .filter((f) => f.endsWith(".json"))
        .flatMap((f) => secretValues(JSON.parse(readFileSync(join(tenants, f), "utf-8")), f))
    : [];
  const vars = join(ROOT, ".dev.vars");
  const manual = privatePath("pdf", "manual");
  return {
    banned: loadBanned(readFileSync(rulesPath, "utf-8")),
    values,
    names: [
      ...(existsSync(vars) ? namesFromVars(readFileSync(vars, "utf-8")) : []),
      ...(process.env.PUBLIC_CHECK_NAMES_FILE ? namesFromList(readFileSync(process.env.PUBLIC_CHECK_NAMES_FILE, "utf-8")) : []),
    ],
    material: existsSync(manual)
      ? readdirSync(manual)
          .filter((f) => /^p\d+\.json$/.test(f))
          .flatMap((f) => (JSON.parse(readFileSync(join(manual, f), "utf-8")) as { lines: { text: string }[] }).lines.map((l) => l.text))
      : [],
  };
}

/** 公開デモから GET で読めるもの: 入口・画面の JS と CSS・架空の会社の API */
async function demoDocs(): Promise<[string, string][]> {
  const out: [string, string][] = [];
  const get = async (path: string) => {
    const r = await fetch(`${DEMO_URL}${path}`, { headers: { "cache-control": "no-cache" } });
    const t = await r.text();
    out.push([`公開デモ ${path}（${r.status}）`, t]);
    return { ok: r.ok, t };
  };
  const top = await get("/");
  for (const m of top.t.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) await get(m[1]);
  const cards = await get("/api/t/demo/cards");
  for (const p of ["/api/t/demo/glossary", "/api/t/demo/samples", "/api/t/demo/stats", "/api/t/demo/session"]) await get(p);
  if (cards.ok) {
    const ids = [...cards.t.matchAll(/"id":"([0-9a-f-]{36})"/g)].map((m) => m[1]);
    for (const id of [...new Set(ids)].slice(0, 40)) await get(`/api/t/demo/cards/${id}`);
  }
  return out;
}

async function main() {
  const s = loadSecrets();
  const docs: [string, string][] = [];
  for (const f of git("ls-files").split(/\r?\n/).filter((x) => x && TEXT.test(x) && !LOCK.test(x))) docs.push([f, readFileSync(join(ROOT, f), "utf-8")]);
  const msgs = git("log", "--format=%h%x00%B%x01").split("\x01").filter((x) => x.trim());
  for (const m of msgs) {
    const [h, body] = m.trim().split("\x00");
    docs.push([`コミット ${h}`, body ?? ""]);
  }
  if (!process.argv.includes("--no-demo")) docs.push(...(await demoDocs()));

  const hits: Hit[] = docs.flatMap(([w, t]) => scan(w, t, s));
  // 資料の文: 評価データ（法令と公開資料の文）は資料ではないので比べない
  if (s.material.length)
    for (const [w, t] of docs) if (!w.startsWith("eval/")) for (const run of copiedRuns(t, s.material, 20)) hits.push({ where: w, kind: "資料の文", what: `${run.length} 文字` });

  const dir = privatePath("audit");
  mkdirSync(dir, { recursive: true });
  const at = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" });
  writeFileSync(join(dir, "102-public-check.json"), `${JSON.stringify({ at, docs: docs.length, material: s.material.length, hits }, null, 1)}\n`);
  const byKind = new Map<string, number>();
  for (const h of hits) byKind.set(h.kind, (byKind.get(h.kind) ?? 0) + 1);
  console.log(`調べた文書 ${docs.length}（ファイル・コミットの文・公開デモ）・禁句 ${s.banned.length} 語・鍵と PIN ${s.values.length}・名前 ${s.names.length}・資料の文 ${s.material.length} 行`);
  console.log(`見つけたもの ${hits.length} 件: ${[...byKind].map(([k, n]) => `${k} ${n}`).join("・") || "無し"}`);
  for (const h of hits) console.log(`- ${h.kind}: ${h.where}${h.kind === "禁句" || h.kind === "PIN" || h.kind === "鍵" ? "" : `（${h.what}）`}`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
