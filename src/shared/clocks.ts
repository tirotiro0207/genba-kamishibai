// 時計 2 つ（095）。① 分かるまでの時間を、カード（絵）と文で比べる。どちらも中央値（真ん中の人）の秒。
// 本物の結果は現場の確認の日のあとに入る。それまでは FAKE_CLOCKS（作りものの数）で画面と動画の場面を作る

export type Shown = "card" | "text";

export interface ClockSide {
  /** 測れた人数（「分かった」で止めた答え） */
  n: number;
  /** 分かるまでの時間の中央値（ミリ秒）。測れた人がいなければ null */
  median_ms: number | null;
}

export interface Clocks {
  card: ClockSide;
  text: ClockSide;
  /** 作りものの数なら true（画面にそう出す） */
  fake: boolean;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** ① の答え（項目 A・時間のあるもの）から、カードと文の中央値を出す */
export function clockTimes(rows: { item: string; shown: Shown; ms: number | null }[]): Clocks {
  const side = (shown: Shown): ClockSide => {
    const ms = rows.filter((r) => r.item === "A" && r.shown === shown && typeof r.ms === "number" && r.ms > 0).map((r) => r.ms as number);
    return { n: ms.length, median_ms: median(ms) };
  };
  return { card: side("card"), text: side("text"), fake: false };
}

/** 作りものの数（本物の結果が入るまで）。画面に「作りもの」と出す */
export const FAKE_CLOCKS: Clocks = { card: { n: 10, median_ms: 4200 }, text: { n: 10, median_ms: 13800 }, fake: true };
