// 読み手パネルの採点（027）。読み手の答えを、カードの「守ること・なぜ」（019 のカードの形）と照らす。
// 照らすのも Claude Code のサブエージェント（判定役）で、API のクレジットは使わない。判定役には読み手の設定を渡さない。
// 数える（率・危ない読み違い）のはコードで、判定役には数えさせない。
import type { CardBody } from "../card";
import { PANEL_MODELS, type PanelModel, type ReaderResult } from "./prompt";

/** 照らす相手。絵の名前（絵 1 …）ごとに、カードの守ること・なぜ */
export interface KeyCard {
  label: string;
  cardId: string;
  rule: CardBody["rule"];
  why: CardBody["why"];
}

export const VERDICTS = ["match", "partial", "miss", "danger"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const VERDICT_LABEL: Record<Verdict, string> = { match: "合う", partial: "一部合う", miss: "合わない", danger: "危ない読み違い" };

export interface Judgment {
  reader: string;
  label: string;
  verdict: Verdict;
  /** 理由（1 文） */
  note: string;
}

export function judgePrompt(runId: string, model: PanelModel, keys: KeyCard[], results: ReaderResult[], outPath: string): string {
  const rows = results.flatMap((r) => r.answers.map((a) => ({ reader: r.reader, ...a })));
  return `あなたは、絵のカードの答え合わせをする係です。読み手が絵だけを見て書いた答えを、カードの「守ること」と「なぜ」に照らして判定します。

## 判定のしかた
- match: 守ること（何をする・何をしない）が合っている。なぜは無くても合っていてもよい
- partial: 守ることの一部だけ合っている、または言い方があいまいで、合っているとも違うとも言い切れない
- miss: 守ることが違う、または分からないと答えた
- danger: 逆の意味に取っている（してはいけないことを、してよい・するべきと読んだ）。危ないことにつながる読み違い
- 言い方の違い・ひらがな・つたない日本語は減点しない。意味だけを見る
- 答えに書いていないことを推し量って足さない

## カード（絵の名前ごと）
${keys.map((k) => `- ${k.label}: 守ること「${k.rule}」／なぜ「${k.why}」`).join("\n")}

## 読み手の答え
${rows.map((x) => `- ${x.reader} ${x.label}: する「${x.do}」／しない「${x.dont}」／なぜ「${x.why}」`).join("\n")}

## 書き方
答え 1 つにつき 1 つ判定し、次の JSON だけを Write ツールで ${outPath} に書いてください。

{"run": "${runId}", "model": "${PANEL_MODELS[model].id}", "judgments": [{"reader": "R01", "label": "絵 1", "verdict": "match", "note": "…"}]}
`;
}

export function parseJudgments(raw: unknown, runId: string, model: PanelModel, keys: KeyCard[], results: ReaderResult[]): Judgment[] {
  const j = raw as { run?: string; model?: string; judgments?: Judgment[] };
  if (!j || j.run !== runId) throw new Error("判定の回が違う");
  if (j.model !== PANEL_MODELS[model].id) throw new Error(`判定のモデルが ${PANEL_MODELS[model].id} ではない（${String(j.model)}）`);
  if (!Array.isArray(j.judgments)) throw new Error("judgments が無い");
  const want = new Set(results.flatMap((r) => r.answers.map((a) => `${r.reader}|${a.label}`)));
  const labels = new Set(keys.map((k) => k.label));
  const seen = new Set<string>();
  for (const x of j.judgments) {
    const k = `${x.reader}|${x.label}`;
    if (!want.has(k) || !labels.has(x.label) || seen.has(k)) throw new Error(`知らない答えか二重の判定（${k}）`);
    if (!VERDICTS.includes(x.verdict)) throw new Error(`判定の値が違う（${k}: ${String(x.verdict)}）`);
    seen.add(k);
  }
  if (seen.size !== want.size) throw new Error(`判定していない答えがある（${seen.size} / ${want.size}）`);
  return j.judgments;
}

export interface Tally {
  n: number;
  match: number;
  partial: number;
  miss: number;
  danger: number;
  /** 伝わる率（match の割合） */
  rate: number;
}
const tally = (js: Judgment[]): Tally => {
  const t = { n: js.length, match: 0, partial: 0, miss: 0, danger: 0, rate: 0 };
  for (const j of js) t[j.verdict]++;
  t.rate = t.n ? t.match / t.n : 0;
  return t;
};

/** カードごと・読み手ごと・全体の数 */
export function aggregate(keys: KeyCard[], js: Judgment[]) {
  const byCard = keys.map((k) => ({ ...k, ...tally(js.filter((j) => j.label === k.label)) }));
  const readers = [...new Set(js.map((j) => j.reader))].sort();
  const byReader = readers.map((reader) => ({ reader, ...tally(js.filter((j) => j.reader === reader)) }));
  return { byCard, byReader, total: tally(js) };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** docs/readers.md に貼る表（カードごと。危ない読み違いが多い順） */
export function cardTable(agg: ReturnType<typeof aggregate>, modelId: string): string {
  const rows = [...agg.byCard].sort((a, b) => b.danger - a.danger || a.rate - b.rate);
  return [
    `モデル: ${modelId}。全体の伝わる率 ${pct(agg.total.rate)}、危ない読み違い ${agg.total.danger} 件（答え ${agg.total.n} 件）`,
    "",
    "| カード | 守ること | 伝わる率 | 合う | 一部 | 合わない | 危ない読み違い |",
    "|---|---|---|---|---|---|---|",
    ...rows.map((c) => `| ${c.cardId} | ${c.rule} | ${pct(c.rate)} | ${c.match} | ${c.partial} | ${c.miss} | ${c.danger} |`),
  ].join("\n");
}
