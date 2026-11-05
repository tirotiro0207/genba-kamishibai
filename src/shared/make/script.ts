// 脚本の段（11/5 作者）。絵の数字（キーフレーム）を書かせる前に、決まりを 3〜4 コマの話の筋に直させる。
// 前は決まりの文から直接、人と小物の数字を書かせていたので、決まりが働くきっかけ（「異常に気づいたら」の異常など）が絵に無く、
// 吹き出しの「？」「✓」が別の意味（どうつなぐか聞く・そのままでいい）に読める絵ができた。
// ここでは、きっかけを描ける物で見せる・コマごとに見る人が分かることを 1 つにする・「なぜ」を結果のコマで見せる、を先に決める。
// 描ける部品では見せられないときは drawable を false にして、足りない物を missing に書かせる（部品を足す手がかり）。
import type Anthropic from "@anthropic-ai/sdk";
import type { CardScript, Statement } from "../card";
import { type GuardedDeps, guardedCall, type Purpose } from "../claude";
import { INNER_KINDS, type InnerKind, PROP_KINDS, type PropKind } from "../picto/props";
import type { OkRule, Scene } from "./maker";

export const SCRIPT_MODEL = "claude-opus-5-5";

/** 小物の日本語の名前（脚本の係は日本語で考え、絵の係へは kind の名前で渡す） */
export const PROP_JA: Record<PropKind, string> = {
  helmet: "ヘルメット",
  helmet_new: "新人のヘルメット",
  cap_lead: "上の人の帽子",
  harness: "安全帯",
  tester: "検電器",
  wire: "電線",
  panel: "分電盤",
  bubble_question: "話す吹き出し（？）",
  bubble_check: "話す吹き出し（✓）",
  suspended_load: "吊り荷",
  arrow_down: "下向きの矢印",
  broom: "ほうき",
  box: "箱",
  lock: "鍵",
  tag: "札",
  clock: "時計",
  checklist: "チェック表",
  prohibit: "禁止の印",
  circle_mark: "○ の印",
  cross_mark: "× の印",
  outlet: "コンセント",
  toolbox: "工具箱",
  check_mark: "✓ の印（確かめた）",
  think_question: "考える吹き出し（？）",
  think_check: "考える吹き出し（✓）",
  unwell: "具合が悪い印",
  span_arrow: "幅を示す矢印",
  edge: "高い所の縁",
  anchor_line: "親綱",
  trash_bin: "ごみ箱",
  cone: "カラーコーン",
  barrier: "柵",
  ladder: "はしご",
  stepladder: "脚立",
  fire_extinguisher: "消火器",
  first_aid: "救急箱",
  gloves: "手袋",
  goggles: "保護めがね",
  knife: "刃物",
  hot_pot: "熱い鍋",
  cart: "台車",
  forklift: "フォークリフト",
  spill: "床にこぼれた液",
  bucket: "バケツ",
  mop: "モップ",
  chemical: "薬品の容器",
  gas_cylinder: "ガスのボンベ",
  hammer: "ハンマー",
  wrench: "レンチ",
  grinder: "グラインダー",
  gear: "回る歯車",
  sun: "太陽",
  water_bottle: "水筒",
  faucet: "蛇口",
  radio: "無線機",
};

const HEADGEAR = new Set<PropKind>(["helmet", "helmet_new", "cap_lead"]);
const drawable = PROP_KINDS.filter((k) => !HEADGEAR.has(k))
  .map((k) => `${PROP_JA[k]}（${k}）`)
  .join("・");
const inner = INNER_KINDS.map((k: InnerKind) => PROP_JA[k]).join("・");

