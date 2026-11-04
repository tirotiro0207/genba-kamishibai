// 060: 監修者の確認表（○△× と直し）を取り込む部分。ファイルを読み書きしない（scripts/review-import.ts が使う）。
// 30 項目の直した版を受け取り、調整用の 20 項目だけを差し替え、項目ごとの直した差分を返す。
// 確認用の 10 項目は中身を返さない（ハッシュの一致だけを見る）。

export type Mark = "○" | "△" | "×";
/** 調整用の項目に残す欄。ほかの欄（下書きの判断メモなど）は落とす */
export const KEEP = ["no", "reviewer", "source", "url", "text", "do", "dont", "why"] as const;
const LISTS = ["do", "dont", "why"] as const;

export type Item = Record<string, unknown> & { no: number };

/** 「○ / o / 〇」「△ / ^」「× / x」→ 印。読めなければ null */
export function readMark(s: string): Mark | null {
  const t = s.trim().toLowerCase();
  if (["○", "〇", "o", "ok"].includes(t)) return "○";
  if (["△", "^", "fix"].includes(t)) return "△";
  if (["×", "x", "ng"].includes(t)) return "×";
  return null;
}

/** 確認表の印の CSV（見出し `no,mark,note`。note は無くてもよい）→ 番号 → 印と一言 */
export function readMarks(csv: string): Map<number, { mark: Mark; note: string }> {
  const rows = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const head = rows.shift()?.split(",").map((h) => h.trim()) ?? [];
  const at = (k: string) => head.indexOf(k);
  if (at("no") < 0 || at("mark") < 0) throw new Error("確認表の CSV の見出しに no と mark が要る");
  const out = new Map<number, { mark: Mark; note: string }>();
  for (const r of rows) {
    const c = r.split(",");
    const no = Number(c[at("no")]);
    const mark = readMark(c[at("mark")] ?? "");
    if (!Number.isInteger(no) || !mark) throw new Error(`確認表の行が読めない: ${r}`);
    out.set(no, { mark, note: at("note") >= 0 ? c.slice(at("note")).join(",").trim() : "" });
  }
  return out;
}

/** 調整用の項目の形にする。担当者の欄は今の調整用の値（役割）を残し、KEEP に無い欄は落とす */
export function toTune(src: Item, cur: Item | undefined): Item {
  const out: Item = { no: Number(src.no) };
  // 欄の並びは KEEP のとおり（担当者は番号のすぐ後ろ）
  for (const k of KEEP)
    if (k === "reviewer" && cur && "reviewer" in cur) out.reviewer = cur.reviewer;
    else if (k !== "no" && k in src) out[k] = src[k];
  return out;
}

export interface FieldDiff {
  field: string;
  before: string;
  after: string;
}

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v ?? null));
/** 1 項目の欄ごとの差分。do / dont / why は 1 行ずつ（text だけ）比べ、根拠や注の違いはまとめて 1 つ */
export function diffItem(before: Item, after: Item): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const k of KEEP) {
    if (k === "no" || k === "reviewer") continue;
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if ((LISTS as readonly string[]).includes(k) && Array.isArray(a) && Array.isArray(b)) {
      const ta = a.map((x) => show((x as { text?: unknown }).text));
      const tb = b.map((x) => show((x as { text?: unknown }).text));
      const n = Math.max(ta.length, tb.length);
      let textChanged = false;
      for (let i = 0; i < n; i++)
        if (ta[i] !== tb[i]) {
          textChanged = true;
          out.push({ field: `${k}[${i}]`, before: ta[i] ?? "", after: tb[i] ?? "" });
        }
      if (!textChanged) out.push({ field: k, before: "（根拠・注の違い）", after: show(b) });
    } else out.push({ field: k, before: show(a), after: show(b) });
  }
  return out;
}

export interface ImportResult {
  tune: Item[];
  changes: { no: number; mark: Mark | null; note: string; diffs: FieldDiff[] }[];
  /** 確認用の 10 項目のうち、直した版でハッシュが変わったものの番号（中身は返さない） */
  holdoutChanged: number[];
  missing: number[];
  dropped: string[];
}

/**
 * 30 項目の直した版 `next` と今の調整用 `tune`、確認用のハッシュ（番号 → sha256）から、差し替えたあとの調整用を作る。
 * `hash` は項目 1 つのハッシュを出す関数（Node の crypto を外から渡す）
 */
export function importReview(
  next: Item[],
  tune: Item[],
  holdoutHashes: Map<number, string>,
  hash: (item: Item) => string,
  marks = new Map<number, { mark: Mark; note: string }>(),
): ImportResult {
  const byNo = new Map(next.map((i) => [Number(i.no), i]));
  const dropped = new Set<string>();
  const missing: number[] = [];
  const changes: ImportResult["changes"] = [];
  const out = tune.map((cur) => {
    const src = byNo.get(cur.no);
    if (!src) {
      missing.push(cur.no);
      return cur;
    }
    for (const k of Object.keys(src)) if (!(KEEP as readonly string[]).includes(k)) dropped.add(k);
    const t = toTune(src, cur);
    const m = marks.get(cur.no) ?? (typeof src.mark === "string" ? { mark: readMark(src.mark), note: "" } : undefined);
    const diffs = diffItem(cur, t);
    if (diffs.length || m) changes.push({ no: cur.no, mark: m?.mark ?? null, note: m?.note ?? "", diffs });
    return t;
  });
  const holdoutChanged: number[] = [];
  for (const [no, h] of holdoutHashes) {
    const src = byNo.get(no);
    if (!src) missing.push(no);
    else if (hash(src) !== h) holdoutChanged.push(no);
  }
  return { tune: out, changes, holdoutChanged, missing: missing.sort((a, b) => a - b), dropped: [...dropped].sort() };
}

/** 履歴の 1 節（Markdown）。調整用の 20 項目の差分だけを書く。確認用は番号と数だけ */
export function historyEntry(at: string, from: string, r: ImportResult): string {
  const count = (m: Mark) => r.changes.filter((c) => c.mark === m).length;
  const lines = [
    `## ${at} ${from}`,
    "",
    `- 印: ○ ${count("○")}・△ ${count("△")}・× ${count("×")}（調整用の 20 項目のうち）`,
    `- 直した項目: ${r.changes.filter((c) => c.diffs.length).length}`,
    `- 確認用の 10 項目でハッシュが変わったもの: ${r.holdoutChanged.length ? r.holdoutChanged.join("・") : "無し"}`,
  ];
  if (r.missing.length) lines.push(`- 直した版に無かった番号: ${r.missing.join("・")}`);
  if (r.dropped.length) lines.push(`- 落とした欄: ${r.dropped.join("・")}`);
  for (const c of r.changes) {
    lines.push("", `### ${c.no}${c.mark ? ` ${c.mark}` : ""}${c.note ? ` ${c.note}` : ""}`);
    if (!c.diffs.length) lines.push("", "直し無し");
    for (const d of c.diffs) lines.push("", `- ${d.field}`, `  - 前: ${d.before}`, `  - 後: ${d.after}`);
  }
  return `${lines.join("\n")}\n`;
}
