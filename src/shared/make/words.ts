// 「言葉」の欄（036）。カードの守ること・なぜを、やさしい日本語とベトナム語の短い文にする。
// あわせて、カードに出る現場の言葉を、日本語とベトナム語の組で返させ、テナントの用語表に積む（人が確かめる前提）。
// 元の文に無いことは足さない。カードの文に無い数字が出たら、その中身を渡して 1 回だけ書き直させる。
// やさしい日本語は docs/yasashii-nihongo.md の決まり（国のガイドラインの 3 つのステップ）に合わせる（11/6 作者「今後もルールを統一」）。
// 残した漢字には「｜漢字《よみ》」でふりがなを付けさせ、ふりがなの無い漢字が残ったら 1 回だけ書き直させる
import type Anthropic from "@anthropic-ai/sdk";
import type { CardBody } from "../card";
import { type GuardedDeps, guardedCall, type Purpose } from "../claude";
import { bareKanji, rubyBase } from "../ruby";

export const WORDS_MODEL = "claude-opus-5-5";

const SYSTEM = `あなたは、工事の現場で働くベトナム人の新入社員に向けて、安全のカードの「言葉」の欄を書く係です。
渡すのは、カードの文（守ること・なぜ）です。

書くもの:
1. ja: やさしい日本語。守ること → なぜ の順に、短い文 2〜4 つ（作り方は下の「やさしい日本語の決まり」）
2. vi: ja と同じ中身のベトナム語。現場で通じる言い方にする。ふりがなは書かない
3. terms: カードに出る現場の言葉（道具・場所・作業の名前）を、日本語とベトナム語の組で。3〜6 個

決まり:
- カードの文に無いことは足さない。数字・条件・例外は、カードの文にあるものだけをそのまま使う
- 守ることを和らげない（「なるべく」「できれば」を足さない）。禁止は禁止のまま書く

やさしい日本語の決まり（出入国在留管理庁・文化庁「在留支援のためのやさしい日本語ガイドライン」に合わせる）:
ステップ 1 文を整理する
- 1 文で言うことは 1 つだけ。3 つ以上のことは文を分ける
- 回りくどい言い方や繰り返しはしない。カタカナの言葉は、ほかに言い方が無いときだけ
ステップ 2 言葉をやさしくする
- 難しい言葉・専門の言葉は使わない。漢語より和語（例: 防止する → ふせぐ、携帯する → もつ）。略した言葉は使わない
- 二重否定は使わない（「〜ずに〜してはいけません」ではなく「かならず〜してください」）。受け身と「〜させる」はなるべく使わない
- ぼかす言い方（かもしれない・おそれ）はしない。文の終わりは「です」「ます」。尊敬語・謙譲語は使わない
- 指示は「〜してください」。「〜しましょう」は使わない。禁止は「〜してはいけません」
- 現場で目にする大事な言葉（道具・危険の名前。例: 検電器、感電）は漢字のまま残し、すぐあとの文で短く説明する。それ以外はひらがなにする
- 残した漢字には、すべてふりがなを付ける。書き方は「｜漢字《よみ》」（例: ｜検電器《けんでんき》を　かならず　もって　しごとを　してください。）
- ひらがなが続くところは、言葉の切れ目に全角のあきを入れる`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ja", "vi", "terms"],
  properties: {
    ja: { type: "string" },
    vi: { type: "string" },
    terms: { type: "array", items: { type: "object", additionalProperties: false, required: ["ja", "vi"], properties: { ja: { type: "string" }, vi: { type: "string" } } } },
  },
} as const;

export function wordsParams(card: CardBody, fix?: string): Anthropic.MessageCreateParamsNonStreaming {
  const lines = card.statements.map((s) => `${s.field === "rule" ? "守ること" : "なぜ"}: ${s.text}`).join("\n");
  return {
    model: WORDS_MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `カードの文:\n${lines}${fix ? `\n\n前の答えを直してください: ${fix}` : ""}` }],
  } as Anthropic.MessageCreateParamsNonStreaming;
}

export interface Term {
  ja: string;
  vi: string;
}

const nfkc = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");
const NUMBER = /\d+(?:[.,]\d+)?/g;

/** 小数点と位取りの印を外した数字（ベトナム語は小数点が「,」で位取りが「.」なので、0,1 と 0.1 を同じに見る） */
const digits = (n: string) => n.replace(/[.,]/g, "");

/** 言葉の欄に、カードの文に無い数字があればその数字 */
export function addedNumbers(card: CardBody, words: { ja: string; vi: string }): string[] {
  const src = nfkc(card.statements.map((s) => s.text).join("\n"));
  const srcDigits = new Set((src.match(NUMBER) ?? []).map(digits));
  return [...new Set([...(nfkc(rubyBase(words.ja)).match(NUMBER) ?? []), ...(nfkc(words.vi).match(NUMBER) ?? [])])].filter((n) => !src.includes(n) && !srcDigits.has(digits(n)));
}

export interface Words {
  words: { ja: string; vi: string };
  terms: Term[];
  messages: Anthropic.Message[];
}

export async function makeWords(deps: GuardedDeps, purpose: Purpose, card: CardBody): Promise<Words> {
  const messages: Anthropic.Message[] = [];
  let fix: string | undefined;
  for (let i = 0; i < 2; i++) {
    const msg = await guardedCall(deps, { purpose, label: "言葉の欄", params: wordsParams(card, fix) });
    messages.push(msg);
    if (msg.stop_reason !== "end_turn") throw new Error(`言葉の欄が最後まで返らなかった: ${msg.stop_reason}`);
    const out = JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as { ja: string; vi: string; terms: Term[] };
    const words = { ja: out.ja.trim(), vi: out.vi.trim() };
    const terms = (out.terms ?? []).map((t) => ({ ja: t.ja.trim(), vi: t.vi.trim() })).filter((t) => t.ja && t.vi);
    const added = addedNumbers(card, words);
    const bare = bareKanji(words.ja);
    if (words.ja && words.vi && !added.length && !bare.length) return { words, terms, messages };
    fix = added.length
      ? `カードの文に無い数字 ${added.map((n) => `「${n}」`).join("")}を消す`
      : bare.length
        ? `ふりがなの無い漢字 ${bare.map((k) => `「${k}」`).join("")}に「｜漢字《よみ》」でふりがなを付けるか、ひらがなにする`
        : "ja と vi を空にしない";
  }
  throw new Error(`言葉の欄が 2 回とも決まりに合わない: ${fix}`);
}
