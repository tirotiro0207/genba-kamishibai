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

/** 画面に並べる時計の組。項目ごとにカードと文の 2 つ */
export interface ClockRow {
  item: "A" | "B";
  card: ClockSide;
  text: ClockSide;
}

/** 交差の回の結果の 1 つの欄（/summary の Cell のうち、時計に要る分） */
export interface ClockCell {
  item: "A" | "B";
  shown: Shown;
  n: number;
  median_ms: number | null;
}

/**
 * 交差の回は項目ごとに 1 行（カードと文の 2 つ）にする。A と B は別の素材で、/summary が持つのは欄ごとの中央値だけ。
 * 2 項目を混ぜた中央値は欄の中央値から作れず、混ぜると素材の難しさも混ざるため
 */
export function crossClockRows(cells: ClockCell[]): ClockRow[] {
  const side = (item: "A" | "B", shown: Shown): ClockSide => {
    const c = cells.find((x) => x.item === item && x.shown === shown);
    return { n: c?.n ?? 0, median_ms: c?.median_ms ?? null };
  };
  return (["A", "B"] as const).map((item) => ({ item, card: side(item, "card"), text: side(item, "text") }));
}

/** 答えが 1 件も無い（仮の数字を出す）か */
export const noAnswers = (cells: ClockCell[]) => cells.every((c) => c.n === 0);

/** 仮の数字（本物の結果が入るまで）。画面に「仮の数字」と出す */
export const FAKE_CLOCKS: Clocks = { card: { n: 10, median_ms: 4200 }, text: { n: 10, median_ms: 13800 }, fake: true };
