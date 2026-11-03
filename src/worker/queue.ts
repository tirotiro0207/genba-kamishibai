// 確認待ちの列と、仕分けの入れ替え（061）。
// GET /queue は確認待ちのカードを赤から先に並べて返す（並びは src/shared/queue.ts）。
// GET /sort はそのテナントの最後の夜間の仕分け（023）のページの一覧、PUT /sort/:run/:page は監修者が「カードにする／しない」を入れ替えて保存する。
// 最初の AI の答えは ai_card に残し、入れ替えた人（役割のしるし）・時刻・理由を足す
import { Hono } from "hono";
import type { CardBody } from "../shared/card";
import { QUEUE_STATUSES, queueOrder } from "../shared/queue";
import { type CardRow, currentEvidence } from "./cards";
import type { Env } from "./env";
import type { PeopleVars } from "./people";
import { actorOf } from "./sign";

export const queue = new Hono<{ Bindings: Env; Variables: PeopleVars }>();

queue.get("/queue", async (c) => {
  const db = c.env.DB;
  const tid = c.var.tenant.id;
  const marks = QUEUE_STATUSES.map(() => "?").join(", ");
  const { results } = await db
    .prepare(`SELECT id, tenant_id, body, status, version, created_at, updated_at, ask FROM cards WHERE tenant_id = ? AND status IN (${marks})`)
    .bind(tid, ...QUEUE_STATUSES)
    .all<CardRow>();
  const items = await Promise.all(
    results.map(async (r) => {
      const e = await currentEvidence(db, tid, r);
      return { id: r.id, status: r.status, band: e?.band ?? null, dangerous: e?.dangerous ?? false, rate: e?.rate ?? null, created_at: r.created_at, rule: (JSON.parse(r.body) as CardBody).rule };
    }),
  );
  return c.json({ cards: queueOrder(items) });
});

const PAGE_COLS = "page, state, card, ai_card, reason, swapped_by, swapped_at, swap_reason";
type PageRow = { page: number; state: string; card: number | null; ai_card: number | null; reason: string | null; swapped_by: string | null; swapped_at: string | null; swap_reason: string | null };
const bool = (n: number | null) => (n === null ? null : n === 1);
const pageView = (p: PageRow) => ({ ...p, card: bool(p.card), ai_card: bool(p.ai_card ?? p.card) });
const pageOf = (db: D1Database, runId: string, tid: string, page: number) =>
  db.prepare(`SELECT ${PAGE_COLS} FROM night_pages WHERE run_id = ? AND tenant_id = ? AND page = ?`).bind(runId, tid, page).first<PageRow>();

queue.get("/sort", async (c) => {
  const tid = c.var.tenant.id;
  const want = c.req.query("run");
  const run = await c.env.DB.prepare(`SELECT id, doc, pages, finished_at FROM night_runs WHERE tenant_id = ? ${want ? "AND id = ?" : ""} ORDER BY started_at DESC, id DESC LIMIT 1`)
    .bind(...(want ? [tid, want] : [tid]))
    .first<{ id: string; doc: string; pages: number; finished_at: string | null }>();
  if (!run) return c.json({ run: null, pages: [] });
  const { results } = await c.env.DB.prepare(`SELECT ${PAGE_COLS} FROM night_pages WHERE run_id = ? AND tenant_id = ? ORDER BY page`).bind(run.id, tid).all<PageRow>();
  return c.json({ run, pages: results.map(pageView) });
});

queue.put("/sort/:run/:page", async (c) => {
  const p = c.var.person;
  if (p?.role !== "supervisor") return c.json({ error: "仕分けを入れ替えるのは監修者だけ" }, 403);
  const b = await c.req.json<{ card?: unknown; reason?: unknown }>().catch(() => ({}) as { card?: unknown; reason?: unknown });
  if (typeof b.card !== "boolean") return c.json({ error: "card は true か false" }, 400);
  if (b.reason !== undefined && typeof b.reason !== "string") return c.json({ error: "理由は文で" }, 400);
  const tid = c.var.tenant.id;
  const runId = c.req.param("run");
  const page = Number(c.req.param("page"));
  const row = await pageOf(c.env.DB, runId, tid, page);
  if (!row) return c.json({ error: "そのページが無い" }, 404);
  if (row.state !== "done") return c.json({ error: "まだ仕分けが済んでいないページ" }, 409);
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 300) || null : null;
  await c.env.DB.prepare("UPDATE night_pages SET ai_card = coalesce(ai_card, card), card = ?, swapped_by = ?, swapped_at = datetime('now'), swap_reason = ? WHERE run_id = ? AND tenant_id = ? AND page = ?")
    .bind(b.card ? 1 : 0, actorOf(p), reason, runId, tid, page)
    .run();
  return c.json(pageView((await pageOf(c.env.DB, runId, tid, page))!));
});
