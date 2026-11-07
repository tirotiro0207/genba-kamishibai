// 会社の言葉の画面の口（11/7）。AI が作る中で覚えた呼び方・言い換え・使わない言い方を、監修者が一覧で見て、間違いを消す。
// 新しい辞書は作らない。company_words（085）をそのまま読み、消すだけ。ほかの会社の言葉は見えない・消せない（テナントで絞る）。
// company_words は積むたびに回数を更新する表で、追記だけの表ではない（監査の連鎖はカード単位）。なので消すのは行そのものを消す
import { Hono } from "hono";
import type { Env } from "./env";
import { type PeopleVars, supervisorOnlyGate } from "./people";

export const words = new Hono<{ Bindings: Env; Variables: PeopleVars }>();
words.use("*", supervisorOnlyGate);

export interface WordRow {
  kind: "call" | "rephrase" | "avoid";
  phrase: string;
  prefer: string;
  source: "glossary" | "edit";
  hits: number;
  last_card_id: string | null;
  updated_at: string;
}

// 積んだままの行を返す（「2 回で使わない言い方にも出る」の足し算はしない。消せる行だけを並べる）
words.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT kind, phrase, prefer, source, hits, last_card_id, updated_at FROM company_words WHERE tenant_id = ? ORDER BY kind, hits DESC, phrase")
    .bind(c.var.tenant.id)
    .all<WordRow>();
  return c.json({ words: results });
});

// 1 行を消す。行は (kind, phrase, prefer) で決まる。無ければ 404
words.delete("/", async (c) => {
  const b = await c.req.json<{ kind?: unknown; phrase?: unknown; prefer?: unknown }>().catch(() => ({}) as { kind?: unknown; phrase?: unknown; prefer?: unknown });
  if (!["call", "rephrase", "avoid"].includes(b.kind as string) || typeof b.phrase !== "string" || typeof b.prefer !== "string") return c.json({ error: "種類と言葉が要る" }, 400);
  const r = await c.env.DB.prepare("DELETE FROM company_words WHERE tenant_id = ? AND kind = ? AND phrase = ? AND prefer = ?").bind(c.var.tenant.id, b.kind, b.phrase, b.prefer).run();
  return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "その言葉は無い" }, 404);
});
