// 新しいカードを作るチャットの API（11/5 作者）。作る人は資料（PDF・Word・文字のファイル）を添付し、自然な言葉で指示を書く。
// 指示が来るたびに、添付した資料ぜんぶを元の文として取り出しをやり直し（extract.ts の runExtraction）、その結果を返事として残す。
// 取り出しの結果から OK を付けてカードを作るのは、今までの /extract/:id/ok と /extract/:id/make を使う。新入社員の役割では使えない。
// PDF の文字は、Worker で Claude に読ませて、ページごとの文字にする（/chats/pdf）。Word と文字のファイルは画面の側で文字にして送る
import { Hono } from "hono";
import { BudgetExceededError, guardedCall } from "../shared/claude";
import { D1CallLog } from "./api-log";
import { MAX_TOKENS_NO_STREAM } from "./assets";
import { claudeClient, dayBudget } from "./claude-client";
import type { Env } from "./env";
import { ExtractError, type InputSource, MAX_INPUT_CHARS, runExtraction } from "./extract";
import type { PeopleVars } from "./people";
import { actorOf } from "./sign";

export const chats = new Hono<{ Bindings: Env; Variables: PeopleVars }>();

/** 添付 1 つ: 名前・文字・ページごとの行の数（PDF 以外は 1 ページ） */
export interface Material {
  name: string;
  text: string;
  pages: { page: number; lines: number }[];
}
export type ChatMessage =
  | { role: "user"; text: string; files: string[]; at: string }
  | { role: "assistant"; text: string; extraction?: string; rules?: number; at: string };

interface ChatRow {
  id: string;
  actor: string;
  messages: string;
  material: string;
  created_at: string;
  updated_at: string;
}

export const FOCUS_MAX = 1000;
export const PDF_MAX_BYTES = 10 * 1024 * 1024;
export const PDF_MODEL = "claude-sonnet-5-5";

chats.use("*", async (c, next) => {
  if (c.var.person?.role === "newhire") return c.json({ error: "新入社員は使えない" }, 403);
  await next();
});

const view = (r: ChatRow) => ({
  id: r.id,
  actor: r.actor,
  created_at: r.created_at,
  updated_at: r.updated_at,
  messages: JSON.parse(r.messages) as ChatMessage[],
  files: (JSON.parse(r.material) as Material[]).map((m) => ({ name: m.name, chars: m.text.length })),
});
const getChat = (db: D1Database, tenantId: string, id: string) =>
  db.prepare("SELECT id, actor, messages, material, created_at, updated_at FROM card_chats WHERE id = ? AND tenant_id = ?").bind(id, tenantId).first<ChatRow>();

chats.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, actor, messages, material, created_at, updated_at FROM card_chats WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 50").bind(c.var.tenant.id).all<ChatRow>();
  return c.json({ chats: results.map(view) });
});

chats.post("/", async (c) => {
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO card_chats (id, tenant_id, actor) VALUES (?, ?, ?)").bind(id, c.var.tenant.id, actorOf(c.var.person)).run();
  return c.json(view((await getChat(c.env.DB, c.var.tenant.id, id))!), 201);
});

chats.get("/:id", async (c) => {
  const r = await getChat(c.env.DB, c.var.tenant.id, c.req.param("id"));
  return r ? c.json(view(r)) : c.json({ error: "無い" }, 404);
});

/** 添付を確かめる。名前は 120 字まで、文字は空でない、ページの行の数の合計が文字の行の数と合う */
function readFiles(x: unknown): Material[] | null {
  if (x === undefined) return [];
  if (!Array.isArray(x) || x.length > 10) return null;
  const out: Material[] = [];
  for (const f of x as Partial<Material>[]) {
    if (typeof f?.name !== "string" || !f.name.trim() || typeof f.text !== "string") return null;
    const text = f.text.replaceAll("\r\n", "\n").trim();
    if (!text) return null;
    const n = text.split("\n").length;
    const pages = Array.isArray(f.pages) && f.pages.length ? f.pages : [{ page: 1, lines: n }];
    if (!pages.every((p) => Number.isInteger(p?.page) && p.page >= 1 && Number.isInteger(p?.lines) && p.lines >= 0) || pages.reduce((s, p) => s + p.lines, 0) !== n) return null;
    out.push({ name: f.name.trim().slice(0, 120), text, pages });
  }
  return out;
}

/**
 * 資料ぜんぶを 1 つの元の文にする（ページの行の数をつなぐので、取り出しの「どこから」は元の資料のページと行に戻る）。
 * 添付が 2 つ以上のときは、ページごとにどの資料かを持たせる（A の 1 ページと B の 1 ページを取り違えない）
 */
