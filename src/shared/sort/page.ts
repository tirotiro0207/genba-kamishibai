// 夜間の仕分けの 1 ページ分（022 の試作。指示の中身は 024 で書く）。1 ページの文を見て「カードにする／しない」と理由を返す。
// 会期前に作った見込みの一覧は渡さない。ページの文だけを渡す。

export interface SortResult {
  card: boolean;
  reason: string;
}

export const SORT_SYSTEM = `あなたは電気工事会社の新入社員向けの「現場の紙芝居」（文字の無い絵のカード）を作る前の仕分け役です。
渡されるのは、会社の資料の 1 ページ分の文です。
このページに「作業員が守る決まり」（〜する・〜しない、と行動で言えるもの）があるかを見て、カードにするか、しないかを決めます。
- 目次・表紙・まえがき・用語の説明・連絡先だけのページは、カードにしない
- 決まりが 1 つでもあれば、カードにする
答えは次の JSON だけを、ほかの文を付けずに返してください。
{"card": true か false, "reason": "理由を日本語で 1〜2 文。決まりがあるなら、その決まりを短く言う"}`;

/** 答えの文から JSON を取り出す。前後に文や \`\`\` が付いていても読む */
export function parseSort(text: string): SortResult {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("仕分けの答えに JSON が無い");
  const o = JSON.parse(m[0]) as { card?: unknown; reason?: unknown };
  if (typeof o.card !== "boolean" || typeof o.reason !== "string" || !o.reason.trim()) throw new Error("仕分けの答えの形が違う（card は true/false、reason は文）");
  return { card: o.card, reason: o.reason.trim() };
}
