import type Anthropic from "@anthropic-ai/sdk";
import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canonical, sha256Hex } from "../shared/audit";
import { sampleCard } from "../../tests/fixtures/card";
import { setClientFactory } from "./claude-client";
import { signRole } from "./people";

// 署名の記録（051a）
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const base = "/api/t/practice/cards";
const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;
const PNG = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0));

async function as(role: "supervisor" | "author" | "trainer", slot: 1 | 2 = 1) {
  return { "content-type": "application/json", "x-role": await signRole("test-secret", "practice", { role, slot }) };
}
const post = async (path: string, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) => call(path, { method: "POST", headers, body: JSON.stringify(body) });

/** 作る → 確認に回す → 確かめる AI の証拠 → OK */
async function okCard() {
  const { id } = (await (await post(base, { card: sampleCard() })).json()) as { id: string };
  expect((await post(`${base}/${id}/status`, { to: "pending" })).status).toBe(200);
  expect((await post(`${base}/${id}/verify`, { frames: [PNG, PNG, PNG] })).status).toBe(200);
  expect((await post(`${base}/${id}/status`, { to: "ok" })).status).toBe(200);
  return id;
}

describe("署名の記録（051a）", () => {
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

  it("版・日付・中身のハッシュと、開いてから署名までの分数が ⑤ に残り、署名済みになる", async () => {
    const id = await okCard();
    const sup = await as("supervisor", 2);
    const opened = (await (await post(`${base}/${id}/open`, {}, sup)).json()) as { version: number; opened_at: string };
    expect(opened.version).toBe(1);
    // 2 回目に開いても、最初の時刻のまま
    expect(((await (await post(`${base}/${id}/open`, {}, sup)).json()) as { opened_at: string }).opened_at).toBe(opened.opened_at);
    // 開いたのを 7 分半前にずらす
    const before = new Date(Date.now() - 7.5 * 60000).toISOString();
    await env.DB.prepare("UPDATE card_opens SET opened_at = ? WHERE card_id = ?").bind(before, id).run();

    const res = await post(`${base}/${id}/sign`, { version: 1 }, sup);
    expect(res.status).toBe(200);
    const s = (await res.json()) as { version: number; signed_at: string; content_sha256: string; minutes: number; opened_at: string };
    expect(s).toMatchObject({ version: 1, minutes: 8, opened_at: before });
    expect(Date.now() - Date.parse(s.signed_at)).toBeLessThan(60000);
    const row = await env.DB.prepare("SELECT body, status FROM cards WHERE id = ?").bind(id).first<{ body: string; status: string }>();
    expect(row!.status).toBe("signed");
    expect(s.content_sha256).toBe(await sha256Hex(canonical(JSON.parse(row!.body))));

    const log = (await (await call(`/api/t/practice/audit/cards/${id}`)).json()) as { entries: { kind: string; step: number; actor: string; payload: { content_sha256: string } }[]; chain_ok: boolean };
    const sign = log.entries.filter((e) => e.kind === "sign");
    expect(sign).toHaveLength(1);
    expect(sign[0]).toMatchObject({ step: 5, actor: "supervisor.2", payload: { content_sha256: s.content_sha256 } });
    expect(log.chain_ok).toBe(true);

    // 署名済みはもう一度は署名できない
    expect((await post(`${base}/${id}/sign`, { version: 1 }, sup)).status).toBe(409);
  });

  it("監修者のほかは署名できない", async () => {
    const id = await okCard();
    for (const r of ["author", "trainer"] as const) expect((await post(`${base}/${id}/sign`, { version: 1 }, await as(r))).status, r).toBe(403);
    expect((await post(`${base}/${id}/sign`, { version: 1 })).status).toBe(403);
  });

  it("OK でないカード・版の違う署名・証拠の無い版は断る", async () => {
    const sup = await as("supervisor");
    const { id } = (await (await post(base, { card: sampleCard() })).json()) as { id: string };
    expect((await post(`${base}/${id}/sign`, { version: 1 }, sup)).status).toBe(409);
    const ok = await okCard();
    expect((await post(`${base}/${ok}/sign`, { version: 2 }, sup)).status).toBe(409);
    expect((await post(`${base}/${ok}/sign`, {}, sup)).status).toBe(409);
    expect((await post(`${base}/missing/sign`, { version: 1 }, sup)).status).toBe(404);
  });

  it("開いた記録が無ければ分数は空。署名のあとに中身を書き換えると、ハッシュが合わないと分かる", async () => {
    const id = await okCard();
    const s = (await (await post(`${base}/${id}/sign`, { version: 1 }, await as("supervisor"))).json()) as { minutes: number | null };
    expect(s.minutes).toBeNull();
    const sig = async () => (await (await call(`${base}/${id}/signature`)).json()) as { signed: boolean; matches: boolean };
    expect(await sig()).toMatchObject({ signed: true, matches: true });
    // 裏で中身を書き換える
    await env.DB.prepare("UPDATE cards SET body = json_set(body, '$.why', '書き換えた') WHERE id = ?").bind(id).run();
    expect(await sig()).toMatchObject({ signed: true, matches: false });
  });
});
