import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { signRole } from "./people";

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
    // 停止は監修者だけ（030b）
    const sup = await signRole("test-secret", "practice", { role: "supervisor", slot: 1 });
    expect((await call(`${base}/${c.id}/status`, { ...json("POST", { to: "stopped" }), headers: { "content-type": "application/json", "x-role": sup } })).status).toBe(200);
    expect((await move(c.id, "signed")).status).toBe(403);
  });

  it("別のテナントのカードは見えない", async () => {
    const c = await newCard();
    expect((await call(`/api/t/demo/cards/${c.id}`)).status).toBe(404);
    expect((await call(`/api/t/demo/cards/${c.id}/status`, json("POST", { to: "pending" }))).status).toBe(404);
  });
});

describe("枠と指示（044a）", () => {
  const box = { x: 0.5, y: 0.3, w: 0.3, h: 0.4 };
  const fix = (id: string, b: unknown) => call(`${base}/${id}/fix`, json("POST", b));

  it("枠と文を ④ 人の直しの 1 行に残す", async () => {
    const c = await newCard();
    const res = await fix(c.id, { frame: 1, box, text: "  検電器を盤に近づける  " });
    expect(res.status).toBe(202);
    const got = (await res.json()) as { n: number; version: number; t: number; text: string };
    expect(got).toMatchObject({ version: 1, t: 2, text: "検電器を盤に近づける" });
    const log = (await (await call(`/api/t/practice/audit/cards/${c.id}`)).json()) as { entries: { kind: string; n: number; payload: Record<string, unknown> }[] };
    const row = log.entries.find((e) => e.n === got.n)!;
    expect(row.kind).toBe("edit");
    expect(row.payload).toMatchObject({ request: "redo", version: 1, frame: 1, t: 2, box, text: "検電器を盤に近づける" });
  });

  it("枠が無い・小さい・外に出る、文が空、コマの番号が違うときは断る", async () => {
    const c = await newCard();
    for (const b of [
      { frame: 0, text: "x" },
      { frame: 0, box: { ...box, w: 0.01 }, text: "x" },
      { frame: 0, box: { ...box, x: 0.9 }, text: "x" },
      { frame: 0, box, text: "   " },
      { frame: 3, box, text: "x" },
    ]) expect((await fix(c.id, b)).status).toBe(400);
  });

  it("署名済みと停止したカードには送れない", async () => {
    const c = await newCard();
    await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(c.id).run();
    expect((await fix(c.id, { frame: 0, box, text: "x" })).status).toBe(409);
  });
});
