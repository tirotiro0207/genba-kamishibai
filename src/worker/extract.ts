// 抜き出しの画面の API（033）。入れた文から、決まりと「どこから」を取り出して残す。人は画面で確かめて OK を付ける。
// OK の記録は追記だけで、最後のものを使う（034a はここから作る）。新入社員の役割では使えない。
import { Hono } from "hono";
import { guardedCall } from "../shared/claude";
import { parseRules, rulesParams } from "../shared/extract/rules";
import { D1CallLog } from "./api-log";
import { claudeClient } from "./claude-client";
import type { Env } from "./env";
import type { PeopleVars } from "./people";

export const MAX_INPUT_CHARS = 20_000;

/** 入れたもの。資料なら資料の名前とページ（ページごとの行の数で、渡した行を元のページと行に戻す）、話した言葉なら speech */
export type InputSource = { kind: "doc"; doc: string; pages: { page: number; lines: number }[] } | { kind: "speech" };

export const extract = new Hono<{ Bindings: Env; Variables: PeopleVars }>();

extract.use("*", async (c, next) => {
  if (c.var.person?.role === "newhire") return c.json({ error: "新入社員は使えない" }, 403);
  await next();
});

function validSource(s: unknown, lines: number): s is InputSource {
  const x = s as InputSource;
  if (x?.kind === "speech") return true;
  if (x?.kind !== "doc" || typeof x.doc !== "string" || !x.doc || !Array.isArray(x.pages) || !x.pages.length) return false;
  return x.pages.every((p) => Number.isInteger(p?.page) && p.page >= 1 && Number.isInteger(p?.lines) && p.lines >= 0) && x.pages.reduce((s, p) => s + p.lines, 0) === lines;
}

/** 渡した行の番号 → 元のページと行 */
export function whereIs(source: InputSource, n: number): { page: number | null; line: number } {
  if (source.kind !== "doc") return { page: null, line: n };
  let rest = n;
  for (const p of source.pages) {
    if (rest <= p.lines) return { page: p.page, line: rest };
    rest -= p.lines;
  }
  return { page: null, line: n };
}

extract.post("/", async (c) => {
  const b = await c.req.json<{ text?: unknown; focus?: unknown; source?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  const text = typeof b.text === "string" ? b.text.replaceAll("\r\n", "\n").trim() : "";
  if (!text || text.length > MAX_INPUT_CHARS) return c.json({ error: `文は 1〜${MAX_INPUT_CHARS} 字` }, 400);
  const source = (b.source ?? { kind: "speech" }) as InputSource;
  if (!validSource(source, text.split("\n").length)) return c.json({ error: "source が文の行の数と合わない" }, 400);
  const focus = typeof b.focus === "string" && b.focus.trim() ? b.focus.trim().slice(0, 300) : undefined;
  const client = claudeClient(c.env);
  if (!client) return c.json({ error: "Claude の鍵が無い" }, 503);
  const msg = await guardedCall({ client, log: new D1CallLog(c.env.DB) }, { purpose: "app", label: "取り出し（画面）", params: rulesParams(text, focus) });
  const rules = parseRules(msg, text).map((r) => ({
    ...r,
    where: whereIs(source, r.from.line),
    reasons: r.reasons.map((x) => ({ ...x, where: whereIs(source, x.from.line) })),
  }));
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO extractions (id, tenant_id, input, rules) VALUES (?, ?, ?, ?)").bind(id, c.var.tenant.id, JSON.stringify({ text, focus: focus ?? null, source }), JSON.stringify(rules)).run();
  return c.json({ id, rules }, 201);
});

async function getExtraction(db: D1Database, tenantId: string, id: string) {
  const r = await db.prepare("SELECT id, input, rules, created_at FROM extractions WHERE id = ? AND tenant_id = ?").bind(id, tenantId).first<{ id: string; input: string; rules: string; created_at: string }>();
  if (!r) return null;
  const ok = await db.prepare("SELECT items FROM extraction_oks WHERE extraction_id = ? ORDER BY seq DESC LIMIT 1").bind(id).first<{ items: string }>();
  return { id: r.id, created_at: r.created_at, input: JSON.parse(r.input), rules: JSON.parse(r.rules) as unknown[], ok: ok ? (JSON.parse(ok.items) as number[]) : [] };
}
export { getExtraction };

extract.get("/:id", async (c) => {
  const x = await getExtraction(c.env.DB, c.var.tenant.id, c.req.param("id"));
  return x ? c.json(x) : c.json({ error: "無い" }, 404);
});

extract.post("/:id/ok", async (c) => {
  const x = await getExtraction(c.env.DB, c.var.tenant.id, c.req.param("id"));
  if (!x) return c.json({ error: "無い" }, 404);
  const b = await c.req.json<{ items?: unknown }>().catch(() => ({}) as { items?: unknown });
  const items = b.items;
  if (!Array.isArray(items) || !items.every((i) => Number.isInteger(i) && i >= 0 && i < x.rules.length) || new Set(items).size !== items.length) return c.json({ error: "items は決まりの番号の並び" }, 400);
  const actor = c.var.person ? `${c.var.person.role}${c.var.person.slot}` : "unknown";
  await c.env.DB.prepare("INSERT INTO extraction_oks (extraction_id, tenant_id, items, actor) VALUES (?, ?, ?, ?)").bind(x.id, c.var.tenant.id, JSON.stringify([...items].sort((a, b) => a - b)), actor).run();
  return c.json({ ok: [...items].sort((a, b) => a - b) }, 201);
});
