import type Anthropic from "@anthropic-ai/sdk";
import { exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { setClientFactory } from "./claude-client";
import { signRole } from "./people";

// 重さ（11/7 既定）: 監修者が確認・署名の前に決める。本文に入り、閲覧に出る。束は閲覧で順番どおりに並ぶ
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const base = "/api/t/practice/cards";
const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;
const MARK = { kind: "finger", png: "data:image/png;base64," + btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3)) };
const PNG = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0));
const as = async (role: "supervisor" | "author" | "trainer") => ({ "content-type": "application/json", "x-role": await signRole("test-secret", "practice", { role, slot: 1 }) });
const send = (method: string, path: string, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) => call(path, { method, headers, body: JSON.stringify(body) });

async function pendingCard(extra: Partial<ReturnType<typeof sampleCard>> = {}) {
  const { id } = (await (await send("POST", base, { card: { ...sampleCard(), ...extra } })).json()) as { id: string };
  expect((await send("POST", `${base}/${id}/status`, { to: "pending" })).status).toBe(200);
  expect((await send("POST", `${base}/${id}/verify`, { frames: [PNG, PNG, PNG] })).status).toBe(200);
  return id;
}

describe("重さと束", () => {
  beforeAll(() =>
    setClientFactory(() => ({
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) =>
          String(p.system).includes("新入社員です")
            ? reply({ frames: [], meaning: "当てる", do: "当てる", dont: null, why_guess: null, confidence: 50 })
            : reply({ points: [{ id: "s1", credit: "full", frame: 1, reason: "r" }, { id: "s2", credit: "full", frame: 2, reason: "r" }], dangerous: false, danger_reason: null, summary: "伝わる" }),
      },
    })),
  );
  afterAll(() => setClientFactory(null));

  it("監修者だけが決め、版が上がっても確かめる AI の証拠は引き継がれて OK・署名でき、閲覧に重さが出る", async () => {
    const id = await pendingCard();
    const sup = await as("supervisor");
    expect((await send("PUT", `${base}/${id}/weight`, { weight: "life" }, await as("author"))).status).toBe(403);
    expect((await send("PUT", `${base}/${id}/weight`, { weight: "heavy" }, sup)).status).toBe(400);
    const res = await send("PUT", `${base}/${id}/weight`, { weight: "life", version: 1 }, sup);
    expect(res.status).toBe(200);
    const v = (await res.json()) as { version: number; status: string; body: { weight: string } };
    expect(v).toMatchObject({ version: 2, status: "pending", body: { weight: "life" } });
    // 証拠が引き継がれているので OK できる
    const one = (await (await call(`${base}/${id}`)).json()) as { verify: unknown };
    expect(one.verify).not.toBeNull();
    expect((await send("POST", `${base}/${id}/status`, { to: "ok" })).status).toBe(200);
    expect((await send("POST", `${base}/${id}/sign`, { version: 2, mark: MARK }, sup)).status).toBe(200);
    // 署名済みはここでは変えない
    expect((await send("PUT", `${base}/${id}/weight`, { weight: "normal" }, sup)).status).toBe(409);
    // 直しの記録（④）に重さの 1 行が残る
    const log = (await (await call(`/api/t/practice/audit/cards/${id}`)).json()) as { entries: { kind: string; payload: { fields?: string[] } }[] };
    expect(log.entries.some((e) => e.kind === "edit" && e.payload.fields?.includes("weight"))).toBe(true);
    const read = (await (await call("/api/t/practice/read/cards")).json()) as { cards: { id: string; weight: string; shape: string }[] };
    expect(read.cards.find((c) => c.id === id)).toMatchObject({ weight: "life", shape: "story" });
  });

  it("過去の事故を「なぜ」の出どころに足すと、版が上がって経路に残る。守ることの文や書き方の足りない事故は断る", async () => {
    const { id } = (await (await send("POST", base, { card: sampleCard() })).json()) as { id: string };
    expect((await send("POST", `${base}/${id}/accident`, { statement: "s1", title: "x", cause: "y" })).status).toBe(400);
    expect((await send("POST", `${base}/${id}/accident`, { statement: "s2", title: "盤で感電した", cause: "" })).status).toBe(400);
    const res = await send("POST", `${base}/${id}/accident`, { statement: "s2", title: "盤で感電した", cause: "検電をしなかった", date: "2024-06" });
    expect(res.status).toBe(200);
    const v = (await res.json()) as { version: number; body: { statements: { id: string; sources: { kind: string }[] }[] } };
    expect(v.version).toBe(2);
    expect(v.body.statements.find((s) => s.id === "s2")!.sources.at(-1)).toEqual({ kind: "accident", title: "盤で感電した", cause: "検電をしなかった", date: "2024-06" });
  });

  it("重さの無い署名済みは normal として出し、束は順番どおりに並ぶ", async () => {
    const sup = await as("supervisor");
    const ids: string[] = [];
    for (const order of [2, 1]) {
      const id = await pendingCard({ bundle: { id: "B-test", order, total: 2, parent: "使う前の点検" } });
      expect((await send("POST", `${base}/${id}/status`, { to: "ok" })).status).toBe(200);
      expect((await send("POST", `${base}/${id}/sign`, { version: 1, mark: MARK }, sup)).status).toBe(200);
      ids.push(id);
    }
    const read = (await (await call("/api/t/practice/read/cards")).json()) as { cards: { id: string; weight: string; bundle: { order: number } | null }[] };
    const mine = read.cards.filter((c) => ids.includes(c.id));
    expect(mine.map((c) => c.bundle?.order)).toEqual([1, 2]);
    expect(mine.every((c) => c.weight === "normal")).toBe(true);
  });
});
