// 確かめる AI の正式版（047・工程 6・仕様 §6「AI に自分で合格を出させない」・§7）。
// 作った側とは別のエージェント（別の指示・別の呼び出し。作る側の文脈は渡さない）。
// ① 読む: 文を見せず、絵（3〜4 コマ。原則のカードは 1 コマ）だけを順に渡し、日本語の読めない新入社員の役で、コマごとに見えたことと全体の意味を答えさせる。
// ② 照らす: カードの「守ること・なぜ」の文 1 つずつについて、受け取り方が合っているか（合う・一部・合わない）と、どのコマから伝わったかを判定させる。
// 伝わる率は ② の判定からコードで出す（守ること 6 割・なぜ 4 割。合う 1・一部 0.5・合わない 0）。帯は緑 80 以上・黄 60〜79・赤 60 未満、危ない読み違いは赤。
// どの絵を見て・何点で・なぜかを証拠として監査の記録 ③ に残す。証拠が無いカードは「確認待ち」のまま OK できない。
import type Anthropic from "@anthropic-ai/sdk";
import type { CardBody, Statement } from "../card";
import { type GuardedDeps, guardedCall, type Purpose } from "../claude";
import type { ImageBlock } from "./verify";

export const VERIFIER_MODEL = "claude-opus-5-5";
export const AGENT = "verifier";
export const GREEN_FROM = 80;
export const YELLOW_FROM = 60;
const RULE_SHARE = 0.6;

export type Band = "green" | "yellow" | "red";
export type Credit = "full" | "partial" | "none";
const CREDIT: Record<Credit, number> = { full: 1, partial: 0.5, none: 0 };

const READER_SYSTEM = `あなたは外国から日本に来て、日本の電気工事の会社に入ったばかりの新入社員です。日本語の文字は読めません。
現場で、絵だけのカードを見せられました。カードは何コマかの絵で、1 コマ目から順に起きることを描いています。
コマごとに、何が見えるか（人・道具・動き・向き・印）を書き、そのあと、このカードが作業員に何をするように（または、しないように）伝えているか、
なぜそうするのかの見当を答えてください。絵から分からないことは「分からない」と書き、絵に無いことを足さないでください。答えは日本語で。`;

const READER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["frames", "meaning", "do", "dont", "why_guess", "confidence"],
  properties: {
    frames: { type: "array", items: { type: "object", additionalProperties: false, required: ["frame", "saw"], properties: { frame: { type: "integer" }, saw: { type: "string" } } } },
    meaning: { type: "string" },
    do: { type: "string" },
    dont: { type: ["string", "null"] },
    why_guess: { type: ["string", "null"] },
    confidence: { type: "integer" },
  },
} as const;

const JUDGE_SYSTEM = `あなたは安全の判定係です。カードの文（守ること・なぜ）の 1 つずつについて、絵だけを見た新入社員の受け取り方と比べます。
credit: 受け取り方にその文の中身が入っていれば full、一部だけなら partial、入っていなければ none。言い方の違いは問わない
frame: その文の中身が、受け取り方のどのコマの「見えたこと」から伝わったか（1 から数える）。伝わっていなければ null
reason: そう判定した理由を 1 文で
dangerous: 受け取り方のとおりに動くと、危ない行為をしてよいと読める（逆の意味に取った、危ない手順を飛ばしてよいと取った等）なら true
summary: 全体として伝わったか・何が伝わっていないかを 1〜2 文で`;

const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["points", "dangerous", "danger_reason", "summary"],
  properties: {
    points: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "credit", "frame", "reason"],
        properties: { id: { type: "string" }, credit: { type: "string", enum: ["full", "partial", "none"] }, frame: { type: ["integer", "null"] }, reason: { type: "string" } },
      },
    },
    dangerous: { type: "boolean" },
    danger_reason: { type: ["string", "null"] },
    summary: { type: "string" },
  },
} as const;

export interface FormalReading {
  frames: { frame: number; saw: string }[];
  meaning: string;
  do: string;
  dont: string | null;
  why_guess: string | null;
  confidence: number;
}

export interface Point {
  id: string;
  credit: Credit;
  frame: number | null;
  reason: string;
}

export interface Judgement {
  points: Point[];
  dangerous: boolean;
  danger_reason: string | null;
  summary: string;
}

/** 証拠（監査の記録 ③ に残す中身）。どの絵を見て・何点で・なぜか */
export interface Evidence {
  agent: typeof AGENT;
  model: string;
  /** 見せたコマの数（全部を順に見せる） */
  frames: number;
  /** 文が伝わったと判定されたコマ（1 から） */
  cited: number[];
  rate: number;
  band: Band;
  dangerous: boolean;
  reason: string;
  points: Point[];
  reading: FormalReading;
}

