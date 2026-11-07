// 監査の記録の読み書き（020）。追記は連鎖の最後の行のハッシュを読んでから 1 行足す。
// 同時に足されて番号がぶつかったら、読み直して足し直す。
import { Hono } from "hono";
import { AUDIT_STEP, type AuditEntry, type AuditKind, canonical, entryHash, GENESIS, verifyChain } from "../shared/audit";
import type { Env } from "./env";
import type { TenantVars } from "./tenant";

interface AuditRow extends Omit<AuditEntry, "payload"> {
  payload: string;
}

const parse = (r: AuditRow): AuditEntry => ({ ...r, payload: JSON.parse(r.payload) });

/** テナントのいまの連鎖。無ければ最初の連鎖を作る */
export async function currentChain(db: D1Database, tenantId: string): Promise<string> {
  const row = await db.prepare("SELECT chain FROM audit_chains WHERE tenant_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1").bind(tenantId).first<{ chain: string }>();
  if (row) return row.chain;
  await db.prepare("INSERT OR IGNORE INTO audit_chains (tenant_id, chain, started_at) VALUES (?, 'c1', ?)").bind(tenantId, new Date().toISOString()).run();
  return "c1";
}

/** 連鎖を新しく始める（025b のリセット）。古い連鎖は消さずに残り、確かめられる */
export async function startNewChain(db: D1Database, tenantId: string): Promise<string> {
  const chain = await nextChainName(db, tenantId);
  await newChainStatement(db, tenantId, chain).run();
  return chain;
}

/** 次に始める連鎖の名前（c と通し番号）。今の連鎖が無ければ先に作る */
export async function nextChainName(db: D1Database, tenantId: string): Promise<string> {
  await currentChain(db, tenantId);
  const row = await db.prepare("SELECT count(*) AS n FROM audit_chains WHERE tenant_id = ?").bind(tenantId).first<{ n: number }>();
  return `c${(row?.n ?? 0) + 1}`;
}

/** 連鎖を始める 1 文（ほかの文と 1 つのバッチにまとめるときに使う） */
export const newChainStatement = (db: D1Database, tenantId: string, chain: string) =>
  db.prepare("INSERT INTO audit_chains (tenant_id, chain, started_at) VALUES (?, ?, ?)").bind(tenantId, chain, new Date().toISOString());

export interface AuditInput {
  card_id: string | null;
  kind: AuditKind;
  actor: string;
  payload: unknown;
}

export async function appendAudit(db: D1Database, tenantId: string, input: AuditInput): Promise<AuditEntry> {
  return (await appendAuditWith(db, tenantId, input, null))!;
}

/**
 * 状態を移す 1 文（pre）と記録の 1 行を、1 つのバッチ（1 つのトランザクション）で書く。
 * post は同じバッチの末尾に足す文（回収の知らせなど。記録の行が入ったときだけ入る文にする）。
 * pre が 1 行も変えなければ記録は足さずに null を返す。記録が足せなければ pre も戻る（「移ったのに記録が無い」を作らない）
 */
export async function appendAuditIf(db: D1Database, tenantId: string, pre: D1PreparedStatement, input: AuditInput, post: D1PreparedStatement[] = []): Promise<AuditEntry | null> {
  return appendAuditWith(db, tenantId, input, pre, post);
}

async function appendAuditWith(db: D1Database, tenantId: string, input: AuditInput, pre: D1PreparedStatement | null, post: D1PreparedStatement[] = []): Promise<AuditEntry | null> {
  const chain = await currentChain(db, tenantId);
  const payload = JSON.parse(canonical(input.payload ?? null));
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await db.prepare("SELECT n, hash FROM audit_log WHERE tenant_id = ? AND chain = ? ORDER BY n DESC LIMIT 1").bind(tenantId, chain).first<{ n: number; hash: string }>();
    const draft = { tenant_id: tenantId, chain, n: (last?.n ?? 0) + 1, card_id: input.card_id, kind: input.kind, actor: input.actor, payload, created_at: new Date().toISOString(), prev_hash: last?.hash ?? GENESIS };
    const hash = await entryHash(draft);
    const values = [tenantId, chain, draft.n, draft.card_id, draft.kind, draft.actor, canonical(payload), draft.created_at, draft.prev_hash, hash];
    try {
      if (!pre) {
        await db.prepare("INSERT INTO audit_log (tenant_id, chain, n, card_id, kind, actor, payload, created_at, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(...values)
          .run();
        return { ...draft, hash };
      }
      // changes() は直前の文（pre）が変えた行の数。0 なら記録の行も足さない
      const [moved] = await db.batch([
        pre,
        db.prepare("INSERT INTO audit_log (tenant_id, chain, n, card_id, kind, actor, payload, created_at, prev_hash, hash) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() > 0").bind(...values),
        ...post,
      ]);
      return moved.meta.changes ? { ...draft, hash } : null;
    } catch (e) {
      if (!/UNIQUE|PRIMARY KEY/i.test(String(e))) throw e;
    }
  }
  throw new Error("監査の記録を足せない（番号がぶつかり続けた）");
}

export async function readChain(db: D1Database, tenantId: string, chain: string): Promise<AuditEntry[]> {
  const { results } = await db.prepare("SELECT * FROM audit_log WHERE tenant_id = ? AND chain = ? ORDER BY n").bind(tenantId, chain).all<AuditRow>();
  return results.map(parse);
}

/** テナントの連鎖を全部確かめる（古い連鎖も） */
export async function verifyTenant(db: D1Database, tenantId: string) {
  const { results } = await db.prepare("SELECT chain FROM audit_chains WHERE tenant_id = ? ORDER BY started_at, rowid").bind(tenantId).all<{ chain: string }>();
  const chains = [];
  for (const { chain } of results) chains.push({ chain, ...(await verifyChain(await readChain(db, tenantId, chain))) });
  return { ok: chains.every((c) => c.ok), chains };
}

export const audit = new Hono<{ Bindings: Env; Variables: TenantVars }>();

audit.get("/verify", async (c) => c.json(await verifyTenant(c.env.DB, c.var.tenant.id)));

// 1 枚のカードの記録を ①〜⑤ の順に（同じ番号の中は書いた順）
audit.get("/cards/:id", async (c) => {
  // 連鎖は始めた順（名前の文字の順だと c10 が c2 より前に来る）
  const { results } = await c.env.DB.prepare(
    "SELECT a.* FROM audit_log a JOIN audit_chains ch ON ch.tenant_id = a.tenant_id AND ch.chain = a.chain WHERE a.tenant_id = ? AND a.card_id = ? ORDER BY ch.started_at, ch.rowid, a.n",
  )
    .bind(c.var.tenant.id, c.req.param("id"))
    .all<AuditRow>();
  // 連鎖の確かめはテナント全部を読むので、ここではしない。画面は /verify を別に 1 回だけ呼ぶ（11/7）
  return c.json({ entries: results.map(parse).map((e) => ({ ...e, step: AUDIT_STEP[e.kind] ?? null })) });
});

audit.on(["PUT", "PATCH", "DELETE", "POST"], ["/", "/*"], (c) => c.json({ error: "記録は追記だけ（仕組みの中からだけ足す）" }, 405));
