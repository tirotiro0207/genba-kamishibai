// 答えの欄を 2 つにする（11/5 作者）。上は日本語の欄、下は自分の言葉で書く補足の欄（母語でよい・書かなくてもよい）。
// 表は変えず、今ある answer の列に 2 つを JSON で入れる。前からの答え（ただの文）は日本語の欄として読む
export interface AnswerFields {
  ja: string;
  own: string;
}

/** answer の列に入れる長さの上限（2 つの欄を JSON にした長さ） */
/**
 * 採点で日本語の訳が要る答えか（11/7 作者「母語で書いたところは全部訳を入れて」）。母語の欄に何かあれば要る。
 * 日本語の欄でも、ラテン文字（ベトナム語・英語・インドネシア語など）やタイ・ミャンマー・クメールなどの字が混ざっていれば要る
 */
const FOREIGN_RE = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF\u0E00-\u0FFF\u1000-\u109F\u1780-\u17FF\u0900-\u097F\u0980-\u09FF]/;
export const needsJapanese = (a: AnswerFields) => !!a.own.trim() || FOREIGN_RE.test(a.ja);

export const ANSWER_MAX = 2000;
/** 1 つの欄に書ける長さ（2 つとも書き切っても、JSON にして ANSWER_MAX に収まる目安。画面の maxLength に使う） */
export const ANSWER_FIELD_MAX = 900;

export const packAnswer = (f: AnswerFields): string => JSON.stringify({ ja: f.ja.trim(), own: f.own.trim() });

/** どちらか 1 つが書けていれば送れる */
export const canSend = (f: AnswerFields) => !!(f.ja.trim() || f.own.trim());

/** 2 つの欄の JSON か（前からのただの文ではないか） */
function parsePacked(s: string): AnswerFields | null {
  if (!s.startsWith("{")) return null;
  try {
    const o = JSON.parse(s) as Partial<AnswerFields>;
    if (typeof o.ja === "string" && typeof o.own === "string") return { ja: o.ja, own: o.own };
  } catch {
    // ただの文として読む
  }
  return null;
}

export function unpackAnswer(s: string | null | undefined): AnswerFields | null {
  if (s === null || s === undefined) return null;
  return parsePacked(s) ?? { ja: s, own: "" };
}

/**
 * 送られた答えを列の長さに収める。JSON のまま途中で切ると読めなくなり、日本語の欄に生の JSON が出るので、
 * 2 つの欄の JSON なら、欄ごとに長いほうから切ってから JSON にし直す。ただの文は頭から切る
 */
export function fitAnswer(s: string, max = ANSWER_MAX): string {
  if (s.length <= max) return s;
  const f = parsePacked(s);
  if (!f) return [...s].slice(0, max).join("");
  let ja = [...f.ja.trim()];
  let own = [...f.own.trim()];
  for (let packed = packAnswer(f); packed.length > max; packed = packAnswer({ ja: ja.join(""), own: own.join("") })) {
    const over = packed.length - max;
    if (ja.length >= own.length) ja = ja.slice(0, Math.max(0, ja.length - over));
    else own = own.slice(0, Math.max(0, own.length - over));
  }
  return packAnswer({ ja: ja.join(""), own: own.join("") });
}
