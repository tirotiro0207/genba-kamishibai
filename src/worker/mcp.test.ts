import type Anthropic from "@anthropic-ai/sdk";
import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isScriptCall, MOTION, scriptReply } from "../../tests/fixtures/card";
import { setClientFactory } from "./claude-client";
import { allowed, hashKey, newKey } from "./mcp";

// MCP サーバー（092）。会社ごとの鍵・架空の会社だけ鍵なし・作れるのは下書きまで・署名は断る
const rpc = (tenant: string, method: string, params?: unknown, key?: string, id: number | null = 1) =>
  exports.default.fetch(`http://local/mcp/${tenant}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", ...(id === null ? {} : { id }), method, ...(params ? { params } : {}) }),
  });
const tool = async (tenant: string, name: string, args: unknown, key?: string) =>
  ((await (await rpc(tenant, "tools/call", { name, arguments: args }, key)).json()) as { result?: { isError: boolean; content: { text: string }[]; structuredContent?: Record<string, unknown> }; error?: { code: number; message: string } });

const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;
const RULE = (text: string, line: number) => ({ kind: "do", text, from: { quote: text, lines: [line] }, reasons: [{ text: "感電を防ぐ", from: { quote: "感電", lines: [4] }, stated: true }], checklist: false, reworded: false });
const TEXT = "見出し\n盤に触る前に検電する\n脚立は二人で使う\n感電のおそれ";

const keys: Record<string, string> = {};
async function addKey(tenant: string) {
  const key = newKey();
  await env.DB.prepare("INSERT INTO mcp_keys (key_hash, tenant_id, label) VALUES (?, ?, 'test')").bind(await hashKey(key), tenant).run();
  return key;
}

describe("MCP サーバー", () => {
  beforeAll(async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO tenants (id, kind, name, pin_hash) VALUES ('mcp-co', 'company', 'MCP の会社', 'aa:bb')").run();
    keys.practice = await addKey("practice");
    keys.co = await addKey("mcp-co");
    setClientFactory(() => ({
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
          if (isScriptCall(p.system)) return reply(scriptReply(p.system));
          if (String(p.system).includes("言葉」の欄")) return reply({ ja: "けんでん します。", vi: "Kiểm tra điện.", terms: [] });
          if (String(p.system).includes("カードの下ごしらえ")) return reply({ rules: [RULE("盤に触る前に検電する", 2), RULE("脚立は二人で使う", 3)] });
          // 原則の 1 コマは、キーフレーム 1 つ・印 1 か所
          if (String(p.system).includes("原則（いつも守る心がまえ）の 1 コマ"))
            return reply({ motion: { keyframes: [{ ...MOTION.keyframes[0], t: 0, mark: true }] }, parts: [{ type: "figure", index: 0, statement: "s1", reason: "人" }, { type: "prop", index: 0, statement: "s1", reason: "検電器" }, { type: "prop", index: 1, statement: "s1", reason: "盤" }], why: "足元の物につまずくから" });
          return reply({ motion: MOTION, parts: [{ type: "figure", index: 0, statement: "s1", reason: "人" }, { type: "prop", index: 0, statement: "s1", reason: "検電器" }, { type: "prop", index: 1, statement: "s2", reason: "盤" }], why: null });
        },
      },
    }));
  });
  afterAll(() => setClientFactory(null));

  it("鍵の無い呼び出し・違う鍵・ほかの会社の鍵・止めた鍵は断る", async () => {
    for (const tenant of ["practice", "mcp-co"]) {
      const res = await rpc(tenant, "initialize", { protocolVersion: "2025-06-18" });
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain("Bearer");
      expect(((await res.json()) as { error: { message: string } }).error.message).toContain("鍵が要ります");
      expect((await rpc(tenant, "tools/list", undefined, "gk-nope")).status).toBe(401);
    }
    expect((await rpc("mcp-co", "tools/list", undefined, keys.practice)).status).toBe(401);
    expect((await rpc("practice", "tools/list", undefined, keys.co)).status).toBe(401);
    // 道具の呼び出しも、鍵が無ければ中まで届かない
    expect((await rpc("practice", "tools/call", { name: "doc_to_cards", arguments: { text: TEXT } })).status).toBe(401);
    const old = await addKey("practice");
    await env.DB.prepare("UPDATE mcp_keys SET revoked_at = datetime('now') WHERE key_hash = ?").bind(await hashKey(old)).run();
    expect((await rpc("practice", "tools/list", undefined, old)).status).toBe(401);
    expect((await rpc("nowhere", "tools/list")).status).toBe(404);
  });

  it("架空の会社だけは鍵なしで入れ、道具の一覧に署名の道具は無い", async () => {
    const init = (await (await rpc("demo", "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } })).json()) as { result: { protocolVersion: string; capabilities: { tools: object } } };
    expect(init.result.protocolVersion).toBe("2025-03-26");
    expect(init.result.capabilities.tools).toBeDefined();
    expect((await rpc("demo", "notifications/initialized", undefined, undefined, null)).status).toBe(202);
    const list = (await (await rpc("demo", "tools/list")).json()) as { result: { tools: { name: string }[] } };
    const names = list.result.tools.map((t) => t.name);
    expect(names).toEqual(["list_documents", "doc_to_cards", "extract_rules", "make_drafts", "get_card"]);
    expect(names.some((n) => /sign|approve|stop/.test(n))).toBe(false);
    // 会社の鍵で会社のテナントに入れる
    expect((await rpc("mcp-co", "tools/list", undefined, keys.co)).status).toBe(200);
  });

  it("この資料をカードに: 資料のページから取り出し、OK して、未承認の下書きを作る（画面と同じ流れ）", async () => {
    const page = { page: 7, source: "text", lines: TEXT.split("\n").map((t, i) => ({ n: i + 1, text: t, box: [0, 0, 0, 0] })) };
    await exports.default.fetch("http://local/api/t/practice/files/pdf/mcpdoc/p007.json", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(page) });
    const docs = await tool("practice", "list_documents", {}, keys.practice);
    expect(docs.result?.structuredContent?.documents).toContainEqual({ doc: "mcpdoc", pages: 1 });

    const r = await tool("practice", "doc_to_cards", { doc: "mcpdoc", pages: [7], pick: "検電" }, keys.practice);
    expect(r.result?.isError).toBe(false);
    const cards = r.result!.structuredContent!.cards as { id: string; status: string; screen: string }[];
    expect(cards).toHaveLength(1);
    expect(cards[0].status).toBe("draft");
    expect(cards[0].screen).toBe(`http://local/#/t/practice/card/${cards[0].id}`);
    expect(r.result!.content[0].text).toContain("未承認の下書き");
    // 元の位置は資料のページと行。監査の記録も画面で作ったときと同じ
    const card = (await (await exports.default.fetch(`http://local/api/t/practice/cards/${cards[0].id}`)).json()) as { body: { statements: { sources: unknown[] }[] } };
    expect(card.body.statements[0].sources).toEqual([{ kind: "doc", doc: "mcpdoc", page: 7, line: 2 }]);
    const audit = (await (await exports.default.fetch(`http://local/api/t/practice/audit/cards/${cards[0].id}`)).json()) as { entries: { kind: string }[] };
    expect(audit.entries.map((e) => e.kind)).toEqual(["source", "make"]);

    const got = await tool("practice", "get_card", { card: cards[0].id }, keys.practice);
    expect(got.result?.structuredContent).toMatchObject({ id: cards[0].id, status: "draft" });
  });

  it("取り出しだけ → 番号を選んで作る。枚数の上限を超えると作らない", async () => {
    const x = await tool("mcp-co", "extract_rules", { text: TEXT }, keys.co);
    const { extraction, rules } = x.result!.structuredContent as { extraction: string; rules: { item: number; text: string }[] };
    expect(rules.map((r) => r.text)).toEqual(["盤に触る前に検電する", "脚立は二人で使う"]);
    const made = await tool("mcp-co", "make_drafts", { extraction, items: [1] }, keys.co);
    expect((made.result!.structuredContent!.cards as { status: string }[])[0].status).toBe("draft");
    expect((await tool("mcp-co", "make_drafts", { extraction, items: [0, 1, 2, 3, 4, 5] }, keys.co)).result?.isError).toBe(true);
    expect((await tool("mcp-co", "doc_to_cards", { text: TEXT, max_cards: 9 }, keys.co)).result?.isError).toBe(true);
  });

  it("shape に principle を渡すと、原則の 1 コマのカードになる（doc_to_cards・make_drafts とも）。ほかの値は断る", async () => {
    const x = await tool("mcp-co", "extract_rules", { text: TEXT }, keys.co);
    const { extraction } = x.result!.structuredContent as { extraction: string };
    const body = async (id: string) => JSON.parse((await env.DB.prepare("SELECT body FROM cards WHERE id = ?").bind(id).first<{ body: string }>())!.body) as { shape?: string };
    const made = await tool("mcp-co", "make_drafts", { extraction, items: [0], shape: "principle" }, keys.co);
    expect((await body((made.result!.structuredContent!.cards as { id: string }[])[0].id)).shape).toBe("principle");
    const doc = await tool("mcp-co", "doc_to_cards", { text: TEXT, max_cards: 1, shape: "principle" }, keys.co);
    expect((await body((doc.result!.structuredContent!.cards as { id: string }[])[0].id)).shape).toBe("principle");
    expect((await tool("mcp-co", "doc_to_cards", { text: TEXT, shape: "x" }, keys.co)).result?.isError).toBe(true);
  });

  it("署名の呼び出しは断り、カードは下書きのまま。中で呼べる口に署名と状態の変更は無い", async () => {
    const r = await tool("demo", "doc_to_cards", { text: TEXT, max_cards: 1 });
    const id = (r.result!.structuredContent!.cards as { id: string }[])[0].id;
    for (const name of ["sign_card", "approve_card", "署名"]) {
      const s = await tool("demo", name, { card: id });
      expect(s.result?.isError).toBe(true);
      expect(s.result?.content[0].text).toContain("監修者が画面でだけ");
    }
    expect((await tool("demo", "get_card", { card: id })).result?.structuredContent?.status).toBe("draft");
    expect((await tool("demo", "nothing", {})).error?.code).toBe(-32602);
    for (const [m, p] of [
      ["POST", `/cards/${id}/sign`],
      ["POST", `/cards/${id}/status`],
      ["POST", `/cards/${id}/open`],
      ["POST", `/cards/${id}/verify`],
      ["PUT", "/files/pdf/x/p001.json"],
      ["POST", "/reset"],
    ])
      expect(allowed(m, p)).toBe(false);
    expect(allowed("POST", `/extract/${id}/make`)).toBe(true);
  });

  it("JSON-RPC の決まり: 無いメソッド・まとめての呼び出し・GET は断る", async () => {
    expect(((await (await rpc("demo", "resources/list")).json()) as { error: { code: number } }).error.code).toBe(-32601);
    const batch = await exports.default.fetch("http://local/mcp/demo", { method: "POST", headers: { "content-type": "application/json" }, body: "[]" });
    expect(batch.status).toBe(400);
    expect((await exports.default.fetch("http://local/mcp/demo")).status).toBe(405);
  });
});
