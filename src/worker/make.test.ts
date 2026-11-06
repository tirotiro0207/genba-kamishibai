import type Anthropic from "@anthropic-ai/sdk";
import { exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isScriptCall, MOTION, scriptReply } from "../../tests/fixtures/card";
import { setClientFactory } from "./claude-client";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const WORDS = { ja: "｜盤《ばん》に さわる まえに ｜検電《けんでん》を します。", vi: "Kiểm tra điện trước khi chạm vào tủ điện.", terms: [{ ja: "検電", vi: "kiểm tra điện" }, { ja: "盤", vi: "tủ điện" }] };
const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;

describe("正式な流れの作成の API（034a）", () => {
  beforeAll(() =>
    setClientFactory(() => ({
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
          if (isScriptCall(p.system)) return reply(scriptReply(p.system));
          if (String(p.system).includes("言葉」の欄")) return reply(WORDS);
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

  it("言葉の欄が付き、現場の言葉がどのカードで使うかと一緒に用語表に積まれる（036）", async () => {
    const x = (await (await call("/api/t/practice/extract", json("POST", { text: "見出し\n盤に触る前に検電する\n感電のおそれ" }))).json()) as { id: string };
    await call(`/api/t/practice/extract/${x.id}/ok`, json("POST", { items: [0] }));
    const card = (await (await call(`/api/t/practice/extract/${x.id}/make`, json("POST", { item: 0 }))).json()) as { id: string; body: { words?: { ja: string; vi: string } } };
    expect(card.body.words).toEqual({ ja: WORDS.ja, vi: WORDS.vi });
    const g = (await (await call("/api/t/practice/cards/glossary")).json()) as { terms: { ja: string; vi: string[]; cards: string[]; checked: boolean }[] };
    const t = g.terms.find((x) => x.ja === "検電")!;
    expect(t.vi).toEqual(["kiểm tra điện"]);
    expect(t.cards).toContain(card.id);
    expect(t.checked).toBe(false);
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

  it("「監修者に確認」の印を理由つきで付けて作れ、カードと ② の行に残る。文字でない印は断る（039）", async () => {
    const x = (await (await call("/api/t/practice/extract", json("POST", { text: "見出し\n盤に触る前に検電する\n感電のおそれ" }))).json()) as { id: string };
    await call(`/api/t/practice/extract/${x.id}/ok`, json("POST", { items: [0] }));
    expect((await call(`/api/t/practice/extract/${x.id}/make`, json("POST", { item: 0, ask: 3 }))).status).toBe(400);
    const card = (await (await call(`/api/t/practice/extract/${x.id}/make`, json("POST", { item: 0, ask: "  言い換えた文なので確かめてほしい " }))).json()) as { id: string; ask: string | null };
    expect(card.ask).toBe("言い換えた文なので確かめてほしい");
    expect(((await (await call(`/api/t/practice/cards/${card.id}`)).json()) as { ask: string | null }).ask).toBe("言い換えた文なので確かめてほしい");
    const audit = (await (await call(`/api/t/practice/audit/cards/${card.id}`)).json()) as { entries: { kind: string; payload: { ask?: string } }[] };
    expect(audit.entries.find((e) => e.kind === "make")!.payload.ask).toBe("言い換えた文なので確かめてほしい");
    // 付けなければ印は無い
    const plain = (await (await call(`/api/t/practice/extract/${x.id}/make`, json("POST", { item: 0 }))).json()) as { ask: string | null };
    expect(plain.ask).toBeNull();
  });
});

describe("AI 下書きの判定（035）", () => {
  beforeAll(() =>
    setClientFactory(() => ({
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
          if (isScriptCall(p.system)) return reply(scriptReply(p.system));
          if (String(p.system).includes("言葉」の欄")) return reply(WORDS);
          if (String(p.system).includes("カードの下ごしらえ"))
            return reply({ rules: [{ kind: "do", text: "盤に触る前に 2 回検電する", from: { quote: "盤に触る前に検電する", lines: [2] }, reasons: [{ text: "感電を防ぐ", from: { quote: "盤に触る前に検電する", lines: [2] }, stated: false }], checklist: false, reworded: false }] });
          return reply({ motion: MOTION, parts: [{ type: "figure", index: 0, statement: "s1", reason: "人" }, { type: "prop", index: 0, statement: "s1", reason: "検電器" }, { type: "prop", index: 1, statement: "s2", reason: "盤" }], why: null });
        },
      },
    })),
  );
  afterAll(() => setClientFactory(null));

  it("元の文に無い理由と数字のカードは AI 下書きで保存され、監査の記録にその理由が残る", async () => {
    const x = (await (await call("/api/t/practice/extract", json("POST", { text: "見出し\n盤に触る前に検電する" }))).json()) as { id: string };
    await call(`/api/t/practice/extract/${x.id}/ok`, json("POST", { items: [0] }));
    const card = (await (await call(`/api/t/practice/extract/${x.id}/make`, json("POST", { item: 0 }))).json()) as { id: string; status: string; body: unknown };
    expect(card.status).toBe("ai_draft");
    const audit = (await (await call(`/api/t/practice/audit/cards/${card.id}`)).json()) as { entries: { kind: string; payload: { reasons?: string[] } }[] };
    expect(audit.entries.map((e) => e.kind)).toEqual(["source", "make", "ai_draft"]);
    expect(audit.entries[2].payload.reasons).toEqual(["s2 の理由は元の文に無い（AI が書いた）", "s1 の数字 「2」が元の文に無い"]);

    // 人が直しても AI が書いた文が残っていれば AI 下書きのまま
    const put = await call(`/api/t/practice/cards/${card.id}`, json("PUT", { card: card.body, reason: "言い回し" }));
    expect(((await put.json()) as { status: string }).status).toBe("ai_draft");
  });
});
