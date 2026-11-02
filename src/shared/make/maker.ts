// 正式な流れの作成（034a・工程 4）。OK した 1 項目を、カードの文（守ること・なぜ）に割り付け、
// Opus 5.5 に動き（キーフレームの JSON）と、部品ごとの経路（どの文から・なぜそう描いたか）を数字で書かせる。
// 絵は直接描かせない。印の 3〜4 か所がコマになる。経路の無い部品があれば、その中身を渡して 1 回だけ書き直させる。
import type Anthropic from "@anthropic-ai/sdk";
import type { CardBody, SourceRef, Statement } from "../card";
import { validateCard } from "../card";
import { type GuardedDeps, guardedCall, type Purpose } from "../claude";
import type { From } from "../extract/rules";
import { drawParams } from "../picto/draw";
import { MOTION_JSON_SCHEMA, type MotionJson } from "../picto/motion";

export const MAKER_MODEL = "claude-opus-5-5";

/** 取り出しで OK した 1 項目（033 の形） */
export interface OkRule {
  kind: "do" | "dont";
  text: string;
  from: From;
  reasons: { text: string; from: From; stated: boolean }[];
  checklist: boolean;
  reworded: boolean;
}

/** 元の文の行の番号を、カードの元の位置にする（033 の入れたもの） */
export type Locate = (f: From) => SourceRef;

/** 1 つ目の文が守ること。理由は元の文にあるものを先に、無いもの（ai）を後に */
export function assign(rule: OkRule, locate: Locate): Statement[] {
  const st: Statement[] = [{ id: "s1", field: "rule", text: rule.text, sources: [locate(rule.from)] }];
  rule.reasons
    .slice()
    .sort((a, b) => Number(b.stated) - Number(a.stated))
    .forEach((r, i) => st.push({ id: `s${i + 2}`, field: "why", text: r.text, sources: [locate(r.from)], ...(r.stated ? {} : { ai: true }) }));
  return st;
}

const PARTS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["type", "index", "statement", "reason"],
    properties: { type: { type: "string", enum: ["figure", "prop"] }, index: { type: "integer" }, statement: { type: "string" }, reason: { type: "string" } },
  },
} as const;

const WHY_SCHEMA = { type: ["string", "null"] } as const;


export function makerParams(rule: OkRule, statements: Statement[], fix?: string): Anthropic.MessageCreateParamsNonStreaming {
  const why = statements.filter((s) => s.field === "why").map((s) => s.text).join("。");
  const base = drawParams(MAKER_MODEL, "motion", rule.kind === "dont" ? `${rule.text}（してはいけないこと）` : rule.text, why || undefined);
  const lines = statements.map((s) => `${s.id}（${s.field === "rule" ? "守ること" : "なぜ"}）: ${s.text}`).join("\n");
  const system = `${base.system}
${rule.checklist ? "この決まりは点検表・チェックリストの型。表の中身は描かない。手元のアップで、チェックリスト（checklist）に 1 つずつ ✓（check_mark）を付けていく動きにする。\n" : ""}
あわせて、部品ごとの経路を parts に書いてください。キーフレームの figures と props の 1 つずつ（type と、最初のキーフレームでの番号 index）について、
どのカードの文（statement に s1 などの番号）から描いたかと、なぜそう描いたか（reason。短く）を書く。経路の無い部品は置かない。
${why ? "" : "元の文に理由が無いので、新入社員に伝える理由を why に 1 文で書く（文から分かる危険だけ。元の文に無い数字や決まりは足さない）。\n"}`;
  const content = `カードの文:\n${lines}${fix ? `\n\n前の答えを直してください: ${fix}` : ""}`;
  return {
    ...base,
    system,
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: { type: "object", additionalProperties: false, required: ["motion", "parts", "why"], properties: { motion: MOTION_JSON_SCHEMA, parts: PARTS_SCHEMA, why: WHY_SCHEMA } },
      },
    },
    messages: [{ role: "user", content }],
  } as Anthropic.MessageCreateParamsNonStreaming;
}

function textOf(msg: Anthropic.Message): string {
  if (msg.stop_reason !== "end_turn") throw new Error(`作成が最後まで返らなかった: ${msg.stop_reason}`);
  return msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
}

export interface Made {
  card: CardBody;
  messages: Anthropic.Message[];
}

/** 1 項目から未承認の下書き 1 枚の中身を作る（保存は呼ぶ側） */
export async function makeCard(deps: GuardedDeps, purpose: Purpose, rule: OkRule, locate: Locate): Promise<Made> {
  const base = assign(rule, locate);
  const messages: Anthropic.Message[] = [];
  let fix: string | undefined;
  for (let i = 0; i < 2; i++) {
    const msg = await guardedCall(deps, { purpose, label: "作成（動きと経路）", params: makerParams(rule, base, fix) });
    messages.push(msg);
    const out = JSON.parse(textOf(msg)) as { motion: MotionJson; parts: { type: "figure" | "prop"; index: number; statement: string; reason: string }[]; why: string | null };
    const statements = base.slice();
    // 元の文に理由が無く、AI が理由を書いたときは「ai」の文にする。根拠の位置は守ることの位置
    if (!statements.some((s) => s.field === "why") && out.why?.trim()) statements.push({ id: `s${statements.length + 1}`, field: "why", text: out.why.trim(), sources: base[0].sources, ai: true });
    const card: CardBody = {
      rule: rule.kind === "dont" ? `${rule.text}` : rule.text,
      why: statements.filter((s) => s.field === "why").map((s) => s.text).join("。"),
      statements,
      motion: { kind: "keyframes", json: out.motion },
      frames: (out.motion?.keyframes ?? []).filter((k) => k.mark).map((k) => ({ t: k.t })),
      parts: (out.parts ?? []).map((p, j) => ({ id: `p${j + 1}`, target: { type: p.type, index: p.index }, statement: p.statement, reason: p.reason })),
    };
    const errs = validateCard(card);
    if (!errs.length) return { card, messages };
    fix = errs.slice(0, 6).join(" / ");
  }
  throw new Error(`作成が 2 回とも形か経路が足りない: ${fix}`);
}