export const SCRIPT_SYSTEM = `あなたは、工事の現場の新入社員に向けた「文字の無い人形の絵のカード」の脚本を書く係です。
カードは 3〜4 コマ。見る人は文字を読まず、絵だけから「守ること」と「なぜ」を読み取ります。絵は、あとで別の係があなたの脚本どおりに人形と小物の数字にします。

描けるもの:
- 人は 1〜3 人。役は 新人（new・白いヘルメット）・上の人（lead・黒い帽子。親方・職長・先輩）・ほかの作業員（worker・グレーのヘルメット）。
- 人の体の動き（立つ・歩く・しゃがむ・手を伸ばす・指さす・振り向く・手を上げる・道具を持つ・渡す）と、立つ位置・向き。
- 小物: ${drawable}
- 吹き出しの中に描ける物（何について話す・考えるか）: ${inner}
- 場面は 1 つの部屋。左に壁（盤・コンセントなど壁の道具の場所）、下に床。

描けないもの（脚本に入れない）:
- 文字・数字・言葉。物の見た目が変わること（光る・煙が出る・火花・壊れる・緩む・中身が減る）。人を床より高い所に立たせる・横に寝かせる。
- 物の「異常」は、見た目の変化ではなく、描ける物の置き方（床にこぼれた液・倒れて置かれた物・通り道をふさぐ物）か、人の様子（具合が悪い印）で見せる。

吹き出しの読まれ方（必ずこの意味でだけ使う）:
- 「？」の吹き出しは「分からない・どうするか聞いている」と読まれる。「おかしい・危ない」を伝えたいときに「？」を使わない。
- 「✓」の吹き出しや ✓ の印は「確かめた・これでよい」と読まれる。異常を受けた側が ✓ を返すと「そのままでいい」と読まれるので、受けた側は止める・片付ける・現場へ行くなど、体の動きで応える。
- 吹き出しの中の物は「何について」。知らせる中身は、異常そのもの（異常のある物）を入れる。

脚本の決まり:
1. 決まりが働くきっかけを最初に見せる。「〜したら」「〜のときは」「〜の前に」の部分を、そのまま絵で起こす。きっかけが「異常」「いつもと違う」のように広い言葉なら、新人の現場でよくある具体的な 1 つに決め、描ける物で見せる。
2. 1 コマで見る人が分かることは 1 つだけ。コマの順に、きっかけ → 気づく・判断する → 決まりの動き → 結果（なぜ）。
3. 「なぜ」は、決まりを守った結果として最後のコマで見せる（事故が防げた・危険が取り除かれた。○ の印は結果がはっきりしたときだけ）。守らなかった場面を描く脚本（× の側）なら、最後のコマで起きた悪いことを描ける物で見せ、× の印を置く。
4. 「すぐに」「早く」のような時間の言葉は、気づいたコマと動いたコマの間に、ほかのことをしていない（作業を続けていない）ことで見せる。
5. 人・小物は要るものだけ。同じ物を別の意味で 2 回使わない。
6. 見る人が読み違えそうなことを avoid に挙げ、それを避けた筋にする。
7. 描ける物でどうしても見せられないことがあれば drawable を false にし、何があれば見せられるかを missing に書く（それでも、今描ける物でいちばん近い脚本を書く）。

返す中身:
- trigger: 決まりが働くきっかけを、絵でどう見せるか（1〜2 文）
- frames: コマごとに who（出る人と立つ位置）・action（体の動き・小物・吹き出しの中身を細かく）・viewer（見る人がこのコマで分かること 1 つ）
- why_shown: 「なぜ」をどのコマでどう見せるか
- avoid: 読み違えそうなことと、その避け方
- drawable・missing`;

const SCRIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["trigger", "frames", "why_shown", "avoid", "drawable", "missing"],
  properties: {
    trigger: { type: "string" },
    frames: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["who", "action", "viewer"],
        properties: { who: { type: "string" }, action: { type: "string" }, viewer: { type: "string" } },
      },
    },
    why_shown: { type: "string" },
    avoid: { type: "array", items: { type: "string" } },
    drawable: { type: "boolean" },
    missing: { type: ["string", "null"] },
  },
} as const;

