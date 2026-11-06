// 手本の渡し方（086・§5 L3・L6）とセッションの後片付け（§5 L4）。どの読み書きもテナントで絞る。
// 手本は同じテナントの、同じカテゴリのカードだけから集める（ほかの会社の差分・カード・言葉は渡さない）
import Anthropic from "@anthropic-ai/sdk";
import type { CardBody } from "../shared/card";
import { type Category, categoryOf, EXEMPLAR_LIMITS, type ExemplarCard, type ExemplarEdit, type Exemplars, type UsedExemplar, usedOf } from "../shared/exemplars";
import { listCompanyWords } from "./company-words";
import type { Env } from "./env";

interface Row {
  card_id: string;
  body: string;
}

/** 手本の直しを探すときに読む直しの行の数（新しい順）。カードが増えても 1 回に全件を読まない */
export const EDIT_SCAN_MAX = 500;

/** 同じテナントの今あるカードのうち、カテゴリが同じものの番号（作るカード自身は除く） */
async function sameCategory(db: D1Database, tenantId: string, category: Category, except?: string) {
  const { results } = await db.prepare("SELECT id AS card_id, body FROM cards WHERE tenant_id = ?").bind(tenantId).all<Row>();
  return new Set(results.filter((r) => r.card_id !== except && categoryOf((JSON.parse(r.body) as CardBody).rule) === category).map((r) => r.card_id));
}

/** 新しいカード（決まりの文 text）を作るときの手本を集める。limits は件数 */
export async function gatherExemplars(db: D1Database, tenantId: string, text: string, limits: { edits: number; cards: number; words: number } = EXEMPLAR_LIMITS, except?: string): Promise<Exemplars> {
  const category = categoryOf(text);
  const ids = await sameCategory(db, tenantId, category, except);
  // ② 人の直し: 文の欄を直した行（枠と指示の依頼・作り直しの行は除く）。新しい順
  const { results: edits } = await db
    .prepare("SELECT card_id, actor, payload, created_at FROM audit_log WHERE tenant_id = ? AND kind = 'edit' AND json_extract(payload, '$.request') IS NULL ORDER BY created_at DESC, n DESC LIMIT ?")
    .bind(tenantId, EDIT_SCAN_MAX)
    .all<{ card_id: string; actor: string; payload: string; created_at: string }>();
  const e: ExemplarEdit[] = [];
  for (const r of edits) {
    if (e.length >= limits.edits) break;
    if (!ids.has(r.card_id)) continue;
    const p = JSON.parse(r.payload) as { fields?: string[]; before?: Record<string, unknown>; after?: Record<string, unknown>; reason?: string; by?: string; edited_at?: string };
    if (!p.fields?.length) continue;
    e.push({ card_id: r.card_id, fields: p.fields, before: p.before ?? {}, after: p.after ?? {}, reason: p.reason ?? "", by: p.by ?? r.actor, at: p.edited_at ?? r.created_at });
  }
  // ① 署名済みのカード: 今も署名済みのものだけ。新しい順
  const { results: signs } = await db
    .prepare(
      "SELECT a.card_id, a.actor, a.created_at, c.body FROM audit_log a JOIN cards c ON c.id = a.card_id AND c.tenant_id = a.tenant_id WHERE a.tenant_id = ? AND a.kind = 'sign' AND c.status = 'signed' ORDER BY a.created_at DESC, a.n DESC",
    )
    .bind(tenantId)
    .all<{ card_id: string; actor: string; created_at: string; body: string }>();
  const cards: ExemplarCard[] = [];
  const seen = new Set<string>();
  for (const r of signs) {
    if (cards.length >= limits.cards) break;
    if (!ids.has(r.card_id) || seen.has(r.card_id)) continue;
    seen.add(r.card_id);
    const b = JSON.parse(r.body) as CardBody;
    cards.push({ card_id: r.card_id, rule: b.rule, why: b.why, by: r.actor, at: r.created_at });
  }
  // ③ 会社の言葉: テナントの言葉を回数の多い順に
  const w = await listCompanyWords(db, tenantId);
  const words = [...w.call, ...w.rephrase, ...w.avoid]
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limits.words)
    .map((x) => ({ kind: x.kind, phrase: x.phrase, prefer: x.prefer }));
  return { category, edits: e, cards, words };
}

/** 手本に使ったものを、作ったカードに結び付けて残す（087 の表示に使う） */
export async function recordExemplars(db: D1Database, tenantId: string, cardId: string, ex: Exemplars) {
  const used = usedOf(ex);
  if (!used.length) return;
  await db.batch(
    used.map((u) => db.prepare("INSERT OR IGNORE INTO card_exemplars (tenant_id, card_id, kind, src_card_id, by, at) VALUES (?, ?, ?, ?, ?, ?)").bind(tenantId, cardId, u.kind, u.src_card_id, u.by, u.at)),
  );
}

export async function listUsedExemplars(db: D1Database, tenantId: string, cardId: string): Promise<UsedExemplar[]> {
  const { results } = await db
    .prepare("SELECT kind, src_card_id, by, at FROM card_exemplars WHERE tenant_id = ? AND card_id = ? ORDER BY kind DESC, at DESC")
    .bind(tenantId, cardId)
    .all<UsedExemplar>();
  return results;
}

/** カードに結び付いた Managed Agents のセッションを残す（作った側が呼ぶ） */
export async function addCardSession(db: D1Database, tenantId: string, cardId: string, sessionId: string) {
  await db.prepare("INSERT OR IGNORE INTO card_sessions (tenant_id, card_id, session_id) VALUES (?, ?, ?)").bind(tenantId, cardId, sessionId).run();
}

export type DeleteSession = (id: string) => Promise<void>;

/**
 * 署名済みになったカードのセッションを消し、消した時刻を残す（§5 L4）。消すための鍵が無ければ消さずに残す（次の署名か手で消す）。
 * 消すのに失敗したものは、理由を残して次に回す
 */
export async function cleanupCardSessions(db: D1Database, tenantId: string, cardId: string, del: DeleteSession | null) {
  const { results } = await db
    .prepare("SELECT session_id FROM card_sessions WHERE tenant_id = ? AND card_id = ? AND deleted_at IS NULL")
    .bind(tenantId, cardId)
    .all<{ session_id: string }>();
  const out = { deleted: 0, failed: 0, left: 0 };
  for (const r of results) {
    if (!del) {
      out.left++;
      continue;
    }
    try {
      await del(r.session_id);
      await db.prepare("UPDATE card_sessions SET deleted_at = datetime('now'), error = NULL WHERE tenant_id = ? AND session_id = ?").bind(tenantId, r.session_id).run();
      out.deleted++;
    } catch (e) {
      await db.prepare("UPDATE card_sessions SET error = ? WHERE tenant_id = ? AND session_id = ?").bind(String((e as Error).message).slice(0, 200), tenantId, r.session_id).run();
      out.failed++;
    }
  }
  return out;
}

type DeleterFactory = (env: Env) => DeleteSession | null;
const realDeleter: DeleterFactory = (env) => {
  if (!env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0 });
  return async (id) => {
    await client.beta.sessions.delete(id);
  };
};
let deleter: DeleterFactory = realDeleter;

/** テストだけで使う。null を渡すと本物に戻す */
export function setSessionDeleter(f: DeleterFactory | null) {
  deleter = f ?? realDeleter;
}

export const sessionDeleter = (env: Env) => deleter(env);
