import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";

// ① で見せるもの（11/5 作者）: 項目ごとにカードとページの画像を結び、参加者の組のとおりに片方だけを返す
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const t = "/api/t/practice";

async function card(rule: string) {
  const vi = "Trước khi chạm vào tủ điện, hãy kiểm tra.";
  return ((await (await call(`${t}/cards`, json("POST", { card: { ...sampleCard(), rule, words: { ja: "たしかめます。", vi } } }))).json()) as { id: string }).id;
}

describe("① で見せるもの（11/5）", () => {
  it("カードとページの画像を結び、組 1 と組 2 で見せるものが入れ替わる。言葉はやさしい日本語だけ", async () => {
    const [ca, cb] = [await card("① 検電"), await card("① 吊り荷")];
    for (const p of ["pages/p49.png", "pages/p62.png"]) expect((await call(`${t}/files/${p}`, { method: "PUT", headers: { "content-type": "image/png" }, body: new Uint8Array([137, 80, 78, 71]) })).status).toBe(201);
    const people = ["v1", "v2"].map((id) => ({ id, group: "ベトナム" }));
    const trial = (await (await call(`${t}/trials`, json("POST", { design: "cross", participants: people, seed: "m-1" }))).json()) as { id: string; assignments: { participant: string; set: number }[] };
    const base = `${t}/trials/${trial.id}/material`;
    expect((await call(`${base}?participant=v1`)).status).toBe(409);
    expect((await call(base, json("PUT", { A: { card: ca, page: "pages/none.png" }, B: { card: cb, page: "pages/p62.png" } }))).status).toBe(400);
    expect((await call(base, json("PUT", { A: { card: ca, page: "pages/p49.png" }, B: { card: cb, page: "pages/p62.png" } }))).status).toBe(201);
    const got = await Promise.all(
      ["v1", "v2"].map(async (p) => (await (await call(`${base}?participant=${p}`)).json()) as { items: { item: string; shown: string; page?: string; card?: { words: Record<string, string> } }[] }),
    );
    for (const g of got) {
      expect(g.items.map((x) => x.shown).sort()).toEqual(["card", "text"]);
      const c = g.items.find((x) => x.shown === "card")!;
      expect(c.card!.words).toEqual({ ja: "たしかめます。" });
      expect(g.items.find((x) => x.shown === "text")!.page).toMatch(/^pages\/p(49|62)\.png$/);
    }
    // 2 人は組が違うので、項目 A で見せるものが逆
    expect(got[0].items[0].shown).not.toBe(got[1].items[0].shown);
    // 答えが始まったら結び付けは変えない
    await call(`${t}/trials/${trial.id}/responses`, json("POST", { participant: "v1", item: "A", ms: 3000, answer: "x" }));
    expect((await call(base, json("PUT", { A: { card: cb, page: "pages/p49.png" }, B: { card: ca, page: "pages/p62.png" } }))).status).toBe(409);
  });
});
