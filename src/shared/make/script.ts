// 脚本の段（11/5 作者）。絵の数字（キーフレーム）を書かせる前に、2 段で話の筋を決める。
//   1. 物語: コマの数に縛らず、決まりが伝わる話を細かく書く（どこで・何が起きて・誰が気づき・どう動き・どうなったか）
//   2. コマ割り: 物語を 3〜4 コマに移す。どの場面をまとめ・落とすか、コマごとに誰が何をして・どの小物と吹き出しで見せるか
// 前は決まりの文から直接、人と小物の数字を書かせていたので、決まりが働くきっかけ（「異常に気づいたら」の異常など）が絵に無く、
// 吹き出しの「？」「✓」が別の意味（どうつなぐか聞く・そのままでいい）に読める絵ができた。最初から 4 コマで考えさせると話が痩せるので、
// 先に物語を書かせてから、コマに移す段を分けた。現場は電気工事の会社なので、きっかけは電気の現場でよくある物（火花・盤・電線）から選ばせる。
// 描ける部品では見せられないときは drawable を false にして、足りない物を missing に書かせる（部品を足す手がかり）。
import type Anthropic from "@anthropic-ai/sdk";
import type { CardScript, Statement } from "../card";
import { type GuardedDeps, guardedCall, type Purpose } from "../claude";
import { ELAPSED, INNER_KINDS, type InnerKind, PROP_KINDS, type PropKind } from "../picto/props";
import type { OkRule, Scene } from "./maker";

export const SCRIPT_MODEL = "claude-opus-5-5";
/** 見る人の仕事。今は電気工事の会社だけ（テナントに業種を持たせたら、そこから渡す） */
export const DEFAULT_TRADE = "電気工事";

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
  spark: "火花",
  bubble_say: "話す吹き出し（記号なし。中の物について話す）",
  bubble_alert: "話す吹き出し（！。中の物が危ない・おかしいと知らせる）",
  elapsed_1min: "たった時間の札（1min）",
  elapsed_5min: "たった時間の札（5min）",
  elapsed_10min: "たった時間の札（10min）",
  elapsed_30min: "たった時間の札（30min）",
  elapsed_1h: "たった時間の札（1h）",
};

const HEADGEAR = new Set<PropKind>(["helmet", "helmet_new", "cap_lead"]);
const drawable = PROP_KINDS.filter((k) => !HEADGEAR.has(k))
  .map((k) => `${PROP_JA[k]}（${k}）`)
  .join("・");
const inner = INNER_KINDS.map((k: InnerKind) => `${PROP_JA[k]}（${k}）`).join("・");
const times = Object.values(ELAPSED).join("・");

/** 1 段目: 物語の係 */
export const STORY_SYSTEM = `あなたは、${DEFAULT_TRADE}の会社の新入社員に向けた「文字の無い人形の絵のカード」の脚本を書く係（物語の段）です。
渡された「守ること」と「なぜ」が、絵だけで伝わる短い物語を書きます。コマの数はまだ考えません。あとで別の係が 3〜4 コマに移します。

物語の決まり:
1. 決まりが働くきっかけを、はっきり起こす。「〜したら」「〜のときは」「〜の前に」の部分が、物語の中で目に見える出来事として起きること。
2. きっかけが「異常」「いつもと違う」のように広い言葉なら、${DEFAULT_TRADE}の現場でよくある、目で見て一目で危ないと分かる具体的な 1 つに決める
   （たとえば 分電盤・コンセント・電線から火花が散る）。液漏れのような、${DEFAULT_TRADE}らしくない出来事は選ばない。
3. 人は 新人・上の人（親方・職長・先輩）・ほかの作業員 から要る人だけ。誰が気づき、誰に、どう伝え、相手がどう動くかを書く。
4. 「なぜ」は、決まりを守った結果（守らなかった結果）として、物語の終わりに目に見える形で起きること（事故が防げた・起きた）。
5. 「すぐに」「早く」は、気づいてから動くまでにほかのことをしていないこと。「10 分」のような時間の数字は、そのまま time に「10min」の形で書く（使える札: ${times}）。
6. 場面ごとに、見る人がそこで分かること（1 つ）を書く。読み違えそうなことは avoid に書く。

返す中身:
- setting: どこで・誰が・何をしているところか
- beats: 物語の場面を順に（3〜8 個）。what は起きること・人の動きを細かく、viewer は見る人がそこで分かること
- why_shown: 「なぜ」が物語のどこでどう見えるか
- time: 時間の札に書く数字（「10min」など）。要らなければ null
- avoid: 読み違えそうなことと、その避け方`;

