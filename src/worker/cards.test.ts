import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const base = "/api/t/practice/cards";

async function newCard() {
  const res = await call(base, json("POST", { card: sampleCard() }));
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; status: string; version: number };
}
const move = (id: string, to: string) => call(`${base}/${id}/status`, json("POST", { to }));

describe("カードの保存と状態（019）", () => {
  it("作ると未承認の下書き（版 1）になり、経路の無いカードは保存できない", async () => {
    const c = await newCard();
    expect(c).toMatchObject({ status: "draft", version: 1 });
    const bad = sampleCard();
    bad.parts.pop();
    const res = await call(base, json("POST", { card: bad }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { errors: string[] }).errors.join()).toMatch(/経路が無い/);
  });

  it("許された移り方だけが通り、署名はここからはできない", async () => {
    const c = await newCard();
    expect((await move(c.id, "ok")).status).toBe(409);
    expect((await move(c.id, "pending")).status).toBe(200);
    expect((await move(c.id, "ok")).status).toBe(200);
    expect((await move(c.id, "signed")).status).toBe(403);
    expect((await move(c.id, "nope")).status).toBe(400);
  });

  it("直すと版が上がって下書きに戻り、署名済みは直せない", async () => {
    const c = await newCard();
    await move(c.id, "pending");
    const fixed = { ...sampleCard(), why: "感電して大けがをするから" };
    const r = (await (await call(`${base}/${c.id}`, json("PUT", { card: fixed }))).json()) as { status: string; version: number };
    expect(r).toMatchObject({ status: "draft", version: 2 });
    await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(c.id).run();
    expect((await call(`${base}/${c.id}`, json("PUT", { card: fixed }))).status).toBe(409);
    expect((await move(c.id, "stopped")).status).toBe(200);
    expect((await move(c.id, "signed")).status).toBe(403);
  });

  it("別のテナントのカードは見えない", async () => {
    const c = await newCard();
    expect((await call(`/api/t/demo/cards/${c.id}`)).status).toBe(404);
    expect((await call(`/api/t/demo/cards/${c.id}/status`, json("POST", { to: "pending" }))).status).toBe(404);
  });
});
