// 読み手パネルの設定表（027）。読み手は事実の欄だけで決める（出身・母語・日本語の力・学歴・来日と現場の経験）。
// 性格や「その国の人は〜」のような言い回しの欄は持たない。決めつけの言い回しは bias.ts の検査で落とす。

export const ORIGINS = ["ベトナム", "ミャンマー", "カンボジア", "ネパール", "インドネシア", "フィリピン", "日本"] as const;
export type Origin = (typeof ORIGINS)[number];

export const LANGUAGE_OF: Record<Origin, string> = {
  ベトナム: "ベトナム語",
  ミャンマー: "ビルマ語",
  カンボジア: "クメール語",
  ネパール: "ネパール語",
  インドネシア: "インドネシア語",
  フィリピン: "フィリピノ語",
  日本: "日本語",
};

/** 日本語の文字を読む力。上から読める順 */
export const JA_LEVELS = ["母語", "N3", "N4", "N5", "ひらがな・カタカナだけ", "日本語の文字はほとんど読めない"] as const;
export type JaLevel = (typeof JA_LEVELS)[number];

export const EDUCATION = ["中学校", "高校", "職業訓練校", "専門学校・短大", "大学"] as const;
export type Education = (typeof EDUCATION)[number];

export interface Reader {
  id: string;
  origin: Origin;
  language: string;
  ja: JaLevel;
  education: Education;
  /** 日本に来てからの月数（日本出身は 0） */
  monthsInJapan: number;
  /** 電気工事の現場で働いた月数（母国と日本の合計） */
  siteMonths: number;
}

/** 設定表で使ってよい欄。これ以外の欄（性格・好みなど）は検査で落とす */
export const READER_KEYS = ["id", "origin", "language", "ja", "education", "monthsInJapan", "siteMonths"] as const;

type Row = [Origin, JaLevel, Education, number, number];
const ROWS: Row[] = [
  // ベトナム（一番多い）
  ["ベトナム", "N3", "大学", 14, 10],
  ["ベトナム", "N3", "専門学校・短大", 26, 24],
  ["ベトナム", "N4", "高校", 6, 0],
  ["ベトナム", "N4", "職業訓練校", 3, 18],
  ["ベトナム", "N4", "大学", 1, 0],
  ["ベトナム", "N5", "高校", 2, 6],
  ["ベトナム", "N5", "中学校", 0, 30],
  ["ベトナム", "ひらがな・カタカナだけ", "高校", 0, 0],
  ["ベトナム", "日本語の文字はほとんど読めない", "中学校", 0, 12],
  // ミャンマー
  ["ミャンマー", "N3", "大学", 18, 6],
  ["ミャンマー", "N5", "高校", 1, 0],
  ["ミャンマー", "日本語の文字はほとんど読めない", "中学校", 0, 24],
  // カンボジア
  ["カンボジア", "N4", "職業訓練校", 4, 12],
  ["カンボジア", "ひらがな・カタカナだけ", "中学校", 0, 0],
  // ネパール
  ["ネパール", "N4", "高校", 8, 0],
  ["ネパール", "日本語の文字はほとんど読めない", "高校", 0, 36],
  // インドネシア
  ["インドネシア", "N3", "専門学校・短大", 20, 14],
  ["インドネシア", "N5", "職業訓練校", 2, 8],
  ["インドネシア", "ひらがな・カタカナだけ", "高校", 0, 0],
  // フィリピン
  ["フィリピン", "N4", "大学", 10, 0],
  ["フィリピン", "N5", "職業訓練校", 1, 20],
  ["フィリピン", "日本語の文字はほとんど読めない", "高校", 0, 4],
  // 日本（比べるための新入社員。日本語は母語）
  ["日本", "母語", "高校", 0, 0],
  ["日本", "母語", "職業訓練校", 0, 6],
];

export const READERS: Reader[] = ROWS.map(([origin, ja, education, monthsInJapan, siteMonths], i) => ({
  id: `R${String(i + 1).padStart(2, "0")}`,
  origin,
  language: LANGUAGE_OF[origin],
  ja,
  education,
  monthsInJapan: origin === "日本" ? 0 : monthsInJapan,
  siteMonths,
}));

/** 指示に入れる設定の文。事実を並べるだけで、そこから何かを推し量る言葉は足さない */
export function describeReader(r: Reader): string {
  const months = (n: number) => (n === 0 ? "なし" : n < 12 ? `${n} か月` : `${Math.floor(n / 12)} 年${n % 12 ? ` ${n % 12} か月` : ""}`);
  return [
    `- 出身: ${r.origin}`,
    `- 母語: ${r.language}`,
    `- 日本語の文字を読む力: ${r.ja}`,
    `- 最後に出た学校: ${r.education}`,
    `- 日本に来てから: ${r.origin === "日本" ? "日本で生まれ育った" : months(r.monthsInJapan)}`,
    `- 電気工事の現場で働いた期間: ${months(r.siteMonths)}`,
  ].join("\n");
}
