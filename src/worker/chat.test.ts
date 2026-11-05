import type Anthropic from "@anthropic-ai/sdk";
import { exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDF_MODEL } from "./chat";
import { setClientFactory } from "./claude-client";
import { signRole } from "./people";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown, h: Record<string, string> = {}): RequestInit => ({ method, headers: { "content-type": "application/json", ...h }, body: body === undefined ? undefined : JSON.stringify(body) });
const base = "/api/t/practice/chats";
const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
const reply = (body: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(body) }], usage: { input_tokens: 100, output_tokens: 50 } }) as unknown as Anthropic.Message;

type Chat = { id: string; messages: { role: string; text: string; files?: string[]; extraction?: string; rules?: number }[]; files: { name: string }[] };

describe("新しいカードを作るチャット", () => {
  beforeAll(() =>
    setClientFactory(() => ({
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
          sent.push(p);
          if (p.model === PDF_MODEL) return { ...reply({ pages: [{ page: 1, text: "表紙" }, { page: 2, text: "盤に触る前に検電する\n感電のおそれ" }] }), model: PDF_MODEL } as Anthropic.Message;
          return reply({ rules: [{ kind: "do", text: "盤に触る前に検電する", from: { quote: "盤に触る前に検電する", lines: [3] }, reasons: [], checklist: false, reworded: false }] });
        },
      },
    })),
  );
  afterAll(() => setClientFactory(null));

  it("添付と指示を送るたびに、資料ぜんぶから取り出しをやり直し、指示を渡し、元のページに戻す", async () => {
    const chat = (await (await call(base, json("POST"))).json()) as Chat;
    const files = [{ name: "手順.txt", text: "見出し\n本文" }, { name: "安全.pdf", text: "盤に触る前に検電する\n感電", pages: [{ page: 7, lines: 2 }] }];
    const res = await call(`${base}/${chat.id}/messages`, json("POST", { text: "検電の決まりだけ", files }));
    expect(res.status).toBe(201);
    const got = (await res.json()) as Chat;
    expect(got.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(got.messages[0].files).toEqual(["手順.txt", "安全.pdf"]);
    expect(got.messages[1].rules).toBe(1);
    expect(String(sent.at(-1)?.messages[0].content)).toContain("作る人の指示");
    expect(String(sent.at(-1)?.messages[0].content)).toContain("検電の決まりだけ");
    const x = (await (await call(`/api/t/practice/extract/${got.messages[1].extraction}`)).json()) as { rules: { where: { page: number; line: number } }[] };
    expect(x.rules[0].where).toEqual({ page: 7, line: 1 });

    // 2 回目は添付なしの指示だけ。資料は前のものを使う
    const again = (await (await call(`${base}/${chat.id}/messages`, json("POST", { text: "理由も入れて" }))).json()) as Chat;
    expect(again.messages).toHaveLength(4);
    expect(again.files.map((f) => f.name)).toEqual(["手順.txt", "安全.pdf"]);
    expect(String(sent.at(-1)?.messages[0].content)).toContain("検電の決まりだけ\n理由も入れて");
    const list = (await (await call(base)).json()) as { chats: Chat[] };
    expect(list.chats.some((c) => c.id === chat.id)).toBe(true);
  });

  it("資料が無いときは、書いた言葉を元の文にし、指示としては渡さない", async () => {
    const chat = (await (await call(base, json("POST"))).json()) as Chat;
    const got = (await (await call(`${base}/${chat.id}/messages`, json("POST", { text: "脚立の天板に乗らない" }))).json()) as Chat;
    expect(got.messages[1].extraction).toBeTruthy();
    expect(String(sent.at(-1)?.messages[0].content)).toContain("1| 脚立の天板に乗らない");
    expect(String(sent.at(-1)?.messages[0].content)).not.toContain("作る人の指示");
  });

  it("PDF はページごとの文字にして返す。PDF でないもの・新入社員・空の送信は断る", async () => {
    const pdf = await call(`${base}/pdf`, { method: "POST", headers: { "content-type": "application/pdf" }, body: "%PDF-1.7 test" });
    expect(pdf.status).toBe(200);
    expect(await pdf.json()).toEqual({ text: "表紙\n盤に触る前に検電する\n感電のおそれ", pages: [{ page: 1, lines: 1 }, { page: 2, lines: 2 }] });
    expect(JSON.stringify(sent.at(-1)?.messages[0].content)).toContain('"media_type":"application/pdf"');
    expect((await call(`${base}/pdf`, { method: "POST", body: "hello" })).status).toBe(400);
    const nh = await signRole("test-secret", "practice", { role: "newhire", slot: 1 });
    expect((await call(base, json("POST", undefined, { "x-role": nh }))).status).toBe(403);
    const chat = (await (await call(base, json("POST"))).json()) as Chat;
    expect((await call(`${base}/${chat.id}/messages`, json("POST", {}))).status).toBe(400);
    expect((await call(`${base}/${chat.id}/messages`, json("POST", { files: [{ name: "a.txt", text: "a\nb", pages: [{ page: 1, lines: 5 }] }] }))).status).toBe(400);
    expect((await call(`/api/t/other/chats/${chat.id}`)).status).not.toBe(200);
  });
});
