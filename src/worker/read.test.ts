import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown, headers: Record<string, string> = {}): RequestInit => ({ method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

async function cardWith(status: string, rule: string) {
  const c = (await (await call("/api/t/practice/cards", json("POST", { card: { ...sampleCard(), rule } }))).json()) as { id: string };
  await env.DB.prepare("UPDATE cards SET status = ? WHERE id = ?").bind(status, c.id).run();
  return c.id;
}

describe("新入社員の閲覧の入口（028）", () => {
  it("署名済みのカードだけが一覧に出て、未署名・停止は一覧にも 1 枚にも出ない", async () => {
    const ids: Record<string, string> = {};
    for (const s of ["draft", "ai_draft", "pending", "ok", "signed", "stopped"]) ids[s] = await cardWith(s, `028 ${s}`);
    const list = (await (await call("/api/t/practice/read/cards")).json()) as { cards: { id: string; rule: string }[] };
    const mine = list.cards.filter((x) => x.rule.startsWith("028 "));
    expect(mine.map((x) => x.id)).toEqual([ids.signed]);
    expect((await call(`/api/t/practice/read/cards/${ids.signed}`)).status).toBe(200);
    for (const s of ["draft", "ai_draft", "pending", "ok", "stopped"]) expect((await call(`/api/t/practice/read/cards/${ids[s]}`)).status, s).toBe(404);
  });

  it("経路や部品の理由は返さない", async () => {
    const id = await cardWith("signed", "028 経路なし");
    const c = (await (await call(`/api/t/practice/read/cards/${id}`)).json()) as Record<string, unknown>;
    expect(Object.keys(c).sort()).toEqual(["frames", "id", "motion", "rule", "why", "words"]);
    expect(JSON.stringify(c)).not.toContain("sources");
  });

  it("新入社員の役割のしるしで読め、停止すると消える。別のテナントからは見えない", async () => {
    const id = await cardWith("signed", "028 停止");
    const nh = { "x-role": ((await (await call("/api/t/practice/login", json("POST", { role: "newhire" }))).json()) as { token: string }).token };
    expect((await call(`/api/t/practice/read/cards/${id}`, json("GET", undefined, nh))).status).toBe(200);
    await env.DB.prepare("UPDATE cards SET status = 'stopped' WHERE id = ?").bind(id).run();
    expect((await call(`/api/t/practice/read/cards/${id}`, json("GET", undefined, nh))).status).toBe(404);
    const other = await cardWith("signed", "028 別のテナント");
    expect((await call(`/api/t/demo/read/cards/${other}`)).status).toBe(404);
  });
});
