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
  /** 新入社員の ID（11/6 作者）。student_V_1 の形で、入るときにその場で決まる。前からのしるしには無い */
  student?: string;
}

/** 新入社員の ID の形（11/6 作者）: student_<国の頭文字>_<番号>。V ベトナム・M ミャンマー・J 日本・C カンボジア */
export const STUDENT_GROUP: Record<string, string> = { V: "ベトナム", M: "ミャンマー", J: "日本", C: "カンボジア" };
const STUDENT_RE = /^student_([a-z])_(\d{1,3})$/i;
/** 打った ID を揃える（大文字小文字・前後の空白）。形が違えば null */
export function normalizeStudent(x: unknown): string | null {
  const m = typeof x === "string" ? x.trim().match(STUDENT_RE) : null;
  if (!m) return null;
  const g = m[1].toUpperCase();
  return g in STUDENT_GROUP && Number(m[2]) >= 1 ? `student_${g}_${Number(m[2])}` : null;
}
/** ID から国籍（試しの回の組分けに使う） */
export const studentGroup = (id: string) => STUDENT_GROUP[id.split("_")[1]] ?? "その他";
export type PeopleVars = TenantVars & { person: Person | null };

const enc = new TextEncoder();
async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`role:${msg}`)))].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function signRole(secret: string, tenantId: string, p: Person, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  // 新入社員の ID は、期限の後ろに s- を付けて足す（ID に点は入らない）
  const body = `${tenantId}.${p.role}.${p.slot}.${nowSec + SESSION_SEC}${p.student ? `.s-${p.student}` : ""}`;
  return `${body}.${await hmac(secret, body)}`;
}

