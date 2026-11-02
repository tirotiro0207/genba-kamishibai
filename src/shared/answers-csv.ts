// 回答の書き出し（025）。docs/answers.csv の形にする。参加者の ID は種で混ぜた通し番号に置き換え、日時も出さない
import { rng } from "./assign";

export type Verdict = "correct" | "wrong" | "danger";
export const VERDICTS: Verdict[] = ["correct", "wrong", "danger"];

export interface ExportResponse {
  seq: number;
  participant: string;
  item: "A" | "B";
  shown: "card" | "text";
  ms: number | null;
  answer: string | null;
}
export interface ExportGrade {
  seq: number;
  response_seq: number;
  grader: "g1" | "g2";
  verdict: Verdict;
  answer_ja: string | null;
}

export const CSV_COLUMNS = ["respondent", "item", "shown", "ms", "answer", "answer_ja", "grader1", "grader2", "disagree"] as const;

/** 参加者 → R01, R02 …。並べる順番は種で混ぜる（申し込みの順から人を当てられないように） */
export function anonymize(seed: string, participants: string[]): Map<string, string> {
  const order = [...participants];
  const r = rng(`anon:${seed}`);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const w = Math.max(2, String(order.length).length);
  return new Map(order.map((p, i) => [p, `R${String(i + 1).padStart(w, "0")}`]));
}

/** 回答ごと・採点者ごとに最後の判定。訳はどちらかが最後に書いたもの */
export function latestGrades(grades: ExportGrade[]) {
  const by = new Map<number, { g1?: Verdict; g2?: Verdict; answer_ja?: string }>();
  for (const g of [...grades].sort((a, b) => a.seq - b.seq)) {
    const cur = by.get(g.response_seq) ?? {};
    cur[g.grader] = g.verdict;
    if (g.answer_ja) cur.answer_ja = g.answer_ja;
    by.set(g.response_seq, cur);
  }
  return by;
}

const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toAnswersCsv(seed: string, participants: string[], responses: ExportResponse[], grades: ExportGrade[]): string {
  const anon = anonymize(seed, participants);
  const g = latestGrades(grades);
  const rows = responses
    .map((r) => {
      const x = g.get(r.seq) ?? {};
      const disagree = x.g1 && x.g2 ? (x.g1 !== x.g2 ? "yes" : "no") : "";
      return [anon.get(r.participant) ?? "", r.item, r.shown, r.ms, r.answer, x.answer_ja, x.g1, x.g2, disagree];
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));
  return [CSV_COLUMNS.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\r\n") + "\r\n";
}