const SCENE_SCRIPT: Record<Scene, string> = {
  good: "この 1 枚は ○× の組の ○ の側。決まりを守った正しいやり方の筋にし、最後のコマに ○ の印を置く。",
  bad: "この 1 枚は ○× の組の × の側。決まりを守らなかったまちがいの筋にし、最後のコマに × の印を置く（禁止の印は使わない）。",
};

export function scriptParams(rule: OkRule, statements: Statement[], scene?: Scene, examples?: string): Anthropic.MessageCreateParamsNonStreaming {
  const lines = statements.map((s) => `${s.field === "rule" ? "守ること" : "なぜ"}: ${s.text}`).join("\n");
  const kind = rule.kind === "dont" ? "（してはいけないこと）" : "";
  const extra = [scene ? SCENE_SCRIPT[scene] : "", rule.checklist ? "この決まりは点検表の型。表の中身は描かず、チェック表に 1 つずつ ✓ を付けていく手元の動きを筋に入れる。" : ""].filter(Boolean).join("\n");
  return {
    model: SCRIPT_MODEL,
    max_tokens: 8000,
    system: SCRIPT_SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCRIPT_SCHEMA } },
    messages: [{ role: "user", content: `${examples ? `${examples}\n\n` : ""}カードの文${kind}:\n${lines}${extra ? `\n\n${extra}` : ""}` }],
  } as Anthropic.MessageCreateParamsNonStreaming;
}

/** 脚本を、絵の係に渡す文にする */
export function scriptText(s: CardScript): string {
  return [
    `きっかけ: ${s.trigger}`,
    ...s.frames.map((f, i) => `${i + 1} コマ目: ${f.who}／${f.action}／見る人が分かること: ${f.viewer}`),
    `なぜの見せ方: ${s.why_shown}`,
    ...(s.avoid.length ? [`避けること: ${s.avoid.join("／")}`] : []),
  ].join("\n");
}

/** 脚本の形を確かめる。コマは 3〜4 */
export function scriptErrors(s: CardScript): string[] {
  const e: string[] = [];
  if (!s?.trigger?.trim()) e.push("きっかけ（trigger）が空");
  if (!Array.isArray(s?.frames) || s.frames.length < 3 || s.frames.length > 4) e.push("コマ（frames）は 3〜4");
  else if (s.frames.some((f) => !f.action?.trim() || !f.viewer?.trim())) e.push("動き（action）か分かること（viewer）が空のコマがある");
  if (!s?.why_shown?.trim()) e.push("なぜの見せ方（why_shown）が空");
  return e;
}

function textOf(msg: Anthropic.Message): string {
  if (msg.stop_reason !== "end_turn") throw new Error(`脚本が最後まで返らなかった: ${msg.stop_reason}`);
  return msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
}

/** 脚本を書かせる。形が合わなければ、その中身を渡して 1 回だけ書き直させる */
export async function writeScript(deps: GuardedDeps, purpose: Purpose, rule: OkRule, statements: Statement[], scene?: Scene, examples?: string): Promise<{ script: CardScript; messages: Anthropic.Message[] }> {
  const messages: Anthropic.Message[] = [];
  let fix = "";
  for (let i = 0; i < 2; i++) {
    const p = scriptParams(rule, statements, scene, examples);
    if (fix) p.messages = [{ role: "user", content: `${String(p.messages[0].content)}\n\n前の脚本を直してください: ${fix}` }];
    const msg = await guardedCall(deps, { purpose, label: "脚本", params: p });
    messages.push(msg);
    const s = JSON.parse(textOf(msg)) as CardScript;
    const errs = scriptErrors(s);
    if (!errs.length) return { script: { ...s, missing: s.drawable ? null : (s.missing ?? null) }, messages };
    fix = errs.join(" / ");
  }
  throw new Error(`脚本が 2 回とも形が足りない: ${fix}`);
}