/** しるしが正しく、期限の中で、このテナントのものなら役割を返す */
export async function verifyRole(secret: string, token: string, tenantId: string, nowSec = Math.floor(Date.now() / 1000)): Promise<Person | null> {
  const parts = token.split(".");
  if (parts.length < 5) return null;
  const mac = parts.pop()!;
  const student = parts[parts.length - 1]?.startsWith("s-") ? parts.pop()!.slice(2) : undefined;
  const [exp, slot, role] = [Number(parts.pop()), Number(parts.pop()), parts.pop() as Role];
  const tid = parts.join(".");
  if (tid !== tenantId || !ROLES.includes(role) || (slot !== 1 && slot !== 2) || !Number.isFinite(exp) || exp < nowSec) return null;
  if (student !== undefined && (role !== "newhire" || normalizeStudent(student) !== student)) return null;
  if ((await hmac(secret, `${tid}.${role}.${slot}.${exp}${student ? `.s-${student}` : ""}`)) !== mac) return null;
  return student ? { role, slot, student } : { role, slot };
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

/** カードの API の関所。新入社員は入れない。署名と停止は監修者だけ。止めるときは理由が要る */
export async function cardsGate(c: Context<{ Bindings: Env; Variables: PeopleVars }>, next: Next) {
  const p = c.var.person;
  if (p?.role === "newhire") return c.json({ error: "新入社員は署名済みのカードの入口から読む" }, 403);
  if (c.req.method === "POST" && /\/cards\/[^/]+\/status$/.test(c.req.path)) {
    const { to } = await c.req.json<{ to?: string }>().catch(() => ({ to: undefined }));
    if ((to === "signed" || to === "stopped") && p?.role !== "supervisor") return c.json({ error: "署名と停止は監修者だけ" }, 403);
    // 止める理由は必ず要る（088 の残り）。回収の知らせに載せるため
    if (to === "stopped") {
      const { reason } = await c.req.json<{ reason?: unknown }>().catch(() => ({ reason: undefined }));
      if (typeof reason !== "string" || !reason.trim()) return c.json({ error: "止める理由が要る" }, 400);
    }
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

/**
 * 試しの回の口の関所（11/6 作者）。新入社員は ID を持って入ったときだけ、自分の分の口を開く:
 * 今の回を見る・回に加わる・回を読む・見せるもの・自分の答えを送る・自分の答えの一覧・絵だけの 8 枚。参加者は自分の ID に限る。
 * ID の無い新入社員と、ほかの口（回を作る・採点・結果・書き出し・消す・勘）は今までどおり開かない
 */
export async function trialsGate(c: Context<{ Bindings: Env; Variables: PeopleVars }>, next: Next) {
  const p = c.var.person;
  if (p?.role !== "newhire") return next();
  const me = p.student;
  if (!me) return c.json({ error: "新入社員は署名済みのカードの入口から読む" }, 403);
  const path = c.req.path.replace(/^.*\/trials/, "");
  const m = c.req.method;
  const q = c.req.query("participant");
  const ok =
    (m === "GET" && (path === "/open" || /^\/[^/]+$/.test(path) || /^\/[^/]+\/responses$/.test(path))) ||
    (m === "POST" && /^\/[^/]+\/join$/.test(path)) ||
    (m === "GET" && /^\/[^/]+\/(material|pictures|page\/[AB])$/.test(path) && q === me) ||
    (m === "POST" && /^\/[^/]+\/(responses|picture-answers)$/.test(path) && (await c.req.json<{ participant?: unknown }>().catch(() => ({}) as { participant?: unknown })).participant === me);
  if (!ok) return c.json({ error: "新入社員は自分のテストだけを受ける" }, 403);
  await next();
}

export const people = new Hono<{ Bindings: Env; Variables: PeopleVars }>();

/** 入ったしるしの鍵が無いとき（手元で .dev.vars を書き忘れたとき）の答え。鍵の長さ 0 で署名しようとして 500 にならないように先に断る */
export const NO_SECRET = "入ったしるしの鍵（SESSION_SECRET）が無いので入れない。手元では .dev.vars に書く";

/** 役割で入る。会社のテナントは役割の PIN が要る。練習用と架空の会社は選ぶだけ */
people.post("/login", async (c) => {
  const b = await c.req.json<{ role?: unknown; slot?: unknown; pin?: unknown; student?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  const role = b.role as Role;
  const slot = (b.slot === undefined ? 1 : Number(b.slot)) as 1 | 2;
  if (!ROLES.includes(role) || (slot !== 1 && slot !== 2) || (role !== "supervisor" && slot !== 1)) return c.json({ error: "役割か番号が違う" }, 400);
  if (c.var.tenant.kind === "company") {
    const row = await c.env.DB.prepare("SELECT pin_hash FROM people WHERE tenant_id = ? AND role = ? AND slot = ?").bind(c.var.tenant.id, role, slot).first<{ pin_hash: string | null }>();
    if (!row?.pin_hash || typeof b.pin !== "string" || !(await verifyPin(b.pin, row.pin_hash))) return c.json({ error: "PIN が違う" }, 401);
  }
  // 新入社員は ID を付けて入る（11/6 作者）。ID は前もって作らず、入ったときにその場で決まる（PIN は新入社員の役割で 1 つ）
  let student: string | undefined;
  if (b.student !== undefined && b.student !== "") {
    const s = normalizeStudent(b.student);
    if (role !== "newhire" || !s) return c.json({ error: "ID は student_V_1 の形（V ベトナム・M ミャンマー・J 日本・C カンボジア と番号）" }, 400);
    student = s;
  }
  if (!c.env.SESSION_SECRET) return c.json({ error: NO_SECRET }, 503);
  const p: Person = student ? { role, slot, student } : { role, slot };
  return c.json({ token: await signRole(c.env.SESSION_SECRET, c.var.tenant.id, p), role, slot, student: student ?? null, name: personName(c.env, p) });
});

people.get("/me", (c) => {
  const p = c.var.person;
  return p ? c.json({ role: p.role, slot: p.slot, ...(p.student ? { student: p.student } : {}), name: personName(c.env, p) }) : c.json({ role: null });
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
