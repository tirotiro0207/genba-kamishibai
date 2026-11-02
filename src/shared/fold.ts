// 折りたたみ（081・仕様 §6・§8 折りたたんだ量）。元のページの文字数を空白を除いて数える。
// 画面とスクリプトが同じ数え方を使う。返すのは数と行の長さだけで、中身の文字は返さない。

/** 空白（全角の空白・改行を含む）を除いた字数 */
export const countChars = (s: string) => s.replace(/\s/g, "").length;

export interface FoldPage {
  /** 資料の名前とページ。話した言葉は doc を "speech" にする */
  doc: string;
  page: number;
  chars: number;
  /** 行ごとの字数（紙に灰色の線を描くためだけ。中身は持たない） */
  bars: number[];
}

export function foldPage(doc: string, page: number, lines: string[]): FoldPage {
  const bars = lines.map(countChars);
  return { doc, page, chars: bars.reduce((a, b) => a + b, 0), bars };
}

export const foldTotal = (pages: FoldPage[]) => pages.reduce((a, p) => a + p.chars, 0);
