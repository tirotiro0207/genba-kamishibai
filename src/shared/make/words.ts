// 「言葉」の欄（036）。カードの守ること・なぜを、やさしい日本語とベトナム語の短い文にする。
// あわせて、カードに出る現場の言葉を、日本語とベトナム語の組で返させ、テナントの用語表に積む（人が確かめる前提）。
// 元の文に無いことは足さない。カードの文に無い数字が出たら、その中身を渡して 1 回だけ書き直させる。
import type Anthropic from "@anthropic-ai/sdk";
import type { CardBody } from "../card";
import { type GuardedDeps, guardedCall, type Purpose } from "../claude";

export const WORDS_MODEL = "claude-opus-5-5";

const SYSTEM = `あなたは、工事の現場で働くベトナム人の新入社員に向けて、安全のカードの「言葉」の欄を書く係です。
渡すのは、カードの文（守ること・なぜ）です。

書くもの:
1. ja: やさしい日本語。守ること → なぜ の順に、短い文 2〜3 つ。漢字は少なめ、1 文は 25 字くらいまで
2. vi: ja と同じ中身のベトナム語。現場で通じる言い方にする
3. terms: カードに出る現場の言葉（道具・場所・作業の名前）を、日本語とベトナム語の組で。3〜6 個

決まり:
- カードの文に無いことは足さない。数字・条件・例外は、カードの文にあるものだけをそのまま使う
- 守ることを和らげない（「なるべく」「できれば」を足さない）。禁止は禁止のまま書く`;

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
  return [...new Set([...(nfkc(words.ja).match(NUMBER) ?? []), ...(nfkc(words.vi).match(NUMBER) ?? [])])].filter((n) => !src.includes(n) && !srcDigits.has(digits(n)));
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
    if (words.ja && words.vi && !added.length) return { words, terms, messages };
    fix = added.length ? `カードの文に無い数字 ${added.map((n) => `「${n}」`).join("")}を消す` : "ja と vi を空にしない";
  }
  throw new Error(`言葉の欄が 2 回とも決まりに合わない: ${fix}`);
}
