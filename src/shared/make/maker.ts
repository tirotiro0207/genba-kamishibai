// 正式な流れの作成（034a・工程 4）。OK した 1 項目を、カードの文（守ること・なぜ）に割り付け、
// Opus 5.5 に動き（キーフレームの JSON）と、部品ごとの経路（どの文から・なぜそう描いたか）を数字で書かせる。
// 絵は直接描かせない。印の 3〜4 か所がコマになる。経路の無い部品があれば、その中身を渡して 1 回だけ書き直させる。
// 脚本の段（script.ts・11/5）は既定では呼ばない（11/6 作者の判断で前の作り方に戻した）。options の script: true で呼べる。
// 絵を描く係には、作者の直しの教訓（lessons.ts）を既定で足す。
import type Anthropic from "@anthropic-ai/sdk";
import type { CardBody, CardScript, SourceRef, Statement } from "../card";
import { LESSONS } from "./lessons";
import { scriptText, writeScript } from "./script";
import { validateCard } from "../card";
import { type GuardedDeps, guardedCall, type Purpose } from "../claude";
import type { From } from "../extract/rules";
import { drawParams } from "../picto/draw";
import { cutFrames, MOTION_JSON_SCHEMA, type MotionJson } from "../picto/motion";
import { renderFrame, SIZE } from "../picto/scene";

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


/** ○× の組（093a）の場面。good は正しいやり方に ○、bad はまちがったやり方に × を付ける */
export type Scene = "good" | "bad";
export const SCENE_TEXT: Record<Scene, string> = {
  good: "この 1 枚は ○× の組の ○ の側。正しいやり方をしている場面にし、最後のコマに ○（circle_mark）を置く。",
  bad: "この 1 枚は ○× の組の × の側。まちがったやり方をしている場面にし、最後のコマに ×（cross_mark）を置く。禁止の印（prohibit）は使わない。",
};

/** 作る係の切り替え。どれも省けば既定（脚本なし・教訓あり） */
export interface MakerOptions {
  /** 先に脚本の段（物語 → コマ割り）を呼ぶ。既定は false（11/6 作者が前の作り方に戻した） */
  script?: boolean;
  /** 作者の直しの教訓（lessons.ts）を絵を描く係に足す。既定は true。教訓の無い版と比べる測りのときだけ false にする */
  lessons?: boolean;
}

