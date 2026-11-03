// MCP サーバー（092）。ほかの道具（Claude のアプリなど）から「この資料をカードに」と頼むと、画面と同じ流れ（取り出し → OK → 作成）が動く。
// 入口は POST /mcp/<テナント>（Streamable HTTP。1 回の呼び出しに JSON で 1 回答える）。会社ごとの鍵を Authorization: Bearer で渡す。
// 鍵の無い呼び出しは断る。架空の会社（demo）だけ鍵なしで試せる。作れるのは未承認の下書きまでで、署名・OK・停止の道具は無い。
// 中では、鍵を確かめたあとに作者の役のしるしを作り、画面と同じ API（/api/t/<テナント>/...）を呼ぶ。呼べる口は ALLOW だけ。
import { Hono } from "hono";
import type { Env } from "./env";
import { signRole } from "./people";
import { signSession, type TenantRow } from "./tenant";

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const MAX_CARDS = 5;

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const hashKey = async (key: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
/** 新しい鍵（gk- と 64 桁の 16 進） */
export const newKey = () => `gk-${hex(crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer)}`;

/** MCP から呼べる画面の API。署名・状態の変更・確かめる AI・置き場への書き込みはここに無い */
const ALLOW: [string, RegExp][] = [
  ["GET", /^\/files\?prefix=pdf\/$/],
  ["GET", /^\/files\/pdf\/[A-Za-z0-9._-]+\/p\d{3}\.json$/],
  ["POST", /^\/extract$/],
  ["POST", /^\/extract\/[0-9a-f-]+\/ok$/],
  ["POST", /^\/extract\/[0-9a-f-]+\/make$/],
  ["GET", /^\/cards\/[0-9a-f-]+$/],
];
export const allowed = (method: string, path: string) => ALLOW.some(([m, re]) => m === method && re.test(path));

type Inner = { fetch: (req: Request, env: Env) => Response | Promise<Response> };
type Api = <T>(method: string, path: string, body?: unknown) => Promise<T>;

class ToolError extends Error {}

const TOOLS = [
  {
    name: "list_documents",
    description: "置き場にある資料（ページごとに文字にしたもの）の一覧。doc_to_cards の doc に渡す名前が分かる",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "doc_to_cards",
    description:
      "この資料をカードに。文か、資料のページから決まりを取り出し、決まりごとに 3〜4 コマの絵のカードを未承認の下書きで作る。署名は監修者が画面でするまで新入社員には配られない",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "カードにしたい文（doc と pages の代わり）" },
        doc: { type: "string", description: "置き場の資料の名前（list_documents で分かる）" },
        pages: { type: "array", items: { type: "integer", minimum: 1 }, description: "資料のページの番号" },
        focus: { type: "string", description: "取り出すときに気にしてほしいこと（例: 新入社員が最初の週に守ること）" },
        pick: { type: "string", description: "この言葉を含む決まりだけをカードにする" },
        max_cards: { type: "integer", minimum: 1, maximum: MAX_CARDS, description: `作る枚数の上限（既定 3・最大 ${MAX_CARDS}）` },
      },
      additionalProperties: false,
    },
  },
  {
    name: "extract_rules",
    description: "文か資料のページから決まりを取り出すだけ（カードは作らない）。番号を見て make_drafts で選んで作る",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        doc: { type: "string" },
        pages: { type: "array", items: { type: "integer", minimum: 1 } },
        focus: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "make_drafts",
    description: "extract_rules で取り出した決まりの番号を選び、カードを未承認の下書きで作る",
    inputSchema: {
      type: "object",
      properties: {
        extraction: { type: "string" },
        items: { type: "array", items: { type: "integer", minimum: 0 }, minItems: 1, maxItems: MAX_CARDS },
      },
      required: ["extraction", "items"],
      additionalProperties: false,
    },
  },
  {
    name: "get_card",
    description: "カードの状態（未承認の下書き・確認待ち・署名済みなど）と守ること・なぜを読む",
    inputSchema: { type: "object", properties: { card: { type: "string" } }, required: ["card"], additionalProperties: false },
  },
];

const NOTE = "未承認の下書きです。監修者が画面で確かめて署名するまで、新入社員には配られません";

interface Rule {
  kind: string;
  text: string;
  reasons: { text: string; stated: boolean }[];
  where: { page: number | null; line: number };
}
interface CardOut {
  id: string;
  status: string;
  body: { rule: string; why: string };
}

