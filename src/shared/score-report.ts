// 採点（作者と監修者が 1〜10 の点とコメントを付けたもの）の書き出しと集計（071・072）。
// 画面にも Worker にも依らない形にしておき、Node のスクリプトとテストから使う。
import { unpackAnswer } from "./answer-fields";

export type Grader = "author" | "supervisor";
export interface ScoreRow {
  seq: number;
  target: string;
  grader: string;
  score: number | null;
  comment: string | null;
}
export interface AnswerRow {
  /** r:<seq>（① 時間を計って答える）か p:<seq>（② 絵だけで答える） */
  target: string;
  participant: string;
  group: string;
  part: "time" | "picture";
  /** ① のときの項目（A・B）と見せたもの（card・text）。② のときはカードの id */
  item: string;
  shown: string;
  ms: number | null;
  answer: string;
}

/** 追記だけの表なので、採点する人と答えごとに、いちばん新しい行を使う */
export function latestScores(rows: ScoreRow[]) {
  const out: Record<Grader, Map<string, { score: number | null; comment: string }>> = { author: new Map(), supervisor: new Map() };
  for (const r of [...rows].sort((a, b) => a.seq - b.seq))
    if (r.grader === "author" || r.grader === "supervisor") out[r.grader].set(r.target, { score: r.score, comment: (r.comment ?? "").trim() });
  return out;
}

/** 2 人の点の差がこれより大きいと「食い違い」（10 段階の 3 段以上） */
export const DISAGREE = 3;

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/**
 * 匿名の CSV。参加者は P01 からの番号と国だけにする。答えはそのままの 2 つの欄と日本語の訳、2 人の点と差、食い違いの印。
 * コメントは採点した人の言葉で、参加者や現場の人の名前が入り得るので入れない
 */
export function answersCsv(answers: AnswerRow[], scores: ReturnType<typeof latestScores>, ja: Record<string, string>) {
  const ids = new Map<string, string>();
  for (const a of answers) if (!ids.has(a.participant)) ids.set(a.participant, `P${String(ids.size + 1).padStart(2, "0")}`);
  const head = ["target", "participant", "group", "part", "item", "shown", "ms", "answer_ja", "answer_own", "translation_ja", "score_author", "score_supervisor", "diff", "disagree"];
  const lines = answers.map((a) => {
    const f = unpackAnswer(a.answer) ?? { ja: "", own: "" };
    const x = scores.author.get(a.target)?.score ?? null;
    const y = scores.supervisor.get(a.target)?.score ?? null;
    const diff = x !== null && y !== null ? Math.abs(x - y) : null;
    return [a.target, ids.get(a.participant)!, a.group, a.part, a.item, a.shown, a.ms, f.ja, f.own, ja[a.target] ?? "", x, y, diff, diff === null ? "" : diff >= DISAGREE ? 1 : 0].map(csvCell).join(",");
  });
  return [head.join(","), ...lines].join("\n") + "\n";
}

export interface PartSummary {
  answers: number;
  scored: Record<Grader, number>;
  mean: Record<Grader, number | null>;
  both: number;
  /** 2 人とも付けた答えでの、差の平均と食い違いの数 */
  meanDiff: number | null;
  disagree: number;
}

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 100) / 100 : null);

export function summarize(answers: AnswerRow[], scores: ReturnType<typeof latestScores>) {
  const one = (list: AnswerRow[]): PartSummary => {
    const pts = (g: Grader) => list.map((a) => scores[g].get(a.target)?.score).filter((s): s is number => typeof s === "number");
    const pairs = list
      .map((a) => [scores.author.get(a.target)?.score, scores.supervisor.get(a.target)?.score] as const)
      .filter((p): p is readonly [number, number] => typeof p[0] === "number" && typeof p[1] === "number");
    const diffs = pairs.map(([x, y]) => Math.abs(x - y));
    return {
      answers: list.length,
      scored: { author: pts("author").length, supervisor: pts("supervisor").length },
      mean: { author: mean(pts("author")), supervisor: mean(pts("supervisor")) },
      both: pairs.length,
      meanDiff: mean(diffs),
      disagree: diffs.filter((d) => d >= DISAGREE).length,
    };
  };
  return {
    all: one(answers),
    time: one(answers.filter((a) => a.part === "time")),
    timeCard: one(answers.filter((a) => a.part === "time" && a.shown === "card")),
    timeText: one(answers.filter((a) => a.part === "time" && a.shown === "text")),
    picture: one(answers.filter((a) => a.part === "picture")),
  };
}
