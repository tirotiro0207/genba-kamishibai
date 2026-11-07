import type Anthropic from "@anthropic-ai/sdk";
import { exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOTION } from "../../tests/fixtures/card";
import { setClientFactory } from "./claude-client";

// 点検表の 1 項目は束になり、原則は 1 コマで作れる（11/7 既定）。束の側は取り出しの分割待ちで止めてある
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;
const WORDS = { ja: "かぎを たしかめる。", vi: "", terms: [] };
const item = (text: string, step: number | null, parent: string | null, line: number) => ({ kind: "do", text, from: { quote: text, lines: [line] }, reasons: [], checklist: step !== null, reworded: false, step, parent });
const PARTS = [{ type: "figure", index: 0, statement: "s1", reason: "人" }, { type: "prop", index: 0, statement: "s1", reason: "検電器" }, { type: "prop", index: 1, statement: "s1", reason: "盤" }];
const CHECKED = structuredClone(MOTION);
for (const k of CHECKED.keyframes) k.props.push({ ...k.props[1], kind: "check_mark", show: k.t === 3 });
const sent: string[] = [];

describe("束と原則の 1 コマの作成", () => {
  beforeAll(() =>
    setClientFactory(() => ({
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
          const sys = String(p.system);
          if (sys.includes("言葉」の欄")) return reply(WORDS);
          if (sys.includes("カードの下ごしらえ"))
            return reply({ rules: [item("安全帯のかぎを確かめる", 1, "使う前の点検", 1), item("ヘルメットのひもを確かめる", 2, "使う前の点検", 2), item("いつも足元を見る", null, null, 3)] });
          sent.push(sys);
          if (sys.includes("原則（いつも守る心がまえ）の 1 コマ")) {
            const k = MOTION.keyframes[0];
            return reply({ motion: { keyframes: [{ ...k, t: 0, mark: true }] }, parts: PARTS, why: "足元の物につまずくから" });
          }
          return reply({ motion: CHECKED, parts: [...PARTS, { type: "prop", index: 2, statement: "s1", reason: "確かめた印" }], why: "落ちないため" });
        },
      },
    })),
  );
  afterAll(() => setClientFactory(null));

  const start = async () => {
    const x = (await (await call("/api/t/practice/extract", json("POST", { text: "安全帯のかぎを確かめる\nヘルメットのひもを確かめる\nいつも足元を見る" }))).json()) as { id: string };
    await call(`/api/t/practice/extract/${x.id}/ok`, json("POST", { items: [0, 1, 2] }));
    return x.id;
  };

  it("点検表の項目は、同じ見出しの束（順番・枚数・親の文）になる", async () => {
    const id = await start();
    const second = await call(`/api/t/practice/extract/${id}/make`, json("POST", { item: 1 }));
    expect(second.status).toBe(201);
    const c2 = (await second.json()) as { body: { bundle: unknown; frames: unknown[] } };
    expect(c2.body.bundle).toEqual({ id: `${id}:使う前の点検`, order: 2, total: 2, parent: "使う前の点検" });
    expect(sent.at(-1)).toContain("「使う前の点検」の 2 番目の 1 項目");
  });

  it("原則は、四角の形を断り、束の無い 1 コマのカードになる", async () => {
    const id = await start();
    expect((await call(`/api/t/practice/extract/${id}/make`, json("POST", { item: 2, shape: "square" }))).status).toBe(400);
    const p = await call(`/api/t/practice/extract/${id}/make`, json("POST", { item: 2, shape: "principle" }));
    expect(p.status).toBe(201);
    expect(sent.at(-1)).toContain("原則（いつも守る心がまえ）の 1 コマ");
    const c3 = (await p.json()) as { body: { shape: string; frames: unknown[]; bundle?: unknown } };
    expect(c3.body).toMatchObject({ shape: "principle" });
    expect(c3.body.frames).toHaveLength(1);
    expect(c3.body.bundle).toBeUndefined();
  });
});
