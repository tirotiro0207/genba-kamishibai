// 会社の言葉の保存（085・§5 L1 ③）。テナントごとに D1 の company_words に積む。ほかの会社の言葉とは混ぜない（§5 L6）
import { AVOID_FROM_REPHRASE, type CompanyWord, wordsFromChange } from "../shared/company-words";

/** 同じ言葉は 1 行にまとめ、積んだ回数（hits）を足す */
export async function addCompanyWords(db: D1Database, tenantId: string, words: CompanyWord[], source: "glossary" | "edit", cardId: string) {
  if (!words.length) return;
  await db.batch(
    words.map((w) =>
      db
        .prepare(
          `INSERT INTO company_words (tenant_id, kind, phrase, prefer, source, last_card_id) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(tenant_id, kind, phrase, prefer) DO UPDATE SET hits = hits + 1, last_card_id = excluded.last_card_id, updated_at = datetime('now')`,
        )
        .bind(tenantId, w.kind, w.phrase.slice(0, 80), w.prefer.slice(0, 120), source, cardId),
    ),
  );
}

/** 用語表に積んだ言葉を、会社の呼び方として積む */
export const callsFromTerms = (terms: { ja: string; vi: string }[]): CompanyWord[] => terms.map((t) => ({ kind: "call", phrase: t.ja, prefer: t.vi }));

/** 人の直し（050 の before・after）から、言い換えと使わない言い方を積む */
export async function addEditWords(db: D1Database, tenantId: string, cardId: string, before: Record<string, unknown>, after: Record<string, unknown>) {
  await addCompanyWords(db, tenantId, wordsFromChange(before, after), "edit", cardId);
}

export interface CompanyWordRow {
  kind: CompanyWord["kind"];
  phrase: string;
  prefer: string;
  hits: number;
}

/** 呼び方・言い換え・使わない言い方の 3 つに分けて返す。2 回以上言い換えられた言い方は、使わない言い方にも出す */
export async function listCompanyWords(db: D1Database, tenantId: string) {
  const { results } = await db
    .prepare("SELECT kind, phrase, prefer, hits FROM company_words WHERE tenant_id = ? ORDER BY hits DESC, phrase")
    .bind(tenantId)
    .all<CompanyWordRow>();
  const avoid = results.filter((r) => r.kind === "avoid");
  const seen = new Set(avoid.map((r) => r.phrase));
  for (const r of results)
    if (r.kind === "rephrase" && r.hits >= AVOID_FROM_REPHRASE && !seen.has(r.phrase)) avoid.push({ ...r, kind: "avoid", prefer: "" }), seen.add(r.phrase);
  return { call: results.filter((r) => r.kind === "call"), rephrase: results.filter((r) => r.kind === "rephrase"), avoid };
}
