// 新入社員の閲覧の入口（028）。署名済みのカードだけを返す。未署名・停止のカードは一覧にも 1 枚の取得にも出ない。
// 署名済みでも、署名の記録（⑤）が無いか、署名のあとに中身か版が変わったカードは出さない（052）。
// 見た印（088）: 新入社員が 1 枚を見たら /cards/:id/seen に送り、版ごと・役割のしるしごとに記録する（発行の画面で見た人の一覧になる）。
// 人は 1 人ずつ区別しない。役割と端末の番号（画面が乱数で作る 16 文字）の単位までにする。名前を集めると本人の同意が要るため（088 の残り）
// 返すのは見るのに要るもの（守ること・なぜ・言葉・動き・コマ）だけで、経路や部品の理由は返さない。
import { Hono } from "hono";
import type { CardBody } from "../shared/card";
import type { Env } from "./env";
import type { PeopleVars } from "./people";
import { recordView } from "./recall";
import { actorOf, signIntact } from "./sign";

export const read = new Hono<{ Bindings: Env; Variables: PeopleVars }>();

/** 端末の番号の形。形が違えば役割だけで記録する */
const DEVICE = /^[0-9a-f]{16}$/;

interface Row {
  id: string;
  body: string;
  version: number;
  updated_at: string;
}

const view = (r: Row) => {
  const b = JSON.parse(r.body) as CardBody;
  // 言葉はやさしい日本語だけを渡す（11/5 作者）。監修者が確かめられない訳は、新入社員に届けない。vi はデータに残す
  return { id: r.id, rule: b.rule, why: b.why, words: b.words ? { ja: b.words.ja } : null, motion: b.motion, frames: b.frames };
};

/** 署名済みで、最後の署名の行と今の中身・版が合うカードだけ残す */
async function intactOnly(db: D1Database, tenantId: string, rows: Row[]): Promise<Row[]> {
  if (!rows.length) return [];
  const { results } = await db.prepare("SELECT card_id, payload FROM audit_log WHERE tenant_id = ? AND kind = 'sign' ORDER BY created_at, n").bind(tenantId).all<{ card_id: string; payload: string }>();
  const last = new Map(results.map((x) => [x.card_id, x.payload]));
  const keep: Row[] = [];
  for (const r of rows) {
    const p = last.get(r.id);
    if (p && (await signIntact(r, p))) keep.push(r);
  }
  return keep;
}

read.get("/cards", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, body, version, updated_at FROM cards WHERE tenant_id = ? AND status = 'signed' ORDER BY created_at, id").bind(c.var.tenant.id).all<Row>();
  return c.json({ cards: (await intactOnly(c.env.DB, c.var.tenant.id, results)).map(view) });
});

read.get("/cards/:id", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, body, version, updated_at FROM cards WHERE id = ? AND tenant_id = ? AND status = 'signed'").bind(c.req.param("id"), c.var.tenant.id).first<Row>();
  const [ok] = r ? await intactOnly(c.env.DB, c.var.tenant.id, [r]) : [];
  return ok ? c.json(view(ok)) : c.json({ error: "カードが無い" }, 404);
});

read.post("/cards/:id/seen", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, body, version, updated_at FROM cards WHERE id = ? AND tenant_id = ? AND status = 'signed'").bind(c.req.param("id"), c.var.tenant.id).first<Row>();
  const [ok] = r ? await intactOnly(c.env.DB, c.var.tenant.id, [r]) : [];
  if (!ok) return c.json({ error: "カードが無い" }, 404);
  const { device } = await c.req.json<{ device?: unknown }>().catch(() => ({ device: undefined }));
  const actor = actorOf(c.var.person) + (typeof device === "string" && DEVICE.test(device) ? `#${device}` : "");
  await recordView(c.env.DB, c.var.tenant.id, ok.id, ok.version, actor);
  return c.json({ seen: true, version: ok.version });
});
