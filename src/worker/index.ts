import { Hono } from "hono";
import type { Env } from "./env";
import { audit } from "./audit";
import { cards } from "./cards";
import { reset } from "./reset";
import { trials } from "./trials";
import { signSession, tenantGuard, type TenantRow, type TenantVars, verifyPin } from "./tenant";
import { cardsGate, type PeopleVars, people, personGuard } from "./people";

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
app.use("/api/t/:tenant/cards", cardsGate);
app.use("/api/t/:tenant/cards/*", cardsGate);
app.route("/api/t/:tenant", people);

app.route("/api/t/:tenant/cards", cards);
app.route("/api/t/:tenant/audit", audit);
app.route("/api/t/:tenant/reset", reset);
app.route("/api/t/:tenant/trials", trials);

export default app;
