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

export type Pair = Judgement["pairs"][number];

/** 直した理由: 番号が範囲の外 / 同じものを 2 回 / 危ない取り出しすぎの番号が正しくない（範囲の外か、もう組になっている答え） */
export type RepairReason = "out_of_range" | "duplicate" | "bad_dangerous_extra";

/** 直し 1 件。before は落とした組（危ない取り出しすぎなら答えの番号）、after は残した組（落としただけなら null） */
export interface Repair {
  reason: RepairReason;
  before: Pair | { dangerousExtra: number };
  after: Pair | null;
}

/**
 * AI の判定の崩れを直す。範囲の外の番号と、2 回目以降に同じものを組にした組を落とす（最初の組を残す）。
 * 落とした数と、1 件ずつの中身（何を・なぜ・何が残ったか）を返し、採点の記録に残す。
 */
export function repairJudgement(goldCount: number, predCount: number, j: Judgement): { judgement: Judgement; dropped: number; repairs: Repair[] } {
  const byGold = new Map<number, Pair>();
  const byPred = new Map<number, Pair>();
  const repairs: Repair[] = [];
  const pairs = j.pairs.filter((pair) => {
    if (!(pair.gold >= 0 && pair.gold < goldCount && pair.pred >= 0 && pair.pred < predCount)) {
      repairs.push({ reason: "out_of_range", before: pair, after: null });
      return false;
    }
    const kept = byGold.get(pair.gold) ?? byPred.get(pair.pred);
    if (kept) {
      repairs.push({ reason: "duplicate", before: pair, after: kept });
      return false;
    }
    byGold.set(pair.gold, pair);
    byPred.set(pair.pred, pair);
    return true;
  });
  const seen = new Set<number>();
  const extras = j.dangerousExtras.filter((e) => {
    const bad = !(e >= 0 && e < predCount) || byPred.has(e) || seen.has(e);
    if (bad) repairs.push({ reason: seen.has(e) ? "duplicate" : "bad_dangerous_extra", before: { dangerousExtra: e }, after: byPred.get(e) ?? null });
    seen.add(e);
    return !bad;
  });
  return { judgement: { pairs, dangerousExtras: extras }, dropped: repairs.length, repairs };
}

/**
 * 直す前の判定のままなら、この数（採点は止めない）。組は 2 回目の組も数える。漏れと取り出しすぎは、組に 1 回でも出た正解・答えを除いて数える。
 * 番号が範囲の外の組と危ない取り出しすぎは、どの正解・答えか分からないので数えられない（uncountable）
 */
export interface ScoreBefore {
  matched: number;
  missed: number;
  extra: number;
  dangerous: number;
  uncountable: number;
}

export function scoreBefore(goldCount: number, predCount: number, j: Judgement): ScoreBefore {
  const ok = j.pairs.filter((x) => x.gold >= 0 && x.gold < goldCount && x.pred >= 0 && x.pred < predCount);
  const extrasOk = j.dangerousExtras.filter((e) => e >= 0 && e < predCount);
  return {
    matched: ok.length,
    missed: goldCount - new Set(ok.map((x) => x.gold)).size,
    extra: predCount - new Set(ok.map((x) => x.pred)).size,
    dangerous: ok.filter((x) => x.verdict === "dangerous").length + extrasOk.length,
    uncountable: j.pairs.length - ok.length + (j.dangerousExtras.length - extrasOk.length),
  };
}

export function sumBefore(xs: ScoreBefore[]): ScoreBefore {
  return xs.reduce((a, x) => ({ matched: a.matched + x.matched, missed: a.missed + x.missed, extra: a.extra + x.extra, dangerous: a.dangerous + x.dangerous, uncountable: a.uncountable + x.uncountable }), {
    matched: 0,
    missed: 0,
    extra: 0,
    dangerous: 0,
    uncountable: 0,
  });
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
