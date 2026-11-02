import type Anthropic from "@anthropic-ai/sdk";
import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setClientFactory } from "./claude-client";
import { whereIs } from "./extract";
import { signRole } from "./people";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown, h: Record<string, string> = {}): RequestInit => ({ method, headers: { "content-type": "application/json", ...h }, body: body === undefined ? undefined : JSON.stringify(body) });
const base = "/api/t/practice/extract";
const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];

describe("抜き出しの画面の API（033）", () => {
  beforeAll(() =>
    setClientFactory(() => ({
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
          sent.push(p);
          const rules = [
            { kind: "do", text: "盤に触る前に検電する", from: { quote: "盤に触る前に検電する", lines: [3] }, reasons: [{ text: "感電を防ぐ", from: { quote: "感電", lines: [4] }, stated: true }], checklist: false, reworded: false },
            { kind: "do", text: "点検表で確かめる", from: { quote: "点検表", lines: [5] }, reasons: [], checklist: true, reworded: false },
          ];
          return { model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ rules }) }], usage: { input_tokens: 100, output_tokens: 50 } } as unknown as Anthropic.Message;
        },
      },
    })),
  );
  afterAll(() => setClientFactory(null));

  const TEXT = "見出し\n本文\n盤に触る前に検電する\n感電のおそれ\n点検表";

  it("文から決まりと「どこから」を出し、資料なら元のページと行に戻し、呼び出しを記録する", async () => {
    const res = await call(base, json("POST", { text: TEXT, source: { kind: "doc", doc: "manual", pages: [{ page: 30, lines: 2 }, { page: 31, lines: 3 }] } }));
    expect(res.status).toBe(201);
    const x = (await res.json()) as { id: string; rules: { where: { page: number; line: number }; checklist: boolean; reasons: { where: { page: number; line: number } }[] }[] };
    expect(x.rules[0].where).toEqual({ page: 31, line: 1 });
    expect(x.rules[0].reasons[0].where).toEqual({ page: 31, line: 2 });
    expect(x.rules[1].checklist).toBe(true);
    expect(String(sent.at(-1)?.messages[0].content)).toContain("3| 盤に触る前に検電する");
    const log = await env.DB.prepare("SELECT purpose, label FROM api_calls WHERE label = '取り出し（画面）'").first();
    expect(log).toEqual({ purpose: "app", label: "取り出し（画面）" });
  });

  it("OK は決まりの番号で追記され、最後のものを使う", async () => {
    const x = (await (await call(base, json("POST", { text: TEXT }))).json()) as { id: string };
    expect((await call(`${base}/${x.id}/ok`, json("POST", { items: [0, 1] }))).status).toBe(201);
    expect((await call(`${base}/${x.id}/ok`, json("POST", { items: [1] }))).status).toBe(201);
    expect((await call(`${base}/${x.id}/ok`, json("POST", { items: [5] }))).status).toBe(400);
    const got = (await (await call(`${base}/${x.id}`)).json()) as { ok: number[]; input: { source: { kind: string } } };
    expect(got.ok).toEqual([1]);
    expect(got.input.source.kind).toBe("speech");
    await expect(env.DB.prepare("UPDATE extraction_oks SET items = '[]'").run()).rejects.toThrow(/append only/);
  });

  it("入力が無い・行の数が合わない・鍵が無い・新入社員・別のテナントは断る", async () => {
    expect((await call(base, json("POST", { text: "" }))).status).toBe(400);
    expect((await call(base, json("POST", { text: "a\nb", source: { kind: "doc", doc: "m", pages: [{ page: 1, lines: 3 }] } }))).status).toBe(400);
    const nh = await signRole("test-secret", "practice", { role: "newhire", slot: 1 });
    expect((await call(base, json("POST", { text: "a" }, { "x-role": nh }))).status).toBe(403);
    const x = (await (await call(base, json("POST", { text: "a" }))).json()) as { id: string };
    expect((await call(`/api/t/demo/extract/${x.id}`)).status).toBe(404);
    setClientFactory(() => null);
    expect((await call(base, json("POST", { text: "a" }))).status).toBe(503);
  });

  it("行の番号から元のページと行に戻す", () => {
    const s = { kind: "doc" as const, doc: "m", pages: [{ page: 5, lines: 10 }, { page: 6, lines: 4 }] };
    expect(whereIs(s, 10)).toEqual({ page: 5, line: 10 });
    expect(whereIs(s, 11)).toEqual({ page: 6, line: 1 });
    expect(whereIs({ kind: "speech" }, 3)).toEqual({ page: null, line: 3 });
  });
});
