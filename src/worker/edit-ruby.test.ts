import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { addTerms } from "./cards";

// 人の直しでも言葉の欄のふりがなを確かめる・会社の言葉に積まれたふりがなの記法の掃除・訳の無い用語（11/7）
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const send = (method: string, path: string, body: unknown) => call(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const base = "/api/t/practice/cards";

describe("言葉の欄のふりがな（直し）", () => {
  it("words.ja をふりがなの無い漢字に直すと 400、ふりがな付きなら通り、ほかの欄の直しは止めない", async () => {
    const card = { ...sampleCard(), words: { ja: "はこを あける" } };
    const { id } = (await (await send("POST", base, { card })).json()) as { id: string };
    const bad = await send("PUT", `${base}/${id}`, { card: { ...card, words: { ja: "盤を あける" } }, reason: "言葉" });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe("言葉の欄のふりがなが足りない");
    expect((await send("PUT", `${base}/${id}`, { card: { ...card, words: { ja: "｜盤《ばん》を あける" } }, reason: "言葉" })).status).toBe(200);
  });

  it("決まりより前のふりがなの無い言葉は、ほかの欄の直しでは止めない", async () => {
    const card = { ...sampleCard(), words: { ja: "盤を あける" } };
    const { id } = (await (await send("POST", base, { card })).json()) as { id: string };
    expect((await send("PUT", `${base}/${id}`, { card: { ...card, why: "感電するから" }, reason: "なぜ" })).status).toBe(200);
  });
});

describe("会社の言葉の掃除と、訳の無い用語", () => {
  it("掃除の migration は、直しから積んだふりがなの記法の行だけを消す", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO company_words (tenant_id, kind, phrase, prefer, source) VALUES ('practice', 'rephrase', '盤', '｜盤《ばん》', 'edit')"),
      env.DB.prepare("INSERT INTO company_words (tenant_id, kind, phrase, prefer, source) VALUES ('practice', 'rephrase', 'ブレーカー', '主幹', 'edit')"),
    ]);
    const m = env.TEST_MIGRATIONS.find((x) => x.name.startsWith("0031_"))!;
    for (const q of m.queries) await env.DB.prepare(q).run();
    const { results } = await env.DB.prepare("SELECT phrase, prefer FROM company_words WHERE tenant_id = 'practice' AND source = 'edit'").all<{ phrase: string; prefer: string }>();
    expect(results.some((r) => r.prefer.includes("《"))).toBe(false);
    expect(results).toContainEqual({ phrase: "ブレーカー", prefer: "主幹" });
  });

  it("訳の無い用語は用語表にも会社の呼び方にも積まない", async () => {
    await addTerms(env.DB, "practice", "card-x", [{ ja: "検電", vi: "" }, { ja: "盤", vi: "tủ điện" }]);
    const { results } = await env.DB.prepare("SELECT ja FROM glossary WHERE tenant_id = 'practice' AND card_id = 'card-x'").all<{ ja: string }>();
    expect(results.map((r) => r.ja)).toEqual(["盤"]);
  });
});
