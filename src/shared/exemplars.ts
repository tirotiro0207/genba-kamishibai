// 手本の渡し方（086・§5 L3）。新しいカードを作るとき、同じ会社・同じカテゴリの直近の人の直し（② 差分）・
// 署名済みのカード（① 承認済み）・会社の言葉（③）を手本として渡す。別の会社のものは渡さない（§5 L6）。API は使わない。

/** カテゴリ。決まりの文の言葉から決める（AI を呼ばない）。最初に当たったものを使う */
export const CATEGORIES = ["electric", "height", "health", "tidy", "signal", "tools", "general"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  electric: "電気",
  height: "高い所",
  health: "体の具合",
  tidy: "整理・整頓",
  signal: "合図・声かけ",
  tools: "道具",
  general: "そのほか",
};

const WORDS: [Category, RegExp][] = [
  ["electric", /電気|電源|感電|検電|充電|停電|通電|活線|ブレーカー|主幹|分電盤|配電|制御盤|(?<![基碁円地岩旋])盤|漏電|絶縁|接地|アース|電線|ケーブル|コンセント/],
  ["height", /高所|高い所|墜落|転落|安全帯|ハーネス|はしご|脚立|足場|作業台|開口部|手すり|屋根|床の無い/],
  ["health", /体調|具合|熱中症|健康|疲れ|眠|酒|薬|けがをしたら|休憩/],
  ["tidy", /整理|整頓|清掃|片付け|片づけ|要るもの|要らないもの|通路|置き場/],
  ["signal", /指差|指さ|声に出|声をかけ|合図|呼称|確認の声|報告|連絡|相談|上の人に聞/],
  ["tools", /工具|道具|ドライバー|ペンチ|カッター|電動|保護めがね|手袋|ヘルメット|保護具/],
];

export function categoryOf(text: string): Category {
  for (const [c, re] of WORDS) if (re.test(text)) return c;
  return "general";
}

/** 手本の件数。本物のデータで試して決める（decisions に書く）。いまは仮の数 */
export const EXEMPLAR_LIMITS = { edits: 3, cards: 2, words: 12 } as const;

export interface ExemplarEdit {
  card_id: string;
  fields: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
  by: string;
  at: string;
}

export interface ExemplarCard {
  card_id: string;
  rule: string;
  why: string;
  by: string;
  at: string;
}

export interface ExemplarWord {
  kind: "call" | "rephrase" | "avoid";
  phrase: string;
  prefer: string;
}

export interface Exemplars {
  category: Category;
  edits: ExemplarEdit[];
  cards: ExemplarCard[];
  words: ExemplarWord[];
}

/** 欄の中身を短い文にする（キーフレームの数字は渡さない。文の欄だけ） */
const TEXT_FIELDS = ["rule", "why", "words"] as const;
function fieldText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "ja" in v) return String((v as { ja: unknown }).ja ?? "");
  return "";
}

/** 手本を、作成の指示に足す文にする。何も無ければ空 */
export function exemplarText(ex: Exemplars | null | undefined): string {
  if (!ex) return "";
  const out: string[] = [];
  const edits = ex.edits
    .map((e) => {
      const lines = e.fields
        .filter((f) => (TEXT_FIELDS as readonly string[]).includes(f))
        .map((f) => `  ${f}: 「${fieldText(e.before[f])}」→「${fieldText(e.after[f])}」`)
        .filter((l) => !l.endsWith("「」→「」"));
      return lines.length ? `- 直した理由: ${e.reason}\n${lines.join("\n")}` : "";
    })
    .filter(Boolean);
  if (edits.length) out.push(`この会社の監修者が前に直したこと（同じことを繰り返さない）:\n${edits.join("\n")}`);
  if (ex.cards.length) out.push(`この会社で署名済みのカード（書き方の手本）:\n${ex.cards.map((c) => `- 守ること: ${c.rule} / なぜ: ${c.why}`).join("\n")}`);
  const call = ex.words.filter((w) => w.kind === "call").map((w) => `${w.phrase}（${w.prefer}）`);
  const reph = ex.words.filter((w) => w.kind === "rephrase").map((w) => `「${w.phrase}」ではなく「${w.prefer}」`);
  const avoid = ex.words.filter((w) => w.kind === "avoid").map((w) => `「${w.phrase}」`);
  const words = [call.length ? `呼び方: ${call.join("、")}` : "", reph.length ? `言い換え: ${reph.join("、")}` : "", avoid.length ? `使わない言い方: ${avoid.join("、")}` : ""].filter(Boolean);
  if (words.length) out.push(`この会社の言葉:\n${words.join("\n")}`);
  return out.length ? `手本（${CATEGORY_LABEL[ex.category]}のカテゴリ）:\n${out.join("\n\n")}` : "";
}

/** 下書きの横に出す「前回の修正を手本にしました」の 1 件（087）。誰は役割と番号だけ */
export interface UsedExemplar {
  kind: "edit" | "card";
  src_card_id: string;
  by: string;
  at: string;
}

export function usedOf(ex: Exemplars): UsedExemplar[] {
  return [
    ...ex.edits.map((e) => ({ kind: "edit" as const, src_card_id: e.card_id, by: e.by, at: e.at })),
    ...ex.cards.map((c) => ({ kind: "card" as const, src_card_id: c.card_id, by: c.by, at: c.at })),
  ];
}

const ROLE_NAME: Record<string, string> = { supervisor: "監修者", trainer: "教育担当", author: "作者", newhire: "新入社員" };

/** 役割と番号（supervisor.1）を「監修者 1」にする。教育担当と作者は 1 人なので番号を付けない */
export function whoLabel(by: string): string {
  const [role, slot] = by.split(/[.:]/);
  const name = ROLE_NAME[role];
  if (!name) return by;
  return role === "supervisor" && slot ? `${name} ${slot}` : name;
}

/** 日付を日本時間の「11月3日」にする */
export function dayLabel(at: string): string {
  const d = new Date(Date.parse(at.includes("T") ? at : `${at.replace(" ", "T")}Z`) + 9 * 3600_000);
  return Number.isNaN(d.getTime()) ? at : `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

/** 下書きの横に出す 1 行（087・§5 L7）。直しを先に、無ければ署名済みのカード */
export function usedLine(used: UsedExemplar[]): string | null {
  const e = used.find((u) => u.kind === "edit");
  if (e) return `前回の修正（${dayLabel(e.at)}・${whoLabel(e.by)}）を手本にしました`;
  const c = used.find((u) => u.kind === "card");
  return c ? `署名済みのカード（${dayLabel(c.at)}・${whoLabel(c.by)}）を手本にしました` : null;
}
