// テナントの非公開の置き場（031a）。R2 の鍵はテナントごとに「t/<テナント>/」で始め、ほかのテナントの鍵は作れない。
// 会社のテナントは PIN で入ったしるしが要り（tenantGuard）、新入社員の役割では読めない（資料の元の文を出さない）。
// 公開デモ（架空の会社のテナント）からは、自分の鍵の頭の中しか読めない。
import { Hono } from "hono";
import type { Env } from "./env";
import type { PeopleVars } from "./people";

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** 置き場の中の名前を確かめ、テナントの鍵にする。使えない名前なら null */
export function fileKey(tenantId: string, path: string): string | null {
  const segs = path.split("/");
  if (!path || path.length > 300 || segs.length > 8 || !segs.every((s) => SEGMENT.test(s) && s !== "." && s !== "..")) return null;
  return `t/${tenantId}/${path}`;
}

const OCTET = "application/octet-stream";
/** アプリと同じオリジンで開いても動きを持たない形だけを、そのまま保存して返す。HTML・SVG・JS などは octet-stream にする */
const SAFE_TYPES = new Set(["application/json", "application/pdf", "text/plain", "text/csv", "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
export function safeType(raw: string | null | undefined): string {
  const base = (raw ?? "").split(";")[0].trim().toLowerCase();
  return SAFE_TYPES.has(base) ? (raw ?? "").trim() : OCTET;
}

export const tenantPrefix =(tenantId: string) => `t/${tenantId}/`;

export const files = new Hono<{ Bindings: Env; Variables: PeopleVars }>();

files.use("*", async (c, next) => {
  if (c.var.person?.role === "newhire") return c.json({ error: "新入社員は資料の置き場を読めない" }, 403);
  await next();
});

files.get("/", async (c) => {
  const prefix = tenantPrefix(c.var.tenant.id);
  // 頭は「区切りまで」の名前として読む（pdf は pdf/ の中だけ。pdfabc/ を混ぜない）
  const raw = c.req.query("prefix") ?? "";
  if (raw && !fileKey(c.var.tenant.id, raw.replace(/\/$/, ""))) return c.json({ error: "名前が使えない" }, 400);
  const sub = raw && !raw.endsWith("/") ? `${raw}/` : raw;
  const list = await c.env.FILES.list({ prefix: prefix + sub, limit: 1000 });
  return c.json({ files: list.objects.map((o) => ({ path: o.key.slice(prefix.length), size: o.size, type: o.httpMetadata?.contentType ?? null })) });
});

files.put("/*", async (c) => {
  const key = fileKey(c.var.tenant.id, c.req.path.split("/files/").slice(1).join("/files/"));
  if (!key) return c.json({ error: "名前が使えない（英数字と . _ - の区切り）" }, 400);
  const len = Number(c.req.header("content-length") ?? NaN);
  const body = await c.req.arrayBuffer();
  if (body.byteLength > MAX_FILE_BYTES || len > MAX_FILE_BYTES) return c.json({ error: "大きすぎる" }, 413);
  await c.env.FILES.put(key, body, { httpMetadata: { contentType: safeType(c.req.header("content-type")) } });
  return c.json({ path: key.slice(tenantPrefix(c.var.tenant.id).length), size: body.byteLength }, 201);
});

files.get("/*", async (c) => {
  const key = fileKey(c.var.tenant.id, c.req.path.split("/files/").slice(1).join("/files/"));
  if (!key) return c.json({ error: "名前が使えない" }, 400);
  const obj = await c.env.FILES.get(key);
  if (!obj) return c.json({ error: "無い" }, 404);
  // 前に置いた資料も、返すときにもう一度ふるいにかける。許した形のほかはダウンロードとして返し、ブラウザに中身の形を推し量らせない
  const type = safeType(obj.httpMetadata?.contentType);
  return new Response(obj.body, {
    headers: {
      "content-type": type,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      ...(type === OCTET ? { "content-disposition": "attachment" } : {}),
    },
  });
});
