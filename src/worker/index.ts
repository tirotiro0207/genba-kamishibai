import { Hono } from "hono";
import type { Env } from "./env";
import { audit } from "./audit";
import { cards } from "./cards";
import { extract } from "./extract";
import { files } from "./files";
import { mcpApp } from "./mcp";
import { pairs } from "./pairs";
import { reset } from "./reset";
import { trials } from "./trials";
import { signSession, tenantGuard, type TenantRow, type TenantVars, verifyPin } from "./tenant";
import { auditGate, cardsGate, noNewhireGate, type PeopleVars, people, personGuard, roleRequiredGate } from "./people";
import { issue } from "./issue";
import { read } from "./read";

export const app = new Hono<{ Bindings: Env; Variables: PeopleVars }>();

app.get("/api/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT count(*) AS n FROM tenants").first<{ n: number }>();
  return c.json({ ok: true, tenants: row?.n ?? 0 });
});

// 会社のテナントに PIN で入る
app.post("/api/t/:tenant/session", async (c) => {
  const t = await c.env.DB.prepare("SELECT id, kind, name, pin_hash FROM tenants WHERE id = ?").bind(c.req.param("tenant")).first<TenantRow>();
  if (!t || t.kind !== "company" || !t.pin_hash) return c.json({ error: "PIN の要らないテナント" }, 400);
  const { pin } = await c.req.json<{ pin?: string }>().catch(() => ({ pin: undefined }));
  if (typeof pin !== "string" || !(await verifyPin(pin, t.pin_hash))) return c.json({ error: "PIN が違う" }, 401);
  return c.json({ token: await signSession(c.env.SESSION_SECRET, t.id) });
});

app.use("/api/t/:tenant/*", tenantGuard);
// 役割（030b）。署名・停止は監修者だけ、新入社員はカードの API に入れない
app.use("/api/t/:tenant/*", personGuard);
// 会社のテナントは、PIN で入ったうえで役割のしるしが要る（052 の続き）
app.use("/api/t/:tenant/*", roleRequiredGate);
app.use("/api/t/:tenant/cards", cardsGate);
app.use("/api/t/:tenant/cards/*", cardsGate);
app.use("/api/t/:tenant/audit/*", auditGate);
// 新入社員が使わない口（052）。データを戻す・回答の記録・○× の組は、新入社員の役割では開かない
for (const part of ["reset", "trials", "pairs"]) {
  app.use(`/api/t/:tenant/${part}`, noNewhireGate);
  app.use(`/api/t/:tenant/${part}/*`, noNewhireGate);
}
app.route("/api/t/:tenant", people);
// 新入社員の閲覧（028）。署名済みのカードだけ
app.route("/api/t/:tenant/read", read);
// 発行の管理（088）。監修者と教育担当が、署名済みの一覧・見た人・回収の知らせ・週の抜き取りを見る
app.route("/api/t/:tenant/issue", issue);

app.route("/api/t/:tenant/cards", cards);
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