/** 2 段目: コマ割りの係 */
export const BOARD_SYSTEM = `あなたは、${DEFAULT_TRADE}の会社の新入社員に向けた「文字の無い人形の絵のカード」の脚本を書く係（コマ割りの段）です。
前の係が書いた物語を、3〜4 コマの絵に移します。見る人は文字を読まず、絵だけから「守ること」と「なぜ」を読み取ります。
絵は、あとで別の係があなたのコマ割りどおりに人形と小物の数字にします。

描けるもの:
- 人は 1〜3 人。役は 新人（new・白いヘルメット）・上の人（lead・黒い帽子）・ほかの作業員（worker・グレーのヘルメット）。
- 人の体の動き（立つ・歩く・しゃがむ・手を伸ばす・指さす・振り向く・手を上げる・道具を持つ・渡す・後ずさる）と、立つ位置・向き。
- 小物: ${drawable}
- 吹き出しの中に描ける物（何について話す・考えるか）: ${inner}
- 場面は 1 つの部屋。左に壁（盤・コンセントなど壁の道具の場所）、下に床。
- 文字は、たった時間の札（${times}）だけ。ほかの文字・数字・言葉は描けない。

描けないもの: 物の見た目が変わること（光る・壊れる・緩む）。火花は小物の「火花（spark）」を出す・消すことで見せる。人を床より高い所に立たせる・横に寝かせる。

吹き出しの読まれ方（必ずこの意味でだけ使う）:
- 「？」は「分からない・どうするか聞いている」。危ないことを知らせるのに使わない。
- 「✓」と ✓ の印は「確かめた・これでよい」。異常を受けた側が ✓ を返すと「そのままでいい」と読まれる。受けた側は体の動き（現場へ行く・止める・離れさせる）で応える。
- 危ない・おかしいと知らせるのは「！」の話す吹き出し（bubble_alert）で、中にその物（火花・盤など）を入れる。

コマ割りの決まり:
1. 物語の場面を、3〜4 コマに選んでまとめる。1 コマで見る人が分かることは 1 つ。きっかけ → 気づく → 決まりの動き → 結果（なぜ）の順。
2. どの場面をまとめ・落としたかを merged に書く。落とすと伝わらなくなる場面は落とさない。
3. コマごとに、出る人（役と立つ位置 左・中・右）、体の動き、置く小物（kind の名前で）、吹き出し（kind と中の物）を細かく書く。
4. そのコマに出ない人は「出ない」と書く（絵の係は人を枠の外に出す）。
5. 物語に time があれば、時間がたったコマにたった時間の札（elapsed_…）を置く。
6. ○× の組の片側なら、最後のコマにだけ ○（circle_mark）か ×（cross_mark）を置く。
7. 描ける物で見せられないことがあれば drawable を false にし、何があれば見せられるかを missing に書く（それでも、いちばん近いコマ割りを書く）。

返す中身:
- trigger: きっかけをどのコマでどう見せるか
- merged: 物語の場面をどうまとめ・落としたか
- frames: コマごとに who（出る人と立つ位置。出ない人も）・action（体の動き・小物の kind・吹き出しの kind と中の物を細かく）・viewer（見る人がこのコマで分かること 1 つ）
- why_shown: 「なぜ」をどのコマでどう見せるか
- avoid: 読み違えそうなことと、その避け方
- drawable・missing`;

const STORY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["setting", "beats", "why_shown", "time", "avoid"],
  properties: {
    setting: { type: "string" },
    beats: { type: "array", items: { type: "object", additionalProperties: false, required: ["what", "viewer"], properties: { what: { type: "string" }, viewer: { type: "string" } } } },
    why_shown: { type: "string" },
    time: { type: ["string", "null"] },
    avoid: { type: "array", items: { type: "string" } },
  },
} as const;

const BOARD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["trigger", "merged", "frames", "why_shown", "avoid", "drawable", "missing"],
  properties: {
    trigger: { type: "string" },
    merged: { type: "string" },
    frames: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["who", "action", "viewer"], properties: { who: { type: "string" }, action: { type: "string" }, viewer: { type: "string" } } },
    },
    why_shown: { type: "string" },
    avoid: { type: "array", items: { type: "string" } },
    drawable: { type: "boolean" },
    missing: { type: ["string", "null"] },
  },
} as const;

export type Story = NonNullable<CardScript["story"]>;

const SCENE_SCRIPT: Record<Scene, string> = {
  good: "この 1 枚は ○× の組の ○ の側。決まりを守った正しいやり方の話にし、最後に ○ の印を置く。",
  bad: "この 1 枚は ○× の組の × の側。決まりを守らなかったまちがいの話にし、最後に起きた悪いことを見せて × の印を置く（禁止の印は使わない）。",
};

