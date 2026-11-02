import { Hono } from "hono";
import type { Env } from "./env";
import { signSession, tenantGuard, type TenantRow, type TenantVars, verifyPin } from "./tenant";

export const app = new Hono<{ Bindings: Env; Variables: TenantVars }>();

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

app.get("/api/t/:tenant/cards", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, body, created_at FROM cards WHERE tenant_id = ? ORDER BY created_at, id").bind(c.var.tenant.id).all();
  return c.json({ cards: results });
});

app.post("/api/t/:tenant/cards", async (c) => {
  const { body } = await c.req.json<{ body?: string }>().catch(() => ({ body: undefined }));
  if (typeof body !== "string" || !body) return c.json({ error: "body が要る" }, 400);
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO cards (id, tenant_id, body) VALUES (?, ?, ?)").bind(id, c.var.tenant.id, body).run();
  return c.json({ id }, 201);
});

export default app;