function params(system: string, schema: object, content: Anthropic.ContentBlockParam[], maxTokens: number): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: VERIFIER_MODEL,
    max_tokens: maxTokens,
    system,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  } as Anthropic.MessageCreateParamsNonStreaming;
}

/** ① 絵だけを順に渡す。カードの文・決まり・ファイル名は入れない（コマの番号だけを添える） */
export function readParams(images: ImageBlock[]) {
  const content: Anthropic.ContentBlockParam[] = images.flatMap((img, i) => [{ type: "text" as const, text: `${i + 1} コマ目` }, img]);
  content.push({ type: "text", text: `全部で ${images.length} コマです。このカードは何を伝えていますか。` });
  return params(READER_SYSTEM, READER_SCHEMA, content, 16000);
}

/** ② カードの文 1 つずつと受け取り方を照らす */
export function judgeParams(statements: Statement[], reading: FormalReading) {
  const lines = statements.map((s) => `- ${s.id}（${s.field === "rule" ? "守ること" : "なぜ"}）: ${s.text}`).join("\n");
  return params(JUDGE_SYSTEM, JUDGE_SCHEMA, [{ type: "text", text: `カードの文:\n${lines}\n\n絵だけを見た新入社員の受け取り方: ${JSON.stringify(reading)}` }], 6000);
}

const json = <T>(msg: Anthropic.Message, what: string): T => {
  if (msg.stop_reason !== "end_turn") throw new Error(`${what}が最後まで返らなかった: ${msg.stop_reason}`);
  return JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as T;
};

/** 伝わる率（0〜100）。守ること 6 割・なぜ 4 割を文の数で割る。なぜが無ければ守ることで 10 割。判定の無い文は合わないとして数える */
export function rateOf(statements: Statement[], points: Point[]): number {
  const rules = statements.filter((s) => s.field === "rule");
  const whys = statements.filter((s) => s.field === "why");
  const share = (s: Statement) => (s.field === "rule" ? (whys.length ? RULE_SHARE : 1) / rules.length : (1 - RULE_SHARE) / whys.length);
  const credit = (s: Statement) => CREDIT[points.find((p) => p.id === s.id)?.credit ?? "none"] ?? 0;
  return Math.round(100 * statements.reduce((a, s) => a + share(s) * credit(s), 0));
}

export const bandOf = (rate: number, dangerous: boolean): Band => (dangerous || rate < YELLOW_FROM ? "red" : rate < GREEN_FROM ? "yellow" : "green");

/** 証拠がそろっているか（見たコマ・点・理由）。サーバーの関門と画面が使う */
export function hasEvidence(e: unknown, frames?: number): e is Evidence {
  const x = e as Partial<Evidence> | null;
  return (
    !!x &&
    x.agent === AGENT &&
    Number.isInteger(x.frames) &&
    x.frames! >= 1 &&
    (frames === undefined || x.frames === frames) &&
    Array.isArray(x.cited) &&
    typeof x.rate === "number" &&
    x.rate >= 0 &&
    x.rate <= 100 &&
    (x.band === "green" || x.band === "yellow" || x.band === "red") &&
    typeof x.reason === "string" &&
    x.reason.trim().length > 0 &&
    Array.isArray(x.points) &&
    x.points.length > 0
  );
}

/** 判定から証拠を作る。コマの番号が範囲の外なら外す */
export function evidenceOf(card: CardBody, frames: number, reading: FormalReading, j: Judgement): Evidence {
  const points = j.points.filter((p) => card.statements.some((s) => s.id === p.id)).map((p) => ({ ...p, frame: p.frame !== null && p.frame >= 1 && p.frame <= frames ? p.frame : null }));
  const rate = rateOf(card.statements, points);
  const cited = [...new Set(points.flatMap((p) => (p.credit !== "none" && p.frame ? [p.frame] : [])))].sort((a, b) => a - b);
  const reason = j.dangerous && j.danger_reason ? `${j.summary}（危ない読み違い: ${j.danger_reason}）` : j.summary;
  return { agent: AGENT, model: VERIFIER_MODEL, frames, cited, rate, band: bandOf(rate, j.dangerous), dangerous: j.dangerous, reason, points, reading };
}

/** 1 枚を確かめる: コマの絵だけを読ませ、文 1 つずつと照らし、証拠を返す */
export async function verifyCard(deps: GuardedDeps, purpose: Purpose, card: CardBody, images: ImageBlock[]): Promise<Evidence> {
  if (images.length < 1) throw new Error("確かめるコマが無い");
  const reading = json<FormalReading>(await guardedCall(deps, { purpose, label: "確かめる AI（正式・読む）", params: readParams(images) }), "絵の読み");
  const j = json<Judgement>(await guardedCall(deps, { purpose, label: "確かめる AI（正式・照らす）", params: judgeParams(card.statements, reading) }), "照らし合わせ");
  return evidenceOf(card, images.length, reading, j);
}

export const isRedEvidence = (e: Evidence) => e.band === "red";
