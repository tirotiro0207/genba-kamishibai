// 答えの欄を 2 つにする（11/5 作者）。上は日本語の欄、下は自分の言葉で書く補足の欄（母語でよい・書かなくてもよい）。
// 表は変えず、今ある answer の列に 2 つを JSON で入れる。前からの答え（ただの文）は日本語の欄として読む
export interface AnswerFields {
  ja: string;
  own: string;
}

export const packAnswer = (f: AnswerFields): string => JSON.stringify({ ja: f.ja.trim(), own: f.own.trim() });

/** どちらか 1 つが書けていれば送れる */
export const canSend = (f: AnswerFields) => !!(f.ja.trim() || f.own.trim());

export function unpackAnswer(s: string | null | undefined): AnswerFields | null {
  if (s === null || s === undefined) return null;
  if (s.startsWith("{")) {
    try {
      const o = JSON.parse(s) as Partial<AnswerFields>;
      if (typeof o.ja === "string" && typeof o.own === "string") return { ja: o.ja, own: o.own };
    } catch {
      // ただの文として読む
    }
  }
  return { ja: s, own: "" };
}
