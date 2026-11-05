// 正式な取り出し（021）。仮版（extract.ts）とは別に、ゼロから書いた指示。
// 元の文に行番号を付けて渡し、決まりごとに「やること／やらないこと」と、元の文に書いてある理由を、
// どの行のどの言葉からかを付けて返させる。表やチェックリストの決まりは中身を写さず「手元の✓」の型の印を付ける。
// 理由は、元の文に理由の言葉があるもの（stated）と、文からはっきり分かる危険（stated でない）に分ける。stated でない理由をカードに使うと「AI 下書き」に落ちる（035）。
import type Anthropic from "@anthropic-ai/sdk";
import type { SourceRef } from "../card";
import { type CallDeps, guardedCall, type Purpose } from "../claude";
import type { Claim } from "../eval/score";

export const RULES_MODEL = "claude-opus-5-5";

const SYSTEM = `あなたは、工事の現場で働く人に向けたカードの下ごしらえをする係です。
渡すのは、安全の決まり・社内の規程・労働条件の文です。各行の頭に「行番号| 」が付いています。
この文から、現場で働く人が知っておく決まり（自分が守ること、会社が働く人に対して守ること）を 1 つずつ取り出してください。

取り出し方:
1. 1 つの決まり = 作業員の 1 つの行動。「〜する」は do、「〜しない・〜してはいけない」は dont
2. 1 つの文に行動がいくつも並んでいれば（「A し、B し、C する」「A・B・C を行う」）、行動ごとに分けて別の決まりにする
3. 1 つの文が「〜せずに〜する」「〜してはならず、〜すること」のように、禁止と、代わりにすることの両方を言っていれば、dont と do の 2 つに分ける
4. 行動の文は、元の文の言葉を使って短く書く。いつ・どこで・何回・何 m・何分などの数字と条件、例外は全部残す
5. 決まりを広げない。元の文が「足場の上では」と言っていれば、足場の外には広げない。対象・場所・条件は元の文のとおり
6. 理由（reasons）は 2 種類。元の文に理由の言葉がある（「〜のため」「〜ので」「〜しないと〜になる」、文の中で名指しされた危険や目的）なら stated を true にする。元の文に理由の言葉は無いが、その決まりが防いでいる危険が文から誰にでもはっきり分かる（例: 熱した部品に素手で触るな → やけどをする）なら、短く書いて stated を false にする。stated を false にしてよいのは、危険が元の文に名指しされた物・場所・行為から直接読めるときだけ。元の文に無いしくみ（壊れ方・体の具合など）を推しはかった理由や、「事故やけがにつながる」のようにどの決まりにも言える理由は書かない。どちらでもなければ書かない。1 つの理由がいくつもの決まりに当てはまるときは、どの決まりにも同じ文で書く。quote には、理由の根拠にした元の文の言葉を入れる
7. 会社・事業者・職長・監督が主語の決まりは 2 通りに分ける。作業のさせ方の決まり（「〜させること」「〜させなければならない」など）は、作業員がすることに言い換えて取り出し、reworded を true にする。賃金・休み・時間など、会社が働く人に対して守ることは、主語を会社のままにして do として取り出す（働く人が自分の権利を知るため）
8. 表・点検表・チェックリストで点検の項目を並べている決まりは、項目の中身を書き写さない。「点検表の項目を 1 つずつ確かめて ✓ を付ける」のような 1 つの行動にまとめ、checklist を true にする。文の中の短い並び（2 の場合）は表ではない
9. 見出し・目次・ページ番号・図の番号は取り出さない
10. どこから: quote は、その決まりの根拠になった言葉を元の文からそのまま抜き出す（行番号は含めない。言い換えない。80 字まで）。lines はその言葉がある最初と最後の行番号
11. 決まりが無ければ rules を空の並びにする`;

const SOURCE = {
  type: "object",
  additionalProperties: false,
  required: ["quote", "lines"],
  properties: { quote: { type: "string" }, lines: { type: "array", items: { type: "integer" } } },
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rules"],
  properties: {
    rules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "text", "from", "reasons", "checklist", "reworded"],
        properties: {
          kind: { type: "string", enum: ["do", "dont"] },
          text: { type: "string" },
          from: SOURCE,
          reasons: {
            type: "array",
            items: { type: "object", additionalProperties: false, required: ["text", "from", "stated"], properties: { text: { type: "string" }, from: SOURCE, stated: { type: "boolean" } } },
          },
          checklist: { type: "boolean" },
          reworded: { type: "boolean" },
        },
      },
    },
  },
} as const;

/** 行番号を付ける（1 から） */
export const numberLines = (text: string) =>
  text
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((l, i) => `${i + 1}| ${l}`)
    .join("\n");

