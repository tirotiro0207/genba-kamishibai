// やさしい日本語のふりがな（11/6 作者「漢字が混ざる場合はフリガナを入れる」。決まりは docs/yasashii-nihongo.md）。
// 書き方は「｜漢字《よみ》」。｜を省いたときは、《 の直前に続く漢字だけを親の字にする。
// 画面はこれを <ruby> で出し、文を作る AI の答えは「ふりがなの無い漢字が無いか」を確かめる
export type RubySeg = { text: string; ruby?: string };

const HAN = /[\p{Script=Han}々〆ヵヶ]/u;
const MARK = /｜([^｜《》]+)《([^《》]+)》|([\p{Script=Han}々〆ヵヶ]+)《([^《》]+)》/gu;

/** 文を、ふりがなの付いた字と付いていない字の並びに分ける */
export function rubySegments(s: string): RubySeg[] {
  const out: RubySeg[] = [];
  let last = 0;
  for (const m of s.matchAll(MARK)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ text: m[1] ?? m[3], ruby: m[2] ?? m[4] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/** ふりがなを外した文（訳や数字の確かめに使う） */
export const rubyBase = (s: string) => rubySegments(s).map((x) => x.text).join("");

/** ふりがなを（ ）にした文（印刷の写しや、ruby を出せない所に） */
export const rubyParen = (s: string) => rubySegments(s).map((x) => (x.ruby ? `${x.text}（${x.ruby}）` : x.text)).join("");

/** ふりがなの付いていない漢字（重ねない） */
export function bareKanji(s: string): string[] {
  const found = rubySegments(s)
    .filter((x) => !x.ruby)
    .flatMap((x) => [...x.text].filter((ch) => HAN.test(ch)));
  return [...new Set(found)];
}
