import { Hono } from "hono";
import type { Env } from "./env";

export const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT count(*) AS n FROM tenants").first<{ n: number }>();
  return c.json({ ok: true, tenants: row?.n ?? 0 });
});

export default app;