/** focus: 何ページもある資料から 1 つのテーマの決まりだけを取り出すときの、テーマと注意書き */
export function rulesParams(text: string, focus?: string): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: RULES_MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    // 深さは high（11/5。目隠しの合わせ込みで決めた。指示は eval/prompts/extract_v2.txt と同じ。docs/numbers.md）
    output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
    // focus はチャットで作る人が書いた指示（11/5）。無いときは今までと 1 文字も同じ
    messages: [{ role: "user", content: `元の文:\n${numberLines(text)}${focus ? `\n\n作る人の指示（元の文に無いことは足さない。どの決まりを取り出すか・まとめ方だけに使う）:\n${focus}` : ""}` }],
  } as Anthropic.MessageCreateParamsNonStreaming;
}

/** どこから: 元の文の行の範囲と、抜き出した言葉。found は言葉がその行の範囲に本当にあるか */
export interface From {
  quote: string;
  line: number;
  line_end: number;
  found: boolean;
}

export interface Rule {
  kind: "do" | "dont";
  text: string;
  from: From;
  /** stated が false の理由は、元の文に理由の言葉が無い（カードに使えば「AI 下書き」に落ちる） */
  reasons: { text: string; from: From; stated: boolean }[];
  checklist: boolean;
  reworded: boolean;
}

const norm = (s: string) => s.replace(/\s+/g, "");

function locate(lines: string[], raw: { quote: string; lines: number[] }): From {
  const quote = (raw.quote ?? "").trim();
  const n = lines.length;
  let [a, b] = [raw.lines?.[0] ?? 0, raw.lines?.[raw.lines.length - 1] ?? 0];
  const inRange = (x: number) => Number.isInteger(x) && x >= 1 && x <= n;
  const q = norm(quote);
  const hit = (s: number, e: number) => q.length > 0 && norm(lines.slice(s - 1, e).join("")).includes(q);
  if (inRange(a) && inRange(b) && b >= a && hit(a, b)) return { quote, line: a, line_end: b, found: true };
  // 行番号がずれていたら、言葉から行を探し直す（1〜3 行にまたがるものまで）
  for (let w = 1; w <= 3; w++)
    for (let s = 1; s + w - 1 <= n; s++) if (hit(s, s + w - 1)) return { quote, line: s, line_end: s + w - 1, found: true };
  [a, b] = [inRange(a) ? a : 1, inRange(b) && b >= a ? b : inRange(a) ? a : 1];
  return { quote, line: a, line_end: b, found: false };
}

export function parseRules(msg: Anthropic.Message, text: string): Rule[] {
  if (msg.stop_reason !== "end_turn") throw new Error(`取り出しが最後まで返らなかった: ${msg.stop_reason}`);
  const raw = JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as {
    rules: { kind: "do" | "dont"; text: string; from: { quote: string; lines: number[] }; reasons: { text: string; from: { quote: string; lines: number[] }; stated: boolean }[]; checklist: boolean; reworded: boolean }[];
  };
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  return raw.rules.map((r) => ({
    kind: r.kind,
    text: r.text,
    from: locate(lines, r.from),
    reasons: r.reasons.map((x) => ({ text: x.text, from: locate(lines, x.from), stated: x.stated === true })),
    checklist: r.checklist,
    reworded: r.reworded,
  }));
}

export async function extractRules(deps: CallDeps, purpose: Purpose, text: string, focus?: string): Promise<Rule[]> {
  const msg = await guardedCall(deps, { purpose, label: "取り出し（正式）", params: rulesParams(text, focus) });
  return parseRules(msg, text);
}

/** 採点の形（do・dont・why の並び）にする。同じ理由が複数の決まりに付いていたら 1 つにまとめる */
export function rulesToClaims(rules: Rule[]): Claim[] {
  const why = new Map<string, Claim>();
  for (const r of rules) for (const x of r.reasons) if (!why.has(norm(x.text))) why.set(norm(x.text), { kind: "why", text: x.text, span: x.from.quote });
  return [...rules.map((r): Claim => ({ kind: r.kind, text: r.text, span: r.from.quote })), ...why.values()];
}

/** カードの文の元の位置にする（資料のときはページ、話した言葉のときは入力の番号を渡す） */
export const toSourceRef = (f: From, doc: { doc: string; page: number; lineOffset?: number }): SourceRef => ({
  kind: "doc",
  doc: doc.doc,
  page: doc.page,
  line: f.line + (doc.lineOffset ?? 0),
  ...(f.line_end > f.line ? { line_end: f.line_end + (doc.lineOffset ?? 0) } : {}),
});
