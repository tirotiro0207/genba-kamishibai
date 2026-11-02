// テナントの土台（009）。練習用・会社・架空の会社のデータを分け、会社のテナントは PIN で入る。
// 入ったしるしは、テナントの番号と期限に HMAC で署名した文字列。別のテナントでは使えない。
import type { Context, Next } from "hono";
import type { Env } from "./env";

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string): Uint8Array<ArrayBuffer> => new Uint8Array((s.match(/../g) ?? []).map((x) => parseInt(x, 16)));
const PBKDF2_ITER = 100_000;
export const SESSION_SEC = 12 * 3600;

async function pbkdf2(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITER }, key, 256));
}

/** 「塩:ハッシュ」の形で返す */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${hex(salt)}:${await pbkdf2(pin, salt)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [salt, want] = stored.split(":");
  if (!salt || !want) return false;
  const got = await pbkdf2(pin, unhex(salt));
  // 長さの同じ文字列を、早く抜けずに比べる
  let diff = got.length ^ want.length;
  for (let i = 0; i < Math.min(got.length, want.length); i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

export async function signSession(secret: string, tenantId: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const body = `${tenantId}.${nowSec + SESSION_SEC}`;
  return `${body}.${await hmac(secret, body)}`;
}

/** しるしが正しく、期限の中で、このテナントのものなら true */
export async function verifySession(secret: string, token: string, tenantId: string, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  const body = token.slice(0, i);
  const [tid, exp] = [body.slice(0, body.lastIndexOf(".")), Number(body.slice(body.lastIndexOf(".") + 1))];
  if (tid !== tenantId || !Number.isFinite(exp) || exp < nowSec) return false;
  return (await hmac(secret, body)) === token.slice(i + 1);
}

export interface TenantRow {
  id: string;
  kind: "practice" | "company" | "demo";
  name: string;
  pin_hash: string | null;
}

export type TenantVars = { tenant: TenantRow };

/** /api/t/:tenant/* の前に置く。テナントを読み、会社のテナントなら入ったしるしを確かめる */
export async function tenantGuard(c: Context<{ Bindings: Env; Variables: TenantVars }>, next: Next) {
  const id = c.req.param("tenant") ?? "";
  const t = await c.env.DB.prepare("SELECT id, kind, name, pin_hash FROM tenants WHERE id = ?").bind(id).first<TenantRow>();
  if (!t) return c.json({ error: "テナントが無い" }, 404);
  if (t.kind === "company") {
    const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!c.env.SESSION_SECRET || !(await verifySession(c.env.SESSION_SECRET, token, t.id))) return c.json({ error: "PIN で入ってください" }, 401);
  }
  c.set("tenant", t);
  await next();
}
