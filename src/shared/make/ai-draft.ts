// 「AI 下書き」の判定（035）。元の文に無い理由（ai の印の文）か、元の文に無い数字を書いたカードは、
// 人が確かめるまで「AI 下書き」の状態に落とす。数字は全角と半角をそろえ、元の文の抜き出しと突き合わせる。
import type { CardBody } from "../card";

const nfkc = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");
const NUMBER = /\d+(?:[.,]\d+)?/g;

/** origins: このカードの元にした元の文の言葉（決まりと理由の抜き出し）。無ければ数字は調べない */
export function aiDraftReasons(card: CardBody, origins?: string[]): string[] {
  const out: string[] = [];
  for (const s of card.statements) if (s.ai) out.push(`${s.id} の${s.field === "rule" ? "守ること" : "理由"}は元の文に無い（AI が書いた）`);
  if (origins) {
    const src = nfkc(origins.join("\n"));
    for (const s of card.statements) {
      if (s.ai) continue;
      const missing = [...new Set(nfkc(s.text).match(NUMBER) ?? [])].filter((n) => !src.includes(n));
      if (missing.length) out.push(`${s.id} の数字 ${missing.map((n) => `「${n}」`).join("")}が元の文に無い`);
    }
  }
  return out;
}
