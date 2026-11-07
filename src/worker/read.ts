// 新入社員の閲覧の入口（028）。署名済みのカードだけを返す。未署名・停止のカードは一覧にも 1 枚の取得にも出ない。
// 署名済みでも、署名の記録（⑤）が無いか、署名のあとに中身か版が変わったカードは出さない（052）。
// 見た印（088）: 新入社員が 1 枚を見たら /cards/:id/seen に送り、版ごと・役割のしるしごとに記録する（発行の画面で見た人の一覧になる）。
// 人は 1 人ずつ区別しない。役割と端末の番号（画面が乱数で作る 16 文字）の単位までにする。名前を集めると本人の同意が要るため（088 の残り）
// 返すのは見るのに要るもの（守ること・なぜ・言葉・動き・コマ）だけで、経路や部品の理由は返さない。
import { Hono } from "hono";
import { bundleSort, type CardBody, weightOf } from "../shared/card";
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

/** 本文が読めない枚は intactOnly（signIntact）で先に外れる。ここでは読めたものだけを形にする */
const view = (r: Row) => {
  const b = JSON.parse(r.body) as CardBody;
  // 言葉はやさしい日本語だけを渡す（11/5 作者）。監修者が確かめられない訳は、新入社員に届けない。vi はデータに残す
  // 重さ（無ければ normal）・束（順番・枚数・親の決まり）・形（原則の 1 コマか）は 11/7 から
  return {
    id: r.id,
    rule: b.rule,
    why: b.why,
    words: b.words ? { ja: b.words.ja } : null,
    motion: b.motion,
    frames: b.frames,
    weight: weightOf(b),
    bundle: b.bundle ?? null,
    shape: b.shape ?? "story",
  };
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

interface Pair {
  good: string;
  bad: string;
}

/** ○× の組（11/7）。相手の枚も署名が崩れていないときだけ付ける。片方だけ見えると「×」の枚が説明なしに出るため */
async function pairsOf(db: D1Database, tenantId: string, shown: Set<string>): Promise<Map<string, Pair>> {
  const { results } = await db.prepare("SELECT good_card AS good, bad_card AS bad FROM card_pairs WHERE tenant_id = ?").bind(tenantId).all<Pair>();
  const out = new Map<string, Pair>();
  for (const p of results) {
    if (!shown.has(p.good) || !shown.has(p.bad)) continue;
    out.set(p.good, p);
    out.set(p.bad, p);
  }
  return out;
}

read.get("/cards", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, body, version, updated_at FROM cards WHERE tenant_id = ? AND status = 'signed' ORDER BY created_at, id").bind(c.var.tenant.id).all<Row>();
  const kept = await intactOnly(c.env.DB, c.var.tenant.id, results);
  const pairs = await pairsOf(c.env.DB, c.var.tenant.id, new Set(kept.map((r) => r.id)));
  // 束の枚は、束の最初の 1 枚の場所に順番どおりに並べる（11/7）
  return c.json({ cards: bundleSort(kept.map((r) => ({ ...view(r), pair: pairs.get(r.id) ?? null })), (v) => v) });
});

read.get("/cards/:id", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, body, version, updated_at FROM cards WHERE id = ? AND tenant_id = ? AND status = 'signed'").bind(c.req.param("id"), c.var.tenant.id).first<Row>();
  const [ok] = r ? await intactOnly(c.env.DB, c.var.tenant.id, [r]) : [];
  if (!ok) return c.json({ error: "カードが無い" }, 404);
  const p = await c.env.DB.prepare("SELECT good_card AS good, bad_card AS bad FROM card_pairs WHERE tenant_id = ? AND (good_card = ? OR bad_card = ?)").bind(c.var.tenant.id, ok.id, ok.id).first<Pair>();
  let pair: Pair | null = null;
  if (p) {
    const other = await c.env.DB.prepare("SELECT id, body, version, updated_at FROM cards WHERE id = ? AND tenant_id = ? AND status = 'signed'").bind(p.good === ok.id ? p.bad : p.good, c.var.tenant.id).first<Row>();
    if (other && (await intactOnly(c.env.DB, c.var.tenant.id, [other])).length) pair = p;
  }
  return c.json({ ...view(ok), pair });
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
