// 会社の言葉（085・§5 L1 ③）。人の直しの前と後の文から、言い換えと使わない言い方を取り出す。API は使わない。
// 文字ごとの最長共通部分列で違う所（かたまり）を見つけ、かたまりの端が漢字・カタカナ・英数字の途中なら、
// 同じ種類の文字が続くところまで前後を広げて、言葉の切れ目に揃える（「検電器」→「検電ドライバー」の「器」だけを取らない）。
// 比べる前にふりがな（｜漢字《よみ》）を外す。ふりがなを足しただけ・外しただけの直しを、言い換えや使わない言い方にしない。
import { rubyBase } from "./ruby";

export type WordKind = "call" | "rephrase" | "avoid";

export interface CompanyWord {
  kind: WordKind;
  phrase: string;
  /** 呼び方はベトナム語、言い換えは直した後の言い方、使わない言い方は空 */
  prefer: string;
}

/** 言い換え・使わない言い方として取る長さ（短すぎる助詞の入れ替えと、長すぎる書き直しは言葉ではない） */
export const PHRASE_MIN = 2;
export const PHRASE_MAX = 20;
/** これだけの長さを超える文は比べない（最長共通部分列の表が大きくなりすぎる） */
const TEXT_MAX = 400;

type Script = "kanji" | "kata" | "alnum" | "other";
function script(ch: string | undefined): Script {
  if (!ch) return "other";
  if (/[一-鿿々〆]/.test(ch)) return "kanji";
  if (/[゠-ヿー]/.test(ch)) return "kata";
  if (/[0-9A-Za-z０-９Ａ-Ｚａ-ｚ]/.test(ch)) return "alnum";
  return "other";
}

/** 違うかたまり: 前の [a0, a1) が後の [b0, b1) に変わった */
interface Hunk {
  a0: number;
  a1: number;
  b0: number;
  b1: number;
}

function hunks(a: string[], b: string[]): Hunk[] {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Hunk[] = [];
  let i = 0;
  let j = 0;
  let cur: Hunk | null = null;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      if (cur) out.push(cur), (cur = null);
      i++, j++;
      continue;
    }
    cur ??= { a0: i, a1: i, b0: j, b1: j };
    if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) cur.b1 = ++j;
    else cur.a1 = ++i;
  }
  if (cur) out.push(cur);
  return out;
}

/** かたまりの前後を、同じ種類の文字が続くところまで広げる（前と後で共通の文字だけを動く） */
function widen(a: string[], b: string[], h: Hunk): Hunk {
  let { a0, a1, b0, b1 } = h;
  const left = script(a[a0] ?? b[b0]);
  while (a0 > 0 && b0 > 0 && a[a0 - 1] === b[b0 - 1] && left !== "other" && script(a[a0 - 1]) === left) a0--, b0--;
  const right = script(a[a1 - 1] ?? b[b1 - 1]);
  while (a1 < a.length && b1 < b.length && a[a1] === b[b1] && right !== "other" && script(a[a1]) === right) a1++, b1++;
  return { a0, a1, b0, b1 };
}

const clean = (s: string) => s.replace(/^[\s、。・，．,.]+|[\s、。・，．,.]+$/g, "");

/** 1 つの欄の直しの前と後から、言い換え（前 → 後）と使わない言い方（消された言い方）を取り出す */
export function wordsFromEdit(before: string, after: string): CompanyWord[] {
  if (before === after || before.length > TEXT_MAX || after.length > TEXT_MAX) return [];
  const a = [...before];
  const b = [...after];
  const out: CompanyWord[] = [];
  for (const raw of hunks(a, b)) {
    const h = widen(a, b, raw);
    const from = clean(a.slice(h.a0, h.a1).join(""));
    const to = clean(b.slice(h.b0, h.b1).join(""));
    if (from.length < PHRASE_MIN || from.length > PHRASE_MAX || to.length > PHRASE_MAX) continue;
    if (!to) out.push({ kind: "avoid", phrase: from, prefer: "" });
    else if (from !== to) out.push({ kind: "rephrase", phrase: from, prefer: to });
  }
  return out;
}

/** 日本語の文の欄（言葉の欄のベトナム語は比べない） */
export const TEXT_FIELDS = ["rule", "why", "words.ja"] as const;

/** 直しの記録（050 の before・after）から、欄ごとの文を取り出す */
export function fieldTexts(side: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of TEXT_FIELDS) {
    const [k, sub] = f.split(".");
    const v = side[k];
    const s = sub ? (v && typeof v === "object" ? (v as Record<string, unknown>)[sub] : undefined) : v;
    if (typeof s === "string") out[f] = s;
  }
  return out;
}

/** 直しの前と後（直した欄だけ）から、会社の言葉を全部取り出す */
export function wordsFromChange(before: Record<string, unknown>, after: Record<string, unknown>): CompanyWord[] {
  const a = fieldTexts(before);
  const b = fieldTexts(after);
  return TEXT_FIELDS.flatMap((f) => (f in a && f in b ? wordsFromEdit(rubyBase(a[f]), rubyBase(b[f])) : []));
}

/** 使わない言い方として見せる言い換えの回数（1 回の直しは好みかもしれないので、2 回から） */
export const AVOID_FROM_REPHRASE = 2;