export function joinMaterial(ms: Material[]): { text: string; source: InputSource } {
  return {
    text: ms.map((m) => m.text).join("\n"),
    source: { kind: "doc", doc: ms.map((m) => m.name).join("・").slice(0, 200), pages: ms.flatMap((m) => m.pages.map((p) => (ms.length > 1 ? { ...p, doc: m.name } : p))) },
  };
}

chats.post("/:id/messages", async (c) => {
  const db = c.env.DB;
  const tid = c.var.tenant.id;
  const r = await getChat(db, tid, c.req.param("id"));
  if (!r) return c.json({ error: "無い" }, 404);
  const b = await c.req.json<{ text?: unknown; files?: unknown }>().catch(() => ({}) as { text?: unknown; files?: unknown });
  const text = typeof b.text === "string" ? b.text.trim().slice(0, FOCUS_MAX) : "";
  const files = readFiles(b.files);
  if (files === null) return c.json({ error: "files は { name, text, pages? } の並び（10 個まで）" }, 400);
  if (!text && !files.length) return c.json({ error: "指示か添付のどちらかが要る" }, 400);
  const messages = JSON.parse(r.messages) as ChatMessage[];
  const material = [...(JSON.parse(r.material) as Material[]), ...files];
  const at = new Date().toISOString();
  const user: ChatMessage = { role: "user", text, files: files.map((f) => f.name), at };
  messages.push(user);

  // 元の文: 資料があれば資料ぜんぶ。無ければ、書いた指示そのものを話した言葉として扱う
  const instructions = messages.filter((m) => m.role === "user" && m.text).map((m) => m.text);
  let reply: ChatMessage;
  const joined = material.length ? joinMaterial(material) : { text: instructions.join("\n"), source: { kind: "speech" } as InputSource };
  const save = () =>
    db.prepare("UPDATE card_chats SET messages = ?, material = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").bind(JSON.stringify(messages), JSON.stringify(material), r.id, tid).run();
  if (joined.text.length > MAX_INPUT_CHARS) {
    reply = { role: "assistant", text: `資料が長すぎます（${joined.text.length.toLocaleString()} 字。${MAX_INPUT_CHARS.toLocaleString()} 字まで）。ページを絞った資料を添付し直してください`, at };
    // 足した添付は資料から外すので、指示の行にも添付の名前を残さない（添付済みに見えないように）
    material.splice(material.length - files.length, files.length);
    user.files = [];
  } else {
    // 取り出しを呼ぶ前に、指示と添付を残す（呼び出しが途中で落ちても、書いた指示が消えないように）
    await save();
    try {
      const focus = material.length && instructions.length ? instructions.join("\n").slice(-FOCUS_MAX) : undefined;
      const x = await runExtraction(c.env, tid, joined.text, joined.source, focus);
      reply = {
        role: "assistant",
        // 11/7 作者: 箇条書きで「これらのカードを作成する」でいいかを聞く。全部に印を付けた状態で出し、作らないものは印を外してもらう
        text: x.rules.length
          ? `次の ${x.rules.length} 個の決まりを、それぞれ 1 枚のカードにします。これでいいですか？ 作らないものはチェックを外してください（チェックで操作できます）。変えたいときは、そのまま言葉で指示してください`
          : "決まりが見つかりませんでした。資料を足すか、取り出したい決まりを言葉で教えてください",
        extraction: x.id,
        rules: x.rules.length,
        at: new Date().toISOString(),
      };
    } catch (e) {
      // 費用の上限で止まったときも、理由を返事として残す（素の 500 にしない）
      if (!(e instanceof ExtractError) && !(e instanceof BudgetExceededError)) throw e;
      reply = { role: "assistant", text: e instanceof BudgetExceededError ? `費用の上限に届いたので、取り出しを止めました（${e.message}）` : e.message, at };
    }
  }
  messages.push(reply);
  await save();
  return c.json(view((await getChat(db, tid, r.id))!), 201);
});

/** 写真の大きさの上限（Claude に渡せる 1 枚の大きさ）。画面の側で長い辺 2000px の JPEG に縮めてから送る */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/**
 * 写真の文字（11/7 作者「注意事項の紙の写真を撮って載せる人もいる」）。貼り紙・掲示・手書きのメモの写真を Claude に読ませ、
 * 見えるとおりの文字にする。1 枚を 1 ページとして返す（PDF と同じ形）
 */
