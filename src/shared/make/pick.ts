// 夜間の下書きで、1 ページの決まりのうちどれをカードにするかを選ぶ（063 の前の通しで足した）。
// 1 周目は先頭の 2 つを使い、計画書・教育・資格・会社の義務のような、人形の動きの絵にしにくい決まりが選ばれて 85% が赤になった。
// ページの決まりを全部渡して、決まりごとに「絵だけで伝わるか」の分けと危険の重さを返させ、絵で伝わる決まりから、重い危険・してはいけないことを先に選ぶ。
// 絵で伝わる決まりが無ければ、そのページは 2 枚に満たなくてよい。選ばなかった決まりは、分けと理由を付けて残す（人が絵以外で伝えるかを決める）。
// 指示には分けの定義だけを書き、決まりの例は入れない。最初の版は試す資料から取った例を入れていて、点が良く見えても力とは言えなかった（docs/dry-run-063.md）。
// 指示を変えたら scripts/leak-check.ts で、試す資料の言葉と 8 字続けて重ならないことを確かめる。
import type Anthropic from "@anthropic-ai/sdk";
import { type GuardedDeps, guardedCall, type Purpose } from "../claude";
import type { Rule } from "../extract/rules";

export const PICK_MODEL = "claude-opus-5-5";

export const CLASSES = ["動き", "物の名前", "書類・教育・資格", "会社の義務", "心がけ"] as const;
export type PickClass = (typeof CLASSES)[number];
export const WEIGHTS = ["高", "中", "低"] as const;

const SYSTEM = `あなたは、工事の現場の新入社員に向けた「文字の無い人形の絵のカード」を作る前に、どの決まりをカードにするかを分ける係です。
カードの絵は、棒の人形（新入社員・先輩・作業員の 3 役）が 3〜4 コマで動くだけです。文字は入りません。
描ける物は次のものだけです: ヘルメット・安全帯・検電器・電線・分電盤・コンセント・吊り荷・ほうき・ごみ箱・箱・工具箱・鍵・札・時計・チェック表と ✓・禁止の印・○ と ×・高い所の縁・親綱・幅を示す矢印・具合が悪い印・話す吹き出しと考える吹き出し（中に分電盤・検電器・コンセント・電線・安全帯・鍵・札・箱・工具箱・チェック表・吊り荷・ほうき・時計を描ける）。

渡すのは、1 ページから取り出した決まりの番号つきの一覧です。決まりごとに次を返してください。
- class: 次の 5 つのどれか
  - 動き: 上の描ける物と人の体の動きだけで、何をする（しない）かが絵から伝わる。
  - 物の名前: 絵に描けない特定の物や道具、数の値、場所の名前が分からないと伝わらない。
  - 書類・教育・資格: 書き物を用意する・教えを受ける・免許や資格が要る のように、体の動きではなく書き物や人の条件で決まるもの
  - 会社の義務: 会社・事業者・職長が置く・決める・させること（作業員の体の動きではないもの）
  - 心がけ: 気を付ける・集中する・活動を徹底する のように、体の動きが決まらないもの
- weight: 守らないときの危険の重さ。高 = 墜落・感電・挟まれ・下敷き・火災・酸欠のように命にかかわる。中 = けが。低 = それ以外
- reason: 分けた理由を 1 文

言い換え（会社が主語の決まりを作業員の行動に言い換えたもの）でも、作業員の体の動きが描ける物で伝わるなら「動き」にしてください。`;

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
        required: ["i", "class", "weight", "reason"],
        properties: { i: { type: "integer" }, class: { type: "string", enum: [...CLASSES] }, weight: { type: "string", enum: [...WEIGHTS] }, reason: { type: "string" } },
      },
    },
  },
} as const;

export interface PickNote {
  i: number;
  class: PickClass;
  weight: (typeof WEIGHTS)[number];
  reason: string;
}

export interface Pick {
  /** カードにする決まりの番号（取り出した rules の並びの番号） */
  items: number[];
  /** 決まりごとの分け（選ばなかった決まりも全部） */
  notes: PickNote[];
}

export function pickParams(rules: Rule[]): Anthropic.MessageCreateParamsNonStreaming {
  const list = rules.map((r, i) => `${i}. [${r.kind === "dont" ? "してはいけない" : "する"}${r.checklist ? "・点検表" : ""}] ${r.text}`).join("\n");
  return {
    model: PICK_MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `決まりの一覧:\n${list}` }],
  } as Anthropic.MessageCreateParamsNonStreaming;
}

const norm = (s: string) => s.replace(/\s+/g, "").replace(/[、。・]/g, "");

/** 分けから選ぶ。「動き」だけを候補にし、危険の重い順・してはいけないことを先・同じ文は 1 つ・元の並び順 */
export function choose(rules: Rule[], notes: PickNote[], perPage: number): number[] {
  const rank = { 高: 0, 中: 1, 低: 2 } as const;
  const seen = new Set<string>();
  return notes
    .filter((n) => n.class === "動き" && n.i >= 0 && n.i < rules.length)
    .sort((a, b) => rank[a.weight] - rank[b.weight] || (rules[a.i].kind === "dont" ? 0 : 1) - (rules[b.i].kind === "dont" ? 0 : 1) || a.i - b.i)
    .filter((n) => {
      const k = norm(rules[n.i].text);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, perPage)
    .map((n) => n.i);
}

export async function pickRules(deps: GuardedDeps, purpose: Purpose, rules: Rule[], perPage: number): Promise<Pick> {
  if (!rules.length) return { items: [], notes: [] };
  const msg = await guardedCall(deps, { purpose, label: "選ぶ（夜間）", params: pickParams(rules) });
  if (msg.stop_reason !== "end_turn") throw new Error(`選ぶ段が最後まで返らなかった: ${msg.stop_reason}`);
  const out = JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as { rules: PickNote[] };
  const notes = out.rules.filter((n) => Number.isInteger(n.i) && n.i >= 0 && n.i < rules.length);
  return { items: choose(rules, notes, perPage), notes };
}

/** テストと、選ぶ段を使わないときの既定: 先頭の N 個（1 周目と同じ） */
export const pickHead = (rules: Rule[], perPage: number): Pick => ({ items: rules.slice(0, perPage).map((_, i) => i), notes: [] });
