// 利用者と役割（030b）。役割で入ったしるしは「テナント.役割.番号.期限」に HMAC で署名した文字列で、x-role ヘッダーで渡す。
// 署名・停止は監修者だけが通せる。新入社員はカードの API に入れない（署名済みだけを読む入口は 028）。
// 名前は Worker の環境変数（SUPERVISOR_1_NAME など。手元は .dev.vars、本番は wrangler secret）から読み、無ければ空欄にする。DB には名前を置かない。
import type { Context, Next } from "hono";
import { Hono } from "hono";
import type { Env } from "./env";
import { SESSION_SEC, type TenantVars, verifyPin } from "./tenant";

export const ROLES = ["author", "supervisor", "trainer", "newhire"] as const;
export type Role = (typeof ROLES)[number];
export interface Person {
  role: Role;
  slot: 1 | 2;
}
export type PeopleVars = TenantVars & { person: Person | null };

const enc = new TextEncoder();
async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`role:${msg}`)))].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function signRole(secret: string, tenantId: string, p: Person, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const body = `${tenantId}.${p.role}.${p.slot}.${nowSec + SESSION_SEC}`;
  return `${body}.${await hmac(secret, body)}`;
}

/** しるしが正しく、期限の中で、このテナントのものなら役割を返す */
export async function verifyRole(secret: string, token: string, tenantId: string, nowSec = Math.floor(Date.now() / 1000)): Promise<Person | null> {
  const parts = token.split(".");
  if (parts.length < 5) return null;
  const mac = parts.pop()!;
  const [exp, slot, role] = [Number(parts.pop()), Number(parts.pop()), parts.pop() as Role];
  const tid = parts.join(".");
  if (tid !== tenantId || !ROLES.includes(role) || (slot !== 1 && slot !== 2) || !Number.isFinite(exp) || exp < nowSec) return null;
  if ((await hmac(secret, `${tid}.${role}.${slot}.${exp}`)) !== mac) return null;
  return { role, slot };
}

/** 役割の名前。環境変数に無ければ空欄 */
export function personName(env: Env, p: Person): string {
  const key: keyof Env | "" = p.role === "supervisor" ? (p.slot === 1 ? "SUPERVISOR_1_NAME" : "SUPERVISOR_2_NAME") : p.role === "trainer" ? "TRAINER_NAME" : p.role === "author" ? "AUTHOR_NAME" : "";
  const v: unknown = key ? env[key] : undefined;
  return typeof v === "string" ? v.trim() : "";
}

/** テナントの後ろに置く。x-role のしるしがあれば読み、無ければ null（役割なし） */
export async function personGuard(c: Context<{ Bindings: Env; Variables: PeopleVars }>, next: Next) {
  const token = c.req.header("x-role") ?? "";
  if (!token) c.set("person", null);
  else {
    const p = c.env.SESSION_SECRET ? await verifyRole(c.env.SESSION_SECRET, token, c.var.tenant.id) : null;
    if (!p) return c.json({ error: "役割のしるしが正しくない" }, 401);
    c.set("person", p);
  }
  await next();
}

/** 役割のしるしの要らない口（052 の続き）。役割で入る・入った役割を見る・役割の一覧 */
const OPEN_WITHOUT_ROLE = /\/(login|me|people)$/;

/** 会社のテナントの関所（052 の続き）。PIN の入室だけで役割のしるしが無いと、役割で入る口のほかは 403。
 *  練習用と架空の会社は誰でも役割を選べるので、ここでは止めない */
export async function roleRequiredGate(c: Context<{ Bindings: Env; Variables: PeopleVars }>, next: Next) {
  if (c.var.tenant.kind === "company" && !c.var.person && !OPEN_WITHOUT_ROLE.test(c.req.path)) return c.json({ error: "役割で入ってください" }, 403);
  await next();
}

/** カードの API の関所。新入社員は入れない。署名と停止は監修者だけ */
export async function cardsGate(c: Context<{ Bindings: Env; Variables: PeopleVars }>, next: Next) {
  const p = c.var.person;
  if (p?.role === "newhire") return c.json({ error: "新入社員は署名済みのカードの入口から読む" }, 403);
  if (c.req.method === "POST" && /\/cards\/[^/]+\/status$/.test(c.req.path)) {
    const { to } = await c.req.json<{ to?: string }>().catch(() => ({ to: undefined }));
    if ((to === "signed" || to === "stopped") && p?.role !== "supervisor") return c.json({ error: "署名と停止は監修者だけ" }, 403);
  }
  await next();
}

/** 監査の記録の関所（041）。新入社員は読めない */
export async function auditGate(c: Context<{ Bindings: Env; Variables: PeopleVars }>, next: Next) {
  if (c.var.person?.role === "newhire") return c.json({ error: "監査の記録は監修者・教育担当・作者が読む" }, 403);
  await next();
}

/** 新入社員が入れない口の関所（052）。署名済みのカードの入口（read）と自分の役割の口のほかは、新入社員に開けない */
export async function noNewhireGate(c: Context<{ Bindings: Env; Variables: PeopleVars }>, next: Next) {
  if (c.var.person?.role === "newhire") return c.json({ error: "新入社員は署名済みのカードの入口から読む" }, 403);
  await next();
}

export const people = new Hono<{ Bindings: Env; Variables: PeopleVars }>();

/** 役割で入る。会社のテナントは役割の PIN が要る。練習用と架空の会社は選ぶだけ */
people.post("/login", async (c) => {
  const b = await c.req.json<{ role?: unknown; slot?: unknown; pin?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  const role = b.role as Role;
  const slot = (b.slot === undefined ? 1 : Number(b.slot)) as 1 | 2;
  if (!ROLES.includes(role) || (slot !== 1 && slot !== 2) || (role !== "supervisor" && slot !== 1)) return c.json({ error: "役割か番号が違う" }, 400);
  if (c.var.tenant.kind === "company") {
    const row = await c.env.DB.prepare("SELECT pin_hash FROM people WHERE tenant_id = ? AND role = ? AND slot = ?").bind(c.var.tenant.id, role, slot).first<{ pin_hash: string | null }>();
    if (!row?.pin_hash || typeof b.pin !== "string" || !(await verifyPin(b.pin, row.pin_hash))) return c.json({ error: "PIN が違う" }, 401);
  }
  const p: Person = { role, slot };
  return c.json({ token: await signRole(c.env.SESSION_SECRET, c.var.tenant.id, p), role, slot, name: personName(c.env, p) });
});

people.get("/me", (c) => {
  const p = c.var.person;
  return p ? c.json({ role: p.role, slot: p.slot, name: personName(c.env, p) }) : c.json({ role: null });
});

/** 役割の一覧（監修者 2 名を見分ける名前つき。名前が無ければ空欄） */
people.get("/people", (c) => {
  const list: Person[] = [
    { role: "author", slot: 1 },
    { role: "supervisor", slot: 1 },
    { role: "supervisor", slot: 2 },
    { role: "trainer", slot: 1 },
    { role: "newhire", slot: 1 },
  ];
  return c.json({ people: list.map((p) => ({ ...p, name: personName(c.env, p) })) });
});
