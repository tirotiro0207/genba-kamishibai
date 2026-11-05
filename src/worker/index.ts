import { Hono } from "hono";
import type { Env } from "./env";
import { audit } from "./audit";
import { cards } from "./cards";
import { demo, publicGate } from "./demo";
import { extract } from "./extract";
import { files } from "./files";
import { mcpApp } from "./mcp";
import { pairs } from "./pairs";
import { reset } from "./reset";
import { trials } from "./trials";
import { signSession, tenantGuard, type TenantRow, type TenantVars, verifyPin, verifySession } from "./tenant";
import { auditGate, cardsGate, NO_SECRET, noNewhireGate, type PeopleVars, people, personGuard, roleRequiredGate } from "./people";
import { issue } from "./issue";
import { queue } from "./queue";
import { read } from "./read";

export const app = new Hono<{ Bindings: Env; Variables: PeopleVars }>();

app.get("/api/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT count(*) AS n FROM tenants").first<{ n: number }>();
  return c.json({ ok: true, tenants: row?.n ?? 0 });
});

// 入口の画面（11/5 作者）で「@ のあと」に打った名前から、テナントの ID を引く。名前は英小文字・数字・- だけ。
// 会社のテナントだけを答える（練習用・架空の会社はゲストの入口から入る）
app.get("/api/handle/:handle", async (c) => {
  const h = c.req.param("handle");
  if (!/^[a-z0-9-]{1,40}$/.test(h)) return c.json({ error: "名前は英小文字・数字・- で入れてください" }, 400);
  const t = await c.env.DB.prepare("SELECT id FROM tenants WHERE handle = ? AND kind = 'company'").bind(h).first<{ id: string }>();
  if (!t) return c.json({ error: "その名前の会社は見つかりません" }, 404);
  return c.json({ tenant: t.id });
});

// 会社のテナントに PIN で入る
app.post("/api/t/:tenant/session", async (c) => {
  const t = await c.env.DB.prepare("SELECT id, kind, name, pin_hash FROM tenants WHERE id = ?").bind(c.req.param("tenant")).first<TenantRow>();
  if (!t || t.kind !== "company" || !t.pin_hash) return c.json({ error: "PIN の要らないテナント" }, 400);
  const { pin } = await c.req.json<{ pin?: string }>().catch(() => ({ pin: undefined }));
  if (typeof pin !== "string" || !(await verifyPin(pin, t.pin_hash))) return c.json({ error: "PIN が違う" }, 401);
  if (!c.env.SESSION_SECRET) return c.json({ error: NO_SECRET }, 503);
  return c.json({ token: await signSession(c.env.SESSION_SECRET, t.id) });
});

// PIN が要るテナントか、送った入ったしるしがまだ効くかを 200 で返す（総点検の 2・9）。
// 画面は先にこれを見て、PIN の画面を出すかを決める（入る前に 401 を出さない）
app.get("/api/t/:tenant/session", async (c) => {
  const t = await c.env.DB.prepare("SELECT id, kind FROM tenants WHERE id = ?").bind(c.req.param("tenant")).first<{ id: string; kind: string }>();
  if (!t) return c.json({ error: "テナントが無い" }, 404);
  if (t.kind !== "company") return c.json({ pin: false, valid: true });
  const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return c.json({ pin: true, valid: !!c.env.SESSION_SECRET && !!token && (await verifySession(c.env.SESSION_SECRET, token, t.id)) });
});

app.use("/api/t/:tenant/*", tenantGuard);
// 公開デモ（093b）。本番では練習用と架空の会社は見るだけで、作るのは /api/demo/make だけ
app.use("/api/t/:tenant/*", publicGate);
app.route("/api/demo", demo);
// 役割（030b）。署名・停止は監修者だけ、新入社員はカードの API に入れない
app.use("/api/t/:tenant/*", personGuard);
// 会社のテナントは、PIN で入ったうえで役割のしるしが要る（052 の続き）
app.use("/api/t/:tenant/*", roleRequiredGate);
app.use("/api/t/:tenant/cards", cardsGate);
app.use("/api/t/:tenant/cards/*", cardsGate);
app.use("/api/t/:tenant/audit/*", auditGate);
// 新入社員が使わない口（052）。データを戻す・回答の記録・○× の組・確認待ちの列と仕分け（061）は、新入社員の役割では開かない
for (const part of ["reset", "trials", "pairs", "queue", "sort"]) {
  app.use(`/api/t/:tenant/${part}`, noNewhireGate);
  app.use(`/api/t/:tenant/${part}/*`, noNewhireGate);
}
app.route("/api/t/:tenant", people);
// 新入社員の閲覧（028）。署名済みのカードだけ
app.route("/api/t/:tenant/read", read);
// 発行の管理（088）。監修者と教育担当が、署名済みの一覧・見た人・回収の知らせ・週の抜き取りを見る
app.route("/api/t/:tenant/issue", issue);

app.route("/api/t/:tenant/cards", cards);
// 確認待ちの列と仕分けの入れ替え（061）
app.route("/api/t/:tenant", queue);
app.route("/api/t/:tenant/audit", audit);
app.route("/api/t/:tenant/reset", reset);
app.route("/api/t/:tenant/files", files);
app.route("/api/t/:tenant/extract", extract);
app.route("/api/t/:tenant/trials", trials);
// ○× の組（093a）
app.route("/api/t/:tenant/pairs", pairs);
// MCP サーバー（092）。会社ごとの鍵で入り、中で上の API を作者の役で呼ぶ
app.route("/mcp", mcpApp(app));

export default app;
