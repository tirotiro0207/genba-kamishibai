// 取り出しの採点（003a）。正解と答えの照合は AI の判定（judge.ts）に任せ、数えるのはここで機械的に行う。
// 照合を文字の一致にしないのは、同じ決まりでも言い方が大きく変わるため（「近づかない」と「3m 離れる」など）。

export type ClaimKind = "do" | "dont" | "why";

export interface Claim {
  kind: ClaimKind;
  text: string;
  /** 元の文のどこから（抜き出し） */
  span?: string;
}

export type Verdict = "same" | "wording" | "dangerous";

/** AI の判定の結果。gold と pred は、それぞれの並びの番号 */
export interface Judgement {
  pairs: Array<{ gold: number; pred: number; verdict: Verdict }>;
  /** どの正解とも組にならない答えのうち、危ない行為をしてよいと読めるもの */
  dangerousExtras: number[];
}

export interface Score {
  gold: number;
  pred: number;
  /** 正解と組になった答え */
  matched: number;
  same: number;
  /** 意味は合っているが言い方が違う */
  wording: number;
  /** 漏れ: 組にならなかった正解 */
  missed: number;
  /** 取り出しすぎ: 組にならなかった答え */
  extra: number;
  /** 危ない読み違い: 組の中で意味が危ない方へずれたもの＋危ない取り出しすぎ */
  dangerous: number;
}

export function validateJudgement(goldCount: number, predCount: number, j: Judgement): void {
  const g = new Set<number>();
  const p = new Set<number>();
  for (const pair of j.pairs) {
    if (pair.gold < 0 || pair.gold >= goldCount || pair.pred < 0 || pair.pred >= predCount) throw new Error("判定の番号が範囲の外");
    if (g.has(pair.gold) || p.has(pair.pred)) throw new Error("判定で同じものが 2 回組になっている");
    g.add(pair.gold);
    p.add(pair.pred);
  }
  for (const e of j.dangerousExtras) {
    if (e < 0 || e >= predCount || p.has(e)) throw new Error("危ない取り出しすぎの番号が正しくない");
  }
}

/**
 * AI の判定の崩れを直す。範囲の外の番号と、2 回目以降に同じものを組にした組を落とす（最初の組を残す）。
 * 落とした数を返し、採点の記録に残す。
 */
export function repairJudgement(goldCount: number, predCount: number, j: Judgement): { judgement: Judgement; dropped: number } {
  const g = new Set<number>();
  const p = new Set<number>();
  const pairs = j.pairs.filter((pair) => {
    const ok = pair.gold >= 0 && pair.gold < goldCount && pair.pred >= 0 && pair.pred < predCount && !g.has(pair.gold) && !p.has(pair.pred);
    if (ok) {
      g.add(pair.gold);
      p.add(pair.pred);
    }
    return ok;
  });
  const extras = [...new Set(j.dangerousExtras)].filter((e) => e >= 0 && e < predCount && !p.has(e));
  return { judgement: { pairs, dangerousExtras: extras }, dropped: j.pairs.length - pairs.length + (j.dangerousExtras.length - extras.length) };
}

export function score(gold: Claim[], pred: Claim[], j: Judgement): Score {
  validateJudgement(gold.length, pred.length, j);
  const count = (v: Verdict) => j.pairs.filter((p) => p.verdict === v).length;
  return {
    gold: gold.length,
    pred: pred.length,
    matched: j.pairs.length,
    same: count("same"),
    wording: count("wording"),
    missed: gold.length - j.pairs.length,
    extra: pred.length - j.pairs.length,
    dangerous: count("dangerous") + j.dangerousExtras.length,
  };
}

export function sumScores(scores: Score[]): Score {
  const zero: Score = { gold: 0, pred: 0, matched: 0, same: 0, wording: 0, missed: 0, extra: 0, dangerous: 0 };
  return scores.reduce((a, s) => {
    for (const k of Object.keys(zero) as (keyof Score)[]) a[k] += s[k];
    return a;
  }, zero);
}

/** 評価データの 1 項目（do・dont・why の並び）を Claim の並びにする */
export function claimsFromItem(item: { do: { text: string; span?: string }[]; dont: { text: string; span?: string }[]; why: { text: string; span?: string }[] }): Claim[] {
  return (["do", "dont", "why"] as const).flatMap((kind) => item[kind].map((c) => ({ kind, text: c.text, span: c.span })));
}
