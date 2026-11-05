import type Anthropic from "@anthropic-ai/sdk";
import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { isScriptCall, MOTION, SCRIPT } from "../../tests/fixtures/card";
import { setClientFactory } from "./claude-client";
import { app } from "./index";

// 公開デモの入口（093b）: その場で作るのは同じ IP から 1 日 3 回まで・1 回 1 枚まで。1 日の USD の上限は無い。本番では練習用と架空の会社は見るだけ
const make = (ip: string, text = "見出し\n盤に触る前に検電する\n感電のおそれ") =>
  exports.default.fetch("http://local/api/demo/make", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify({ text }) });
const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;
const rule = (text: string, line: number) => ({ kind: "do", text, from: { quote: text, lines: [line] }, reasons: [{ text: "感電を防ぐ", from: { quote: "感電", lines: [3] }, stated: true }], checklist: false, reworded: false });
const stub = () =>
  setClientFactory(() => ({
    messages: {
      create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
        if (isScriptCall(p.system)) return reply(SCRIPT);
        if (String(p.system).includes("言葉」の欄")) return reply({ ja: "盤に さわる 前に 検電を します。", vi: "Kiểm tra điện trước khi chạm vào tủ điện.", terms: [{ ja: "検電", vi: "kiểm tra điện" }] });
        if (String(p.system).includes("カードの下ごしらえ")) return reply({ rules: [rule("盤に触る前に検電する", 2), rule("感電のおそれ", 3)] });
        return reply({ motion: MOTION, parts: [{ type: "figure", index: 0, statement: "s1", reason: "人" }, { type: "prop", index: 0, statement: "s1", reason: "検電器" }, { type: "prop", index: 1, statement: "s2", reason: "盤" }], why: null });
      },
    },
  }));
const demoCards = async () => (await env.DB.prepare("SELECT count(*) AS n FROM cards WHERE tenant_id = 'demo'").first<{ n: number }>())!.n;

afterEach(() => setClientFactory(null));

describe("その場で作る（093b）", () => {
  it("同じ IP からは 1 日 3 回まで。4 回目は API を呼ぶ前に断り、ほかの IP は通る", async () => {
    setClientFactory(() => null);
    for (let i = 0; i < 3; i++) expect((await make("203.0.113.1")).status).toBe(503);
    const fourth = await make("203.0.113.1");
    expect(fourth.status).toBe(429);
    expect(((await fourth.json()) as { error: string }).error).toContain("1 日 3 回");
    expect((await make("203.0.113.2")).status).toBe(503);
  });

  it("決まりが 2 つ取れても、作るのは架空の会社の 1 枚だけ。費用は公開デモの用途で記録される", async () => {
    stub();
    const before = await demoCards();
    const res = await make("203.0.113.10");
    expect(res.status).toBe(201);
    const card = (await res.json()) as { id: string; rules: number; body: { words?: unknown } };
    expect(card.rules).toBe(2);
    expect(card.body.words).toBeTruthy();
    expect(await demoCards()).toBe(before + 1);
    const calls = await env.DB.prepare("SELECT label FROM api_calls WHERE purpose = 'demo' ORDER BY id DESC LIMIT 4").all<{ label: string }>();
    expect(calls.results.map((r) => r.label)).toContain("取り出し（公開デモ）");
    // 絵の数字の前に脚本を書かせる（11/5）
    expect(calls.results.map((r) => r.label)).toContain("脚本");
  });

  it("その日の公開デモの費用が多くても止まらない（1 日の USD の上限は付けない）", async () => {
    stub();
    await env.DB.prepare("INSERT INTO api_calls (at, purpose, label, model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, usd, ms, ok) VALUES (?, 'demo', 'テスト', 'x', 0, 0, 0, 0, 500, 0, 1)").bind(new Date().toISOString()).run();
    expect((await make("203.0.113.11")).status).toBe(201);
  });

  it("文が無い・長すぎるときは数えずに断る", async () => {
    expect((await make("203.0.113.20", "")).status).toBe(400);
    expect((await make("203.0.113.20", "あ".repeat(1001))).status).toBe(400);
    setClientFactory(() => null);
    for (let i = 0; i < 3; i++) expect((await make("203.0.113.20")).status).toBe(503);
  });
});

describe("本番の公開の置き場（PUBLIC_DEMO）", () => {
  const pub = (path: string, init?: RequestInit) => app.request(path, init, { ...env, PUBLIC_DEMO: "1" });
  const post = (body: unknown = {}) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("練習用と架空の会社は見るだけ。作る・直す・戻すは断る", async () => {
    expect((await pub("/api/t/demo/cards")).status).toBe(200);
    expect((await pub("/api/t/practice/cards")).status).toBe(200);
    for (const [path, init] of [
      ["/api/t/demo/cards", post({ card: {} })],
      ["/api/t/demo/extract", post({ text: "盤に触る前に検電する" })],
      ["/api/t/practice/extract", post({ text: "盤に触る前に検電する" })],
      ["/api/t/demo/reset", post()],
    ] as const)
      expect((await pub(path, init)).status, path).toBe(403);
    // カードを開いた印は関所を通る（カードが無いので 404）
    expect((await pub("/api/t/demo/cards/none/open", post())).status).toBe(404);
  });

  it("会社のテナントは今までどおり PIN の関所が働き、架空の会社の MCP も鍵が要る", async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO tenants (id, kind, name, pin_hash) VALUES ('co-pub', 'company', '会社', 'aa:bb')").run();
    expect((await pub("/api/t/co-pub/cards")).status).toBe(401);
    const rpc = await pub("/mcp/demo", post({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(rpc.status).toBe(401);
    // 手元（PUBLIC_DEMO なし）では、架空の会社は今までどおり鍵なしで試せる
    expect((await app.request("/mcp/demo", post({ jsonrpc: "2.0", id: 1, method: "tools/list" }), env)).status).toBe(200);
  });
});