chats.post("/image", async (c) => {
  const type = (c.req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES.includes(type as (typeof IMAGE_TYPES)[number])) return c.json({ error: "写真は JPEG・PNG・WebP・GIF" }, 400);
  const buf = await c.req.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > IMAGE_MAX_BYTES) return c.json({ error: `写真は 1 バイト〜${IMAGE_MAX_BYTES / 1024 / 1024} MB` }, 400);
  const client = claudeClient(c.env);
  if (!client) return c.json({ error: "Claude の鍵が無い" }, 503);
  const msg = await guardedCall(
    { client, log: new D1CallLog(c.env.DB), dayBudgetUsd: dayBudget(c.env) },
    {
      purpose: "app",
      label: "写真の文字（チャット）",
      params: {
        model: PDF_MODEL,
        max_tokens: 8000,
        system: "渡した写真（貼り紙・掲示・注意書き・手書きのメモなど）に写っている文字を、見えるとおりに写す。言い換え・要約・足し算をしない。読めない所は「（読めない）」と書く。表は 1 行ずつ、項目を「・」で区切る。図の中の文字も写す。文字が無ければ空の文字を返す。",
        output_config: { format: { type: "json_schema", schema: PDF_SCHEMA } },
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: type, data: base64(buf) } }, { type: "text", text: "この写真の文字を写してください（1 枚を 1 ページとして）" }] }],
      } as unknown as Parameters<typeof guardedCall>[1]["params"],
    },
  );
  const out = msg.content.find((b) => b.type === "text");
  let pages: { page: number; text: string }[];
  try {
    pages = (JSON.parse(out && out.type === "text" ? out.text : "{}") as { pages?: { page: number; text: string }[] }).pages ?? [];
  } catch {
    return c.json({ error: "写真の文字を読めなかった" }, 502);
  }
  const text = pages.map((p) => p.text.replaceAll("\r\n", "\n").trim()).filter(Boolean).join("\n");
  if (!text) return c.json({ error: "写真に文字が見つからなかった" }, 422);
  return c.json({ text, pages: [{ page: 1, lines: text.split("\n").length }] });
});

const PDF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pages"],
  properties: {
    pages: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["page", "text"], properties: { page: { type: "integer" }, text: { type: "string" } } },
    },
  },
};

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** PDF をページごとの文字にする。書き換えず、見えるとおりに写す（表は 1 行ずつ） */
chats.post("/pdf", async (c) => {
  const buf = await c.req.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > PDF_MAX_BYTES) return c.json({ error: `PDF は 1 バイト〜${PDF_MAX_BYTES / 1024 / 1024} MB` }, 400);
  if (new TextDecoder().decode(buf.slice(0, 5)) !== "%PDF-") return c.json({ error: "PDF ではない" }, 400);
  const client = claudeClient(c.env);
  if (!client) return c.json({ error: "Claude の鍵が無い" }, 503);
  const msg = await guardedCall(
    { client, log: new D1CallLog(c.env.DB), dayBudgetUsd: dayBudget(c.env) },
    {
      purpose: "app",
      label: "PDF の文字（チャット）",
      params: {
        model: PDF_MODEL,
        max_tokens: MAX_TOKENS_NO_STREAM,
        system: "渡した PDF の文字を、ページごとに、見えるとおりに写す。言い換え・要約・足し算をしない。表は 1 行ずつ、項目を「・」で区切る。図の中の文字も写す。ページの番号は PDF の 1 枚目を 1 とする。",
        output_config: { format: { type: "json_schema", schema: PDF_SCHEMA } },
        messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64(buf) } }, { type: "text", text: "この PDF の文字をページごとに写してください" }] }],
      } as unknown as Parameters<typeof guardedCall>[1]["params"],
    },
  );
  const out = msg.content.find((b) => b.type === "text");
  let pages: { page: number; text: string }[];
  try {
    pages = (JSON.parse(out && out.type === "text" ? out.text : "{}") as { pages?: { page: number; text: string }[] }).pages ?? [];
  } catch {
    return c.json({ error: "PDF の文字を読めなかった" }, 502);
  }
  const kept = pages.map((p) => ({ page: p.page, text: p.text.replaceAll("\r\n", "\n").trim() })).filter((p) => p.text);
  if (!kept.length) return c.json({ error: "PDF に文字が無かった" }, 422);
  return c.json({ text: kept.map((p) => p.text).join("\n"), pages: kept.map((p) => ({ page: p.page, lines: p.text.split("\n").length })) });
});
