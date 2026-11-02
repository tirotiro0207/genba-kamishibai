import type Anthropic from "@anthropic-ai/sdk";
import { exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { setClientFactory } from "./claude-client";
import { signRole } from "./people";

// 危険の印と、いつも出しておく数字（048）
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const tenant = "practice";
const base = `/api/t/${tenant}/cards`;
const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;
const PNG = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0));
const post = (path: string, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) => call(path, { method: "POST", headers, body: JSON.stringify(body) });
let dangerous = false;

async function checked() {
  const { id } = (await (await post(base, { card: sampleCard() })).json()) as { id: string };
  expect((await post(`${base}/${id}/status`, { to: "pending" })).status).toBe(200);
  expect((await post(`${base}/${id}/verify`, { frames: [PNG, PNG, PNG] })).status).toBe(200);
  return id;
}

describe("危険の印（048）", () => {
  beforeAll(() =>
    setClientFactory(() => ({
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) =>
          String(p.system).includes("新入社員です")
            ? reply({ frames: [], meaning: "触ってよい", do: "触る", dont: null, why_guess: null, confidence: 50 })
            : reply({ points: [{ id: "s1", credit: "full", frame: 1, reason: "r" }, { id: "s2", credit: "full", frame: 2, reason: "r" }], dangerous, danger_reason: dangerous ? "当てずに触ってよいと読める" : null, summary: "s" }),
      },
    })),
  );
  afterAll(() => setClientFactory(null));

  it("危ない読み違いのカードは、率が高くても赤で、OK も署名も断る。確かめ直して危なくなければ OK できる", async () => {
    dangerous = true;
    const id = await checked();
    const card = (await (await call(`${base}/${id}`)).json()) as { verify: { band: string; dangerous: boolean; rate: number } };
    expect(card.verify).toMatchObject({ band: "red", dangerous: true, rate: 100 });
    const ok = await post(`${base}/${id}/status`, { to: "ok" });
    expect(ok.status).toBe(409);
    expect(((await ok.json()) as { error: string }).error).toMatch(/危険の印/);
    const sup = { "content-type": "application/json", "x-role": await signRole("test-secret", tenant, { role: "supervisor", slot: 1 }) };
    expect((await post(`${base}/${id}/sign`, { version: 1 }, sup)).status).toBe(409);
    dangerous = false;
    expect((await post(`${base}/${id}/verify`, { frames: [PNG, PNG, PNG] })).status).toBe(200);
    expect((await post(`${base}/${id}/status`, { to: "ok" })).status).toBe(200);
  });

  it("数字の受け口は、危ない読み違いの枚数・1 枚の分・伝わる率を返す", async () => {
    const before = (await (await call(`${base}/stats`)).json()) as { dangerous: number; checked: number };
    dangerous = true;
    await checked();
    dangerous = false;
    await checked();
    const after = (await (await call(`${base}/stats`)).json()) as { dangerous: number; checked: number; rate: number | null; minutes: number | null };
    expect(after.dangerous).toBe(before.dangerous + 1);
    expect(after.checked).toBe(before.checked + 2);
    expect(after.rate).toBe(100);
    const nh = { "x-role": await signRole("test-secret", tenant, { role: "newhire", slot: 1 }) };
    expect((await call(`${base}/stats`, { headers: nh })).status).toBe(403);
  });
});
