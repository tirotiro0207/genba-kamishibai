import type Anthropic from "@anthropic-ai/sdk";
import { exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOTION } from "../../tests/fixtures/card";
import { setClientFactory } from "./claude-client";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;

describe("正式な流れの作成の API（034a）", () => {
  beforeAll(() =>
    setClientFactory(() => ({
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
          if (String(p.system).includes("カードの下ごしらえ"))
            return reply({ rules: [{ kind: "do", text: "盤に触る前に検電する", from: { quote: "盤に触る前に検電する", lines: [2] }, reasons: [{ text: "感電を防ぐ", from: { quote: "感電", lines: [3] }, stated: true }], checklist: false, reworded: false }] });
          return reply({ motion: MOTION, parts: [{ type: "figure", index: 0, statement: "s1", reason: "人" }, { type: "prop", index: 0, statement: "s1", reason: "検電器" }, { type: "prop", index: 1, statement: "s2", reason: "盤" }], why: null });
        },
      },
    })),
  );
  afterAll(() => setClientFactory(null));

  it("OK した項目から未承認の下書きが 1 枚でき、元のページと行の経路と監査の記録が付く", async () => {
    const x = (await (await call("/api/t/practice/extract", json("POST", { text: "見出し\n盤に触る前に検電する\n感電のおそれ", source: { kind: "doc", doc: "manual", pages: [{ page: 40, lines: 3 }] } }))).json()) as { id: string };
    expect((await call(`/api/t/practice/extract/${x.id}/make`, json("POST", { item: 0 }))).status).toBe(400);
    await call(`/api/t/practice/extract/${x.id}/ok`, json("POST", { items: [0] }));
    const res = await call(`/api/t/practice/extract/${x.id}/make`, json("POST", { item: 0 }));
    expect(res.status).toBe(201);
    const card = (await res.json()) as { id: string; status: string; body: { frames: unknown[]; statements: { sources: unknown[] }[] } };
    expect(card.status).toBe("draft");
    expect(card.body.frames).toHaveLength(3);
    expect(card.body.statements[0].sources).toEqual([{ kind: "doc", doc: "manual", page: 40, line: 2 }]);
    const audit = (await (await call(`/api/t/practice/audit/cards/${card.id}`)).json()) as { entries: { kind: string }[] };
    expect(audit.entries.map((e) => e.kind)).toEqual(["source", "make"]);
  });

  it("話した言葉は、入れた文の字の範囲が元の位置になる", async () => {
    const text = "見出し\n盤に触る前に検電する\n感電のおそれ";
    const x = (await (await call("/api/t/practice/extract", json("POST", { text }))).json()) as { id: string };
    await call(`/api/t/practice/extract/${x.id}/ok`, json("POST", { items: [0] }));
    const card = (await (await call(`/api/t/practice/extract/${x.id}/make`, json("POST", { item: 0 }))).json()) as { body: { statements: { sources: { start: number; end: number; input: string }[] }[] } };
    const s = card.body.statements[0].sources[0];
    expect(s.input).toBe(x.id);
    expect(text.slice(s.start, s.end)).toBe("盤に触る前に検電する");
  });
});