/** 文か資料のページから、取り出しの口に渡す文と元の位置を作る（画面の「資料から」と同じ） */
async function input(api: Api, a: Record<string, unknown>) {
  if (typeof a.text === "string" && a.text.trim()) return { text: a.text, source: { kind: "speech" } };
  const pages = a.pages;
  if (typeof a.doc !== "string" || !Array.isArray(pages) || !pages.length || !pages.every((p) => Number.isInteger(p) && p >= 1))
    throw new ToolError("text か、doc と pages を渡してください");
  const got = await Promise.all(pages.map((p: number) => api<{ lines: { text: string }[] }>("GET", `/files/pdf/${a.doc}/p${String(p).padStart(3, "0")}.json`)));
  return {
    text: got.flatMap((g) => g.lines.map((l) => l.text)).join("\n"),
    source: { kind: "doc", doc: a.doc, pages: pages.map((p: number, i) => ({ page: p, lines: got[i].lines.length })) },
  };
}

async function extractRules(api: Api, a: Record<string, unknown>) {
  const { text, source } = await input(api, a);
  const focus = typeof a.focus === "string" && a.focus.trim() ? a.focus : undefined;
  return api<{ id: string; rules: Rule[] }>("POST", "/extract", { text, source, focus });
}

async function makeDrafts(api: Api, screen: (id: string) => string, extraction: string, items: number[]) {
  await api("POST", `/extract/${extraction}/ok`, { items });
  const cards = [];
  for (const item of items) {
    const c = await api<CardOut>("POST", `/extract/${extraction}/make`, { item });
    cards.push({ item, id: c.id, status: c.status, rule: c.body.rule, why: c.body.why, screen: screen(c.id) });
  }
  return cards;
}

const ruleList = (rules: Rule[]) =>
  rules.map((r, i) => ({ item: i, kind: r.kind, text: r.text, page: r.where.page, line: r.where.line, why: r.reasons.map((x) => ({ text: x.text, in_source: x.stated })) }));

async function runTool(name: string, a: Record<string, unknown>, api: Api, screen: (id: string) => string) {
  if (name === "list_documents") {
    const { files } = await api<{ files: { path: string }[] }>("GET", "/files?prefix=pdf/");
    const docs = new Map<string, number>();
    for (const f of files) {
      const m = /^pdf\/([^/]+)\/p\d{3}\.json$/.exec(f.path);
      if (m) docs.set(m[1], (docs.get(m[1]) ?? 0) + 1);
    }
    return { documents: [...docs].map(([doc, pages]) => ({ doc, pages })) };
  }
  if (name === "extract_rules") {
    const x = await extractRules(api, a);
    return { extraction: x.id, rules: ruleList(x.rules) };
  }
  if (name === "make_drafts") {
    const items = a.items;
    if (typeof a.extraction !== "string" || !Array.isArray(items) || !items.length || items.length > MAX_CARDS || !items.every((i) => Number.isInteger(i) && i >= 0))
      throw new ToolError(`extraction と、決まりの番号の並び（1〜${MAX_CARDS} 個）を渡してください`);
    return { cards: await makeDrafts(api, screen, a.extraction, [...new Set(items as number[])]), note: NOTE };
  }
  if (name === "doc_to_cards") {
    const max = a.max_cards === undefined ? 3 : a.max_cards;
    if (!Number.isInteger(max) || (max as number) < 1 || (max as number) > MAX_CARDS) throw new ToolError(`max_cards は 1〜${MAX_CARDS}`);
    const x = await extractRules(api, a);
    const pick = typeof a.pick === "string" && a.pick.trim() ? a.pick.trim() : "";
    const items = x.rules
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => !pick || r.text.includes(pick))
      .slice(0, max as number)
      .map(({ i }) => i);
    if (!items.length) return { extraction: x.id, rules: ruleList(x.rules), cards: [], note: pick ? `「${pick}」を含む決まりが無かった` : "決まりが取り出せなかった" };
    return { extraction: x.id, rules: x.rules.length, cards: await makeDrafts(api, screen, x.id, items), note: NOTE };
  }
  if (name === "get_card") {
    if (typeof a.card !== "string" || !/^[0-9a-f-]+$/.test(a.card)) throw new ToolError("card はカードの番号");
    const c = await api<CardOut>("GET", `/cards/${a.card}`);
    return { id: c.id, status: c.status, rule: c.body.rule, why: c.body.why, screen: screen(c.id) };
  }
  // 署名・OK・停止は人が画面でだけする。名前が似た道具を呼ばれても断る
  if (/sign|approve|stop|publish|署名|承認/i.test(name)) throw new ToolError("署名・OK・停止は、監修者が画面でだけできます。MCP から作れるのは未承認の下書きまでです");
  return null;
}

/** 状態の変わる呼び出しの要約（道具の結果の文。中身は structuredContent にも同じものを入れる） */
function summary(name: string, out: Record<string, unknown>): string {
  const cards = out.cards as { id: string; status: string; rule: string; screen: string }[] | undefined;
  if (cards?.length) return [`${cards.length} 枚を未承認の下書きで作りました。`, ...cards.map((c) => `- ${c.rule}（${c.status}）${c.screen}`), String(out.note ?? "")].join("\n");
  return `${name}: ${JSON.stringify(out)}`;
}