/** examples は同じ会社・同じカテゴリの手本の文（086・exemplarText）。無ければ空。script は先に書かせた脚本（11/5・脚本ありのときだけ） */
export function makerParams(rule: OkRule, statements: Statement[], fix?: string, feedback?: string, scene?: Scene, examples?: string, script?: CardScript, opts: MakerOptions = {}): Anthropic.MessageCreateParamsNonStreaming {
  const why = statements.filter((s) => s.field === "why").map((s) => s.text).join("。");
  const base = drawParams(MAKER_MODEL, "motion", rule.kind === "dont" ? `${rule.text}（してはいけないこと）` : rule.text, why || undefined);
  const lines = statements.map((s) => `${s.id}（${s.field === "rule" ? "守ること" : "なぜ"}）: ${s.text}`).join("\n");
  const system = `${base.system}
${scene ? `${SCENE_TEXT[scene]}
` : ""}${rule.checklist ? "この決まりは点検表・チェックリストの型。表の中身は描かない。手元のアップで、チェックリスト（checklist）に 1 つずつ ✓（check_mark）を付けていく動きにする。\n" : ""}
あわせて、部品ごとの経路を parts に書いてください。キーフレームの figures と props の 1 つずつ（type と、最初のキーフレームでの番号 index）について、
どのカードの文（statement に s1 などの番号）から描いたかと、なぜそう描いたか（reason。短く）を書く。経路の無い部品は置かない。
${why ? "" : "元の文に理由が無いので、新入社員に伝える理由を why に 1 文で書く（文から分かる危険だけ。元の文に無い数字や決まりは足さない）。\n"}${opts.lessons === false ? "" : `\n${LESSONS}\n`}`;
  const again = feedback ? `\n\n前の絵の結果: ${feedback}\n絵だけで伝わるように、姿勢・小物・吹き出しを直してください。` : "";
  const plot = script
    ? `\n\n脚本（このとおりの筋で描く。コマの数と順・誰が何をするか・吹き出しの中身を変えない。mark: true はコマごとに 1 つ）:\n${scriptText(script)}`
    : "";
  const content = `${examples ? `${examples}\n\n` : ""}カードの文:\n${lines}${plot}${again}${fix ? `\n\n前の答えを直してください: ${fix}` : ""}`;
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

/** 手元の✓の型（034b）: 点検表の決まりは、チェックリストと ✓ の印が絵にあること */
export function checklistErrors(rule: OkRule, motion: MotionJson): string[] {
  if (!rule.checklist) return [];
  const kinds = new Set((motion?.keyframes ?? []).flatMap((k) => k.props.filter((p) => p.show !== false).map((p) => p.kind)));
  const e: string[] = [];
  if (!kinds.has("checklist")) e.push("点検表の型なのに checklist の小物が無い");
  if (!kinds.has("check_mark") && !kinds.has("bubble_check") && !kinds.has("think_check")) e.push("点検表の型なのに ✓ の印が無い");
  return e;
}

/**
 * 枠の端で半分切れる人を断る（11/5。右端の親方が体の半分しか見えず、何をしているか読めなかった）。
 * 人は枠の中に全部入れるか、そのコマに出ないなら枠の外に全部出す。体の幅は関節の外に頭 1 つぶんの余白を見る
 */
export function edgeErrors(motion: MotionJson): string[] {
  let frames: ReturnType<typeof cutFrames>;
  try {
    frames = cutFrames(motion);
  } catch {
    return [];
  }
  const e: string[] = [];
  frames.forEach(({ frame }, i) => {
    let posed;
    try {
      posed = renderFrame(frame).posed;
    } catch {
      return;
    }
    posed.forEach((p, j) => {
      const xs = Object.values(p.joints).map((q) => q[0]);
      const pad = p.h * 0.12;
      const x0 = Math.min(...xs) - pad;
      const x1 = Math.max(...xs) + pad;
      if (x1 > 0 && x0 < SIZE && (x0 < 0 || x1 > SIZE)) e.push(`${i + 1} コマ目の figures[${j}]（${frame.figures[j].role ?? "人"}）が枠の端で切れている。x を内へ寄せるか、そのコマに出ないなら枠の外へ全部出す`);
    });
  });
  return e;
}

/**
 * 1 項目から未承認の下書き 1 枚の中身を作る（保存は呼ぶ側）。feedback は前の絵を確かめる AI がどう読んだか。
 * 既定は脚本なし（11/6）。理由: 物語から作ると人と小物が増えすぎ、○・×・禁止の印の見せ方が弱くなった
 */
export async function makeCard(deps: GuardedDeps, purpose: Purpose, rule: OkRule, locate: Locate, feedback?: string, scene?: Scene, examples?: string, opts: MakerOptions = {}): Promise<Made> {
  const base = assign(rule, locate);
  const messages: Anthropic.Message[] = [];
  let script: CardScript | undefined;
  // 脚本ありのとき（11/5 の作り方）: きっかけ → 気づく → 決まりの動き → 結果 の筋をコマごとに決めてから、絵の数字を書かせる
  if (opts.script) {
    const written = await writeScript(deps, purpose, rule, base, scene, examples);
    script = written.script;
    messages.push(...written.messages);
  }
  let fix: string | undefined;
  for (let i = 0; i < 2; i++) {
    const msg = await guardedCall(deps, { purpose, label: "作成（動きと経路）", params: makerParams(rule, base, fix, feedback, scene, examples, script, opts) });
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
      ...(script ? { script } : {}),
    };
    const errs = [...validateCard(card), ...checklistErrors(rule, out.motion)];
    // 端で切れる人は 1 回だけ直させる（2 回目も切れていたら、形は正しいのでそのまま返し、確かめる AI の読みに任せる）
    if (!errs.length && i === 0) errs.push(...edgeErrors(out.motion));
    if (!errs.length) return { card, messages };
    fix = errs.slice(0, 6).join(" / ");
  }
  throw new Error(`作成が 2 回とも形か経路が足りない: ${fix}`);
}