function cardText(rule: OkRule, statements: Statement[], scene?: Scene): string {
  const lines = statements.map((s) => `${s.field === "rule" ? "守ること" : "なぜ"}: ${s.text}`).join("\n");
  const kind = rule.kind === "dont" ? "（してはいけないこと）" : "";
  const extra = [scene ? SCENE_SCRIPT[scene] : "", rule.checklist ? "この決まりは点検表の型。表の中身は描かず、チェック表に 1 つずつ ✓ を付けていく手元の動きを話に入れる。" : ""].filter(Boolean).join("\n");
  return `カードの文${kind}:\n${lines}${extra ? `\n\n${extra}` : ""}`;
}

const call = (system: string, schema: object, content: string): Anthropic.MessageCreateParamsNonStreaming =>
  ({
    model: SCRIPT_MODEL,
    max_tokens: 8000,
    system,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  }) as Anthropic.MessageCreateParamsNonStreaming;

export function storyParams(rule: OkRule, statements: Statement[], scene?: Scene, examples?: string): Anthropic.MessageCreateParamsNonStreaming {
  return call(STORY_SYSTEM, STORY_SCHEMA, `${examples ? `${examples}\n\n` : ""}${cardText(rule, statements, scene)}`);
}

export function storyText(s: Story): string {
  return [
    `場面: ${s.setting}`,
    ...s.beats.map((b, i) => `場面 ${i + 1}: ${b.what}／見る人が分かること: ${b.viewer}`),
    `なぜの見せ方: ${s.why_shown}`,
    `時間の札: ${s.time ?? "なし"}`,
    ...(s.avoid.length ? [`避けること: ${s.avoid.join("／")}`] : []),
  ].join("\n");
}

export function boardParams(rule: OkRule, statements: Statement[], story: Story, scene?: Scene): Anthropic.MessageCreateParamsNonStreaming {
  return call(BOARD_SYSTEM, BOARD_SCHEMA, `${cardText(rule, statements, scene)}\n\n物語:\n${storyText(story)}`);
}

/** 脚本（コマ割り）を、絵の係に渡す文にする */
export function scriptText(s: CardScript): string {
  return [
    `きっかけ: ${s.trigger}`,
    ...s.frames.map((f, i) => `${i + 1} コマ目: ${f.who}／${f.action}／見る人が分かること: ${f.viewer}`),
    `なぜの見せ方: ${s.why_shown}`,
    ...(s.avoid.length ? [`避けること: ${s.avoid.join("／")}`] : []),
  ].join("\n");
}

export function storyErrors(s: Story): string[] {
  const e: string[] = [];
  if (!s?.setting?.trim()) e.push("場面（setting）が空");
  if (!Array.isArray(s?.beats) || s.beats.length < 3 || s.beats.length > 8) e.push("場面（beats）は 3〜8");
  if (!s?.why_shown?.trim()) e.push("なぜの見せ方（why_shown）が空");
  if (s?.time && !Object.values(ELAPSED).includes(s.time)) e.push(`時間の札（time）は ${times} のどれか: ${s.time}`);
  return e;
}

/** コマ割りの形を確かめる。コマは 3〜4 */
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

/** 形が合わなければ、その中身を渡して 1 回だけ書き直させる */
async function twice<T>(deps: GuardedDeps, purpose: Purpose, label: string, params: Anthropic.MessageCreateParamsNonStreaming, check: (x: T) => string[], messages: Anthropic.Message[]): Promise<T> {
  let fix = "";
  for (let i = 0; i < 2; i++) {
    const p = fix ? { ...params, messages: [{ role: "user" as const, content: `${String(params.messages[0].content)}\n\n前の答えを直してください: ${fix}` }] } : params;
    const msg = await guardedCall(deps, { purpose, label, params: p });
    messages.push(msg);
    const x = JSON.parse(textOf(msg)) as T;
    const errs = check(x);
    if (!errs.length) return x;
    fix = errs.join(" / ");
  }
  throw new Error(`${label}が 2 回とも形が足りない: ${fix}`);
}

/** 物語 → コマ割り の 2 段で脚本を書かせる */
export async function writeScript(deps: GuardedDeps, purpose: Purpose, rule: OkRule, statements: Statement[], scene?: Scene, examples?: string): Promise<{ script: CardScript; messages: Anthropic.Message[] }> {
  const messages: Anthropic.Message[] = [];
  const story = await twice<Story>(deps, purpose, "脚本（物語）", storyParams(rule, statements, scene, examples), storyErrors, messages);
  const board = await twice<Omit<CardScript, "story">>(deps, purpose, "脚本（コマ割り）", boardParams(rule, statements, story, scene), (b) => scriptErrors(b as CardScript), messages);
  return { script: { ...board, missing: board.drawable ? null : (board.missing ?? null), story }, messages };
}
