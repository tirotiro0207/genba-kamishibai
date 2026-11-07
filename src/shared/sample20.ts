// 064: 夜間の一括で作ったカードから、監修者が見る 20 枚を種で選び、記入欄を作って集計する。
// 同じ種なら、カードの並び順にかかわらず同じ 20 枚。記入欄は「そのまま署名／直して署名／作り直し」・書き足しの数・漏れの数・1 枚の時間
import { rng } from "./assign";

export const SAMPLE_SIZE = 20;
export const OUTCOMES = ["そのまま署名", "直して署名", "作り直し"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** 種からカードを n 枚選ぶ。ID を並べ替えてから混ぜるので、渡す順番に左右されない */
export function pickSample(seed: string, ids: string[], n = SAMPLE_SIZE): string[] {
  const out = [...new Set(ids)].sort();
  const r = rng(`${seed}:sample20`);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}

/** 本文に脚本（コマ割りが 1 つ以上ある script）があるか（11/6） */
export function hasScript(body: unknown): boolean {
  const s = (body as { script?: unknown } | null)?.script;
  if (!s || typeof s !== "object") return false;
  const frames = (s as { frames?: unknown }).frames;
  return Array.isArray(frames) && frames.length > 0;
}

/**
 * 脚本のあるカードの行だけを残す（11/6）。脚本の有無で分けたいとき（method: "script"）に使う。11/6 に前の作り方へ戻したので、今のカードには脚本が無く、既定ではこれで外さない。
 * 外した行は黙って落とさず、脚本の無い行と本文の JSON が読めない行に分けて ID を返す
 */
export function scriptedOnly<R extends { id: string; body: string }>(rows: R[]): { kept: R[]; noScript: string[]; broken: string[] } {
  const kept: R[] = [];
  const noScript: string[] = [];
  const broken: string[] = [];
  for (const r of rows) {
    let body: unknown;
    try {
      body = JSON.parse(r.body);
    } catch {
      broken.push(r.id);
      continue;
    }
    if (hasScript(body)) kept.push(r);
    else noScript.push(r.id);
  }
  return { kept, noScript, broken };
}

export interface Entry {
  card: string;
  outcome: Outcome;
  /** 監修者が書き足した決まり・言葉の数 */
  added: number;
  /** 元の文にあるのにカードに無かったものの数 */
  missed: number;
  /** 1 枚にかかった時間（秒） */
  seconds: number;
  note: string;
}

const HEAD = ["順", "カード", "決まり（見出し）", "結果（そのまま署名／直して署名／作り直し）", "書き足しの数", "漏れの数", "かかった秒", "一言"];
const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);

/** 監修者に渡す空の記入欄（CSV）。1 行目に種を書く */
export function formCsv(seed: string, picked: { id: string; title: string }[]): string {
  const rows = [`# 種,${cell(seed)}`, HEAD.join(","), ...picked.map((p, i) => [String(i + 1), p.id, cell(p.title), "", "", "", "", ""].join(","))];
  return `﻿${rows.join("\n")}\n`;
}

/** CSV の 1 行を欄に分ける（"" の中のカンマと "" を読む） */
function split(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const count = (s: string, what: string, row: number) => {
  const t = s.trim() === "" ? "0" : s.trim();
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${row} 行目の${what}が数でない: ${s}`);
  return n;
};

/** 記入した欄を読む。種と、書かれた行（結果が空の行は「まだ」として返さない）と、まだの行の数 */
export function readForm(csv: string): { seed: string; entries: Entry[]; blank: number } {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const seedLine = split(lines.shift() ?? "");
  if (seedLine[0] !== "# 種") throw new Error("1 行目に種が無い");
  lines.shift();
  const entries: Entry[] = [];
  let blank = 0;
  lines.forEach((l, i) => {
    const c = split(l);
    const outcome = (c[3] ?? "").trim();
    if (!outcome) {
      blank++;
      return;
    }
    if (!(OUTCOMES as readonly string[]).includes(outcome)) throw new Error(`${i + 1} 行目の結果が読めない: ${outcome}`);
    entries.push({ card: c[1], outcome: outcome as Outcome, added: count(c[4] ?? "", "書き足しの数", i + 1), missed: count(c[5] ?? "", "漏れの数", i + 1), seconds: count(c[6] ?? "", "秒", i + 1), note: (c[7] ?? "").trim() });
  });
  return { seed: seedLine[1], entries, blank };
}

export interface Summary {
  n: number;
  outcomes: Record<Outcome, number>;
  added: number;
  missed: number;
  medianSeconds: number;
  totalSeconds: number;
}

export function summarize(entries: Entry[]): Summary {
  const outcomes = Object.fromEntries(OUTCOMES.map((o) => [o, entries.filter((e) => e.outcome === o).length])) as Record<Outcome, number>;
  const s = entries.map((e) => e.seconds).sort((a, b) => a - b);
  const mid = s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
  return { n: entries.length, outcomes, added: entries.reduce((a, e) => a + e.added, 0), missed: entries.reduce((a, e) => a + e.missed, 0), medianSeconds: mid, totalSeconds: s.reduce((a, b) => a + b, 0) };
}

/** docs/numbers.md に貼る表 */
export function summaryMarkdown(seed: string, x: Summary, blank: number): string {
  return [
    `種: \`${seed}\`（記入済み ${x.n} 枚・まだ ${blank} 枚）`,
    "",
    "| そのまま署名 | 直して署名 | 作り直し | 書き足し（合計） | 漏れ（合計） | 1 枚の時間（中央値・秒） | 合計の時間（秒） |",
    "|---|---|---|---|---|---|---|",
    `| ${x.outcomes.そのまま署名} | ${x.outcomes.直して署名} | ${x.outcomes.作り直し} | ${x.added} | ${x.missed} | ${x.medianSeconds} | ${x.totalSeconds} |`,
    "",
  ].join("\n");
}
