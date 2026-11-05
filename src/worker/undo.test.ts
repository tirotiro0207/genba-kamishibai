import type Anthropic from "@anthropic-ai/sdk";
import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import type { CardBody } from "../shared/card";
import { setClientFactory } from "./claude-client";

// 元に戻す（11/6）
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const base = "/api/t/practice/cards";
const send = (method: string, path: string, body: unknown) => call(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;
const bodyOf = async (id: string) => JSON.parse((await env.DB.prepare("SELECT body FROM cards WHERE id = ?").bind(id).first<{ body: string }>())!.body) as CardBody;
const undo = (id: string, reason?: string) => send("POST", `${base}/${id}/undo`, reason ? { reason } : {});
const edits = async (id: string) =>
  (await env.DB.prepare("SELECT actor, payload FROM audit_log WHERE card_id = ? AND kind = 'edit' ORDER BY n").bind(id).all<{ actor: string; payload: string }>()).results.map((r) => ({ actor: r.actor, ...JSON.parse(r.payload) }));

describe("元に戻す（11/6）", () => {
  beforeAll(() =>
    setClientFactory(() => ({
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
          const key = JSON.parse(String(p.messages[0].content).split("\n")[1]);
          key.props[1].x = 0.7;
          key.props[1].size = 0.24;
          return reply(key);
        },
      },
    })),
  );
  afterAll(() => setClientFactory(null));

  it("1 つ前の版の中身に戻し、版を上げて ④ に戻した理由と人と日時を残す。続けて押すとさらに前へ。最初の版より前は断る", async () => {
    const { id } = (await (await send("POST", base, { card: sampleCard() })).json()) as { id: string };
    const v1 = await bodyOf(id);
    const v2 = { ...v1, rule: "盤に触る前に必ず検電する" };
    expect((await send("PUT", `${base}/${id}`, { card: v2, reason: "言い方" })).status).toBe(200);
    const v3 = { ...v2, words: { ja: "たしかめる", vi: "kiểm tra" } };
    expect((await send("PUT", `${base}/${id}`, { card: v3, reason: "言葉の欄" })).status).toBe(200);

    const r1 = await undo(id, "言葉はまだ要らない");
    expect(r1.status).toBe(200);
    expect(((await r1.json()) as { version: number }).version).toBe(4);
    expect(await bodyOf(id)).toEqual(v2);
    const r2 = await undo(id);
    expect(((await r2.json()) as { version: number }).version).toBe(5);
    expect(await bodyOf(id)).toEqual(v1);
    const r3 = await undo(id);
    expect(r3.status).toBe(409);
    expect(((await r3.json()) as { error: string }).error).toMatch(/これより前の版は無い/);

    const log = await edits(id);
    // 記録は消さず、戻した 2 行が足されている
    expect(log.map((x) => x.to_version)).toEqual([2, 3, 4, 5]);
    expect(log[2]).toMatchObject({ request: "undo", restored: 2, from_version: 3, to_version: 4, fields: ["words"] });
    expect(log[2].reason).toBe("元に戻す（版 3 → 版 2 の中身）: 言葉はまだ要らない");
    expect(log[2].edited_at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(log[2].by).toBeTruthy();
    expect(log[3]).toMatchObject({ request: "undo", restored: 1, to_version: 5, fields: ["rule"] });
  });

  it("枠からの作り直しも戻せる（そのコマの絵だけが前に戻る）", async () => {
    const { id } = (await (await send("POST", base, { card: sampleCard() })).json()) as { id: string };
    const v1 = await bodyOf(id);
    const fix = await send("POST", `${base}/${id}/fix`, { frame: 0, box: { x: 0.66, y: 0.52, w: 0.18, h: 0.16 }, text: "盤を大きく" });
    const { n } = (await fix.json()) as { n: number };
    expect((await send("POST", `${base}/${id}/redo`, { n })).status).toBe(200);
    expect(await bodyOf(id)).not.toEqual(v1);
    const r = await undo(id);
    expect(r.status).toBe(200);
    expect(await bodyOf(id)).toEqual(v1);
    expect(((await r.json()) as { version: number; status: string }).version).toBe(3);
  });
});
