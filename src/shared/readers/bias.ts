// 決めつけの言い回しの検査（027）。出身や母語から、読み手の考え方・性格・力を推し量る言い回しを見つける。
// 設定表と、読み手に渡す指示の型の両方にかける。見つかったら検査が落ちる。

const PEOPLE = "(?:人|国民|出身者|出身の人|民族|系)";
export const BIAS_PATTERNS: { why: string; re: RegExp }[] = [
  { why: "「〜の人は〜しがち／傾向／やすい」", re: new RegExp(`${PEOPLE}(?:は|って|には)[^。\\n]{0,30}(?:しがち|がち|傾向|やすい|にくい|苦手|得意|多い|少ない|ものだ|はずだ|らしい)`) },
  { why: "国民性・気質・お国柄", re: /国民性|気質|お国柄|民族性|県民性|国柄/ },
  { why: "「〜人らしい／〜人っぽい」", re: /人(?:らしく|らしい|っぽい|ならでは)/ },
  { why: "一般化（一般的に・たいてい・みんな〜）", re: new RegExp(`(?:一般的に|たいてい|大抵|概して|総じて|みんな|誰でも)[^。\\n]{0,20}${PEOPLE}`) },
  { why: "性格・態度の決めつけ", re: /(?:真面目|まじめ|勤勉|怠け|おおらか|時間にルーズ|几帳面|素直|従順|わがまま|おとなしい|陽気|内気)/ },
  { why: "英語の一般化", re: /\b(?:tend to|tends to|are (?:usually|typically|generally)|typically|stereotyp\w*|national character)\b/i },
];

export function findBias(text: string): { why: string; hit: string }[] {
  const out: { why: string; hit: string }[] = [];
  for (const { why, re } of BIAS_PATTERNS) {
    const m = text.match(re);
    if (m) out.push({ why, hit: m[0] });
  }
  return out;
}