const rpc = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export function mcpApp(inner: Inner) {
  const mcp = new Hono<{ Bindings: Env }>();

  mcp.get("/:tenant", (c) => c.json(rpcError(null, -32000, "POST で呼んでください（通知の流れは開かない）"), 405, { allow: "POST" }));

  mcp.post("/:tenant", async (c) => {
    const t = await c.env.DB.prepare("SELECT id, kind, name, pin_hash FROM tenants WHERE id = ?").bind(c.req.param("tenant")).first<TenantRow>();
    if (!t) return c.json(rpcError(null, -32001, "テナントが無い"), 404);
    // 会社ごとの鍵。架空の会社だけは鍵なしで試せる（本番の公開の置き場では架空の会社も鍵が要る・093b）
    if (t.kind !== "demo" || c.env.PUBLIC_DEMO) {
      const key = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      const deny = (msg: string) => c.json(rpcError(null, -32001, msg), 401, { "www-authenticate": 'Bearer realm="genba-kamishibai"' });
      if (!key) return deny("鍵が要ります。会社ごとの MCP の鍵を Authorization: Bearer で渡してください");
      const row = await c.env.DB.prepare("SELECT tenant_id FROM mcp_keys WHERE key_hash = ? AND revoked_at IS NULL").bind(await hashKey(key)).first<{ tenant_id: string }>();
      if (row?.tenant_id !== t.id) return deny("鍵が違います");
    }

    const msg = await c.req.json<unknown>().catch(() => undefined);
    if (msg === undefined) return c.json(rpcError(null, -32700, "JSON が読めない"), 400);
    if (Array.isArray(msg)) return c.json(rpcError(null, -32600, "まとめての呼び出しは受けない"), 400);
    const m = msg as { id?: unknown; method?: unknown; params?: Record<string, unknown> };
    if (typeof m.method !== "string") return c.json(rpcError(m.id, -32600, "method が無い"), 400);
    // 通知（id が無い）は受けるだけ
    if (m.id === undefined) return c.body(null, 202);

    if (m.method === "initialize") {
      const want = m.params?.protocolVersion;
      return c.json(
        rpc(m.id, {
          protocolVersion: typeof want === "string" && PROTOCOL_VERSIONS.includes(want) ? want : PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: "genba-kamishibai", version: "0.1.0" },
          instructions: `安全の決まりの文や資料から、文字を読まなくても分かる 3〜4 コマの絵のカードを作ります。作れるのは未承認の下書きまでで、署名は監修者が画面でします。テナント: ${t.name}`,
        }),
      );
    }
    if (m.method === "ping") return c.json(rpc(m.id, {}));
    if (m.method === "tools/list") return c.json(rpc(m.id, { tools: TOOLS }));
    if (m.method !== "tools/call") return c.json(rpcError(m.id, -32601, `無いメソッド: ${m.method}`));

    const name = m.params?.name;
    const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
    if (typeof name !== "string") return c.json(rpcError(m.id, -32602, "name が無い"));
    if (!c.env.SESSION_SECRET) return c.json(rpcError(m.id, -32603, "入ったしるしの鍵が無い"), 503);

    // 画面と同じ API を、このテナントの作者の役として呼ぶ
    const origin = new URL(c.req.url).origin;
    const session = await signSession(c.env.SESSION_SECRET, t.id);
    const role = await signRole(c.env.SESSION_SECRET, t.id, { role: "author", slot: 1 });
    const api: Api = async (method, path, body) => {
      if (!allowed(method, path)) throw new ToolError(`MCP からは呼べない口: ${method} ${path}`);
      const res = await inner.fetch(
        new Request(`${origin}/api/t/${encodeURIComponent(t.id)}${path}`, {
          method,
          headers: { "content-type": "application/json", authorization: `Bearer ${session}`, "x-role": role },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        c.env,
      );
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new ToolError(`${res.status} ${b.error ?? ""}`.trim());
      return b as never;
    };
    const screen = (id: string) => `${origin}/#/t/${encodeURIComponent(t.id)}/card/${encodeURIComponent(id)}`;

    try {
      const out = await runTool(name, args, api, screen);
      if (!out) return c.json(rpcError(m.id, -32602, `無い道具: ${name}`));
      return c.json(rpc(m.id, { content: [{ type: "text", text: summary(name, out) }], structuredContent: out, isError: false }));
    } catch (e) {
      if (!(e instanceof ToolError)) throw e;
      return c.json(rpc(m.id, { content: [{ type: "text", text: e.message }], isError: true }));
    }
  });

  return mcp;
}
