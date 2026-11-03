// 夜間の仕分けの 1 ページ分（指示は 024）。1 ページの文を見て「カードにする／しない」と理由を返す。
// 会期前に作った見込みの一覧は渡さない。ページの文だけを渡す（照合は src/shared/sort/check.ts で、仕分けのあとにする）。

export interface SortResult {
  card: boolean;
  reason: string;
}

export const SORT_SYSTEM = `あなたは電気工事会社の新入社員向けの「現場の紙芝居」（文字の無い絵のカード）を作る前の仕分け役です。
渡されるのは、会社の資料の 1 ページ分の文です。
問いは 1 つだけです: このページに「作業員が守る決まり」があるか。

決まりとは、現場の作業員が自分の行動で守るもので、「〜する」「〜しない」「〜してから〜する」と言い換えられるもの。
- カードにする: 作業の手順・禁止・確かめること・身に着けるもの・合図・異常のときの動き方が 1 つでも書いてある
- カードにしない: 目次・表紙・まえがき・用語の説明・連絡先・様式の見本だけのページ
- カードにしない: 会社や管理者のしくみの説明だけで、作業員の行動が書いていないページ
- 迷ったら、作業員がそのページを読んで明日の行動が 1 つでも変わるかで決める
ページの文は読み取りの崩れがあることがあります。崩れていても、読める範囲で決めてください。

答えは次の JSON だけを、ほかの文を付けずに返してください。
{"card": true か false, "reason": "理由を日本語で 1〜2 文。カードにするなら、その決まりを短く言う"}`;

/** 答えの文から JSON を取り出す。前後に文や \`\`\` が付いていても読む */
export function parseSort(text: string): SortResult {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("仕分けの答えに JSON が無い");
  const o = JSON.parse(m[0]) as { card?: unknown; reason?: unknown };
  if (typeof o.card !== "boolean" || typeof o.reason !== "string" || !o.reason.trim()) throw new Error("仕分けの答えの形が違う（card は true/false、reason は文）");
  return { card: o.card, reason: o.reason.trim() };
}
