import type Anthropic from "@anthropic-ai/sdk";
import { exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BudgetExceededError } from "../shared/claude";
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
    // 添付が 2 つのときは、どの資料のページかも持つ（A の 1 ページと B の 1 ページを取り違えない）
    expect(x.rules[0].where).toEqual({ page: 7, line: 1, doc: "安全.pdf" });

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

  it("写真（貼り紙）の文字は 1 枚 1 ページで返す。写真でないものは断る（11/7）", async () => {
    const img = await call(`${base}/image`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) });
    expect(img.status).toBe(200);
    expect(((await img.json()) as { pages: unknown }).pages).toEqual([{ page: 1, lines: 3 }]);
    expect(JSON.stringify(sent.at(-1)?.messages[0].content)).toContain('"media_type":"image/jpeg"');
    expect((await call(`${base}/image`, { method: "POST", headers: { "content-type": "application/pdf" }, body: "x" })).status).toBe(400);
  });
  it("PDF はページごとの文字にして返す。PDF でないもの・新入社員・空の送信は断る", async () => {
    const pdf = await call(`${base}/pdf`, { method: "POST", headers: { "content-type": "application/pdf" }, body: "%PDF-1.7 test" });
    expect(pdf.status).toBe(200);
    expect(await pdf.json()).toEqual({ text: "表紙\n盤に触る前に検電する\n感電のおそれ", pages: [{ page: 1, lines: 1 }, { page: 2, lines: 2 }] });
    expect(JSON.stringify(sent.at(-1)?.messages[0].content)).toContain('"media_type":"application/pdf"');
    // SDK は流し読みでない呼び出しで約 21,333 を超える長さを、呼ぶ前に止める
    expect(sent.at(-1)?.max_tokens).toBeLessThanOrEqual(21333);
    expect((await call(`${base}/pdf`, { method: "POST", body: "hello" })).status).toBe(400);
    const nh = await signRole("test-secret", "practice", { role: "newhire", slot: 1 });
    expect((await call(base, json("POST", undefined, { "x-role": nh }))).status).toBe(403);
    const chat = (await (await call(base, json("POST"))).json()) as Chat;
    expect((await call(`${base}/${chat.id}/messages`, json("POST", {}))).status).toBe(400);
    expect((await call(`${base}/${chat.id}/messages`, json("POST", { files: [{ name: "a.txt", text: "a\nb", pages: [{ page: 1, lines: 5 }] }] }))).status).toBe(400);
    // 別のテナント（ある架空の会社）からは、同じ番号のチャットは見えない
    expect((await call(`/api/t/demo/chats/${chat.id}`)).status).toBe(404);
  });

  it("資料が長すぎるときは、足した添付を資料からも指示の行からも外す", async () => {
    const chat = (await (await call(base, json("POST"))).json()) as Chat;
    const long = Array.from({ length: 2100 }, () => "あいうえおかきくけこ").join("\n");
    const got = (await (await call(`${base}/${chat.id}/messages`, json("POST", { text: "これで", files: [{ name: "長い.txt", text: long }] }))).json()) as Chat;
    expect(got.messages[1].text).toContain("長すぎます");
    expect(got.messages[0].files).toEqual([]);
    expect(got.files).toEqual([]);
  });

  it("取り出しが途中で止まっても、書いた指示は残る。費用の上限は理由を返事にする", async () => {
    setClientFactory(() => ({ messages: { create: async () => { throw new BudgetExceededError("app", "perDay", 1); } } }));
    try {
      const chat = (await (await call(base, json("POST"))).json()) as Chat;
      const got = (await (await call(`${base}/${chat.id}/messages`, json("POST", { text: "脚立の天板に乗らない" }))).json()) as Chat;
      expect(got.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
      expect(got.messages[1].text).toContain("費用の上限");
      setClientFactory(() => ({ messages: { create: async () => { throw new Error("つながらない"); } } }));
      expect((await call(`${base}/${chat.id}/messages`, json("POST", { text: "理由も入れて" }))).status).toBe(500);
      const after = (await (await call(`${base}/${chat.id}`)).json()) as Chat;
      expect(after.messages.at(-1)).toMatchObject({ role: "user", text: "理由も入れて" });
    } finally {
      setClientFactory(() => ({ messages: { create: async (p: Anthropic.MessageCreateParamsNonStreaming) => (sent.push(p), reply({ rules: [] })) } }));
    }
  });
});
