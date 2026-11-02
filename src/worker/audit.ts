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
  await currentChain(db, tenantId);
  const row = await db.prepare("SELECT count(*) AS n FROM audit_chains WHERE tenant_id = ?").bind(tenantId).first<{ n: number }>();
  const chain = `c${(row?.n ?? 0) + 1}`;
  await db.prepare("INSERT INTO audit_chains (tenant_id, chain, started_at) VALUES (?, ?, ?)").bind(tenantId, chain, new Date().toISOString()).run();
  return chain;
}

export interface AuditInput {
  card_id: string | null;
  kind: AuditKind;
  actor: string;
  payload: unknown;
}

export async function appendAudit(db: D1Database, tenantId: string, input: AuditInput): Promise<AuditEntry> {
  const chain = await currentChain(db, tenantId);
  const payload = JSON.parse(canonical(input.payload ?? null));
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await db.prepare("SELECT n, hash FROM audit_log WHERE tenant_id = ? AND chain = ? ORDER BY n DESC LIMIT 1").bind(tenantId, chain).first<{ n: number; hash: string }>();
    const draft = { tenant_id: tenantId, chain, n: (last?.n ?? 0) + 1, card_id: input.card_id, kind: input.kind, actor: input.actor, payload, created_at: new Date().toISOString(), prev_hash: last?.hash ?? GENESIS };
    const hash = await entryHash(draft);
    try {
      await db.prepare("INSERT INTO audit_log (tenant_id, chain, n, card_id, kind, actor, payload, created_at, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(tenantId, chain, draft.n, draft.card_id, draft.kind, draft.actor, canonical(payload), draft.created_at, draft.prev_hash, hash)
        .run();
      return { ...draft, hash };
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
  const { results } = await c.env.DB.prepare("SELECT * FROM audit_log WHERE tenant_id = ? AND card_id = ? ORDER BY chain, n").bind(c.var.tenant.id, c.req.param("id")).all<AuditRow>();
  const entries = results.map(parse).map((e) => ({ ...e, step: AUDIT_STEP[e.kind] ?? null }));
  const v = await verifyTenant(c.env.DB, c.var.tenant.id);
  return c.json({ entries, chain_ok: v.ok });
});

audit.on(["PUT", "PATCH", "DELETE", "POST"], ["/", "/*"], (c) => c.json({ error: "記録は追記だけ（仕組みの中からだけ足す）" }, 405));
