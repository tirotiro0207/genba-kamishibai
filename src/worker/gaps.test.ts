import type Anthropic from "@anthropic-ai/sdk";
import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { appendAudit } from "./audit";
import { setClientFactory } from "./claude-client";
import { contentHash } from "./sign";

// 決まりとコードの食い違いの穴ふさぎ（停止→下書き・回収の知らせの原子性・試しの答えの型・監査の「誰が」）
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown, headers: Record<string, string> = {}): RequestInit => ({ method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const roleHeader = async (role: string, slot = 1) => ({ "x-role": ((await (await call("/api/t/practice/login", json("POST", { role, slot }))).json()) as { token: string }).token });
const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;

async function newCard(rule: string) {
  return ((await (await call("/api/t/practice/cards", json("POST", { card: { ...sampleCard(), rule } }))).json()) as { id: string }).id;
}
async function signedCard(rule: string) {
  const id = await newCard(rule);
  await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(id).run();
  const r = (await env.DB.prepare("SELECT body, version FROM cards WHERE id = ?").bind(id).first<{ body: string; version: number }>())!;
  await appendAudit(env.DB, "practice", { card_id: id, kind: "sign", actor: "supervisor.1", payload: { version: r.version, signed_at: new Date().toISOString(), content_sha256: await contentHash(r.body) } });
  return id;
}

describe("止めたカードを下書きに戻すのは監修者だけ", () => {
  it("作者・教育担当は 403、監修者は通る", async () => {
    const id = await newCard("停止から下書き");
    for (const role of ["author", "trainer"]) {
      await env.DB.prepare("UPDATE cards SET status = 'stopped' WHERE id = ?").bind(id).run();
      expect((await call(`/api/t/practice/cards/${id}/status`, json("POST", { to: "draft" }, await roleHeader(role)))).status, role).toBe(403);
    }
    expect((await call(`/api/t/practice/cards/${id}/status`, json("POST", { to: "draft" }))).status, "役割なし").toBe(403);
    expect(((await env.DB.prepare("SELECT status FROM cards WHERE id = ?").bind(id).first()) as { status: string }).status).toBe("stopped");
    expect((await call(`/api/t/practice/cards/${id}/status`, json("POST", { to: "draft" }, await roleHeader("supervisor")))).status).toBe(200);
  });
});

describe("回収の知らせは状態の移りと同じ書き込み", () => {
  it("知らせが書けないとき、止める・直すも通らず、署名済みのまま残る", async () => {
    await env.DB.prepare("CREATE TRIGGER IF NOT EXISTS t_recall_fail BEFORE INSERT ON recall_notices WHEN new.reason LIKE '%落とす%' OR new.reason LIKE '%直したため%' BEGIN SELECT RAISE(ABORT, 'recall fail'); END").run();
    try {
      const sup = await roleHeader("supervisor");
      const id = await signedCard("原子性 停止");
      const stop = await call(`/api/t/practice/cards/${id}/status`, json("POST", { to: "stopped", reason: "落とす" }, sup));
      expect(stop.status).toBeGreaterThanOrEqual(500);
      expect(await env.DB.prepare("SELECT status FROM cards WHERE id = ?").bind(id).first()).toEqual({ status: "signed" });
      expect(((await env.DB.prepare("SELECT count(*) AS n FROM audit_log WHERE card_id = ? AND kind = 'status'").bind(id).first()) as { n: number }).n).toBe(0);

      const id2 = await signedCard("原子性 直し");
      const put = await call(`/api/t/practice/cards/${id2}`, json("PUT", { card: { ...sampleCard(), rule: "原子性 直し", why: "感電して大けがをするから" }, reason: "直す" }, sup));
      expect(put.status).toBeGreaterThanOrEqual(500);
      expect(await env.DB.prepare("SELECT status, version FROM cards WHERE id = ?").bind(id2).first()).toEqual({ status: "signed", version: 1 });
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS t_recall_fail").run();
    }
  });

  it("通るときは、止めても直しても知らせが 1 つ出る", async () => {
    const sup = await roleHeader("supervisor");
    const id = await signedCard("原子性 通る 停止");
    expect((await call(`/api/t/practice/cards/${id}/status`, json("POST", { to: "stopped", reason: "手順が違う" }, sup))).status).toBe(200);
    expect(((await env.DB.prepare("SELECT count(*) AS n FROM recall_notices WHERE card_id = ?").bind(id).first()) as { n: number }).n).toBe(1);
    const id2 = await signedCard("原子性 通る 直し");
    expect((await call(`/api/t/practice/cards/${id2}`, json("PUT", { card: { ...sampleCard(), rule: "原子性 通る 直し", why: "感電して大けがをするから" }, reason: "直す" }, sup))).status).toBe(200);
    expect(await env.DB.prepare("SELECT version, stopped_by FROM recall_notices WHERE card_id = ?").bind(id2).first()).toEqual({ version: 1, stopped_by: "supervisor.1" });
  });
});

describe("試しの答えは文字だけ", () => {
  it("文字でない答えは 400 で、枠は埋まらない", async () => {
    const t = (await (await call("/api/t/practice/trials", json("POST", { participants: ["p1", "p2"] }))).json()) as { id: string };
    for (const answer of [123, { a: 1 }, ["x"], true]) expect((await call(`/api/t/practice/trials/${t.id}/responses`, json("POST", { participant: "p1", item: "B", answer }))).status, JSON.stringify(answer)).toBe(400);
    expect(((await env.DB.prepare("SELECT count(*) AS n FROM responses WHERE trial_id = ?").bind(t.id).first()) as { n: number }).n).toBe(0);
    expect((await call(`/api/t/practice/trials/${t.id}/responses`, json("POST", { participant: "p1", item: "B", answer: "止めて知らせる" }))).status).toBe(201);
  });
});

describe("監査の「誰が」に役割が残る", () => {
  it("答えの消去は呼んだ役割。役割が無ければ system", async () => {
    const t = (await (await call("/api/t/practice/trials", json("POST", { participants: ["p1"] }))).json()) as { id: string };
    expect((await call(`/api/t/practice/trials/${t.id}/erase`, json("POST", { participant: "p1" }, await roleHeader("supervisor", 2)))).status).toBe(200);
    const row = await env.DB.prepare("SELECT actor FROM audit_log WHERE kind = 'erase' AND json_extract(payload, '$.trial') = ?").bind(t.id).first<{ actor: string }>();
    expect(row!.actor).toBe("supervisor.2");
    const t2 = (await (await call("/api/t/practice/trials", json("POST", { participants: ["p1"] }))).json()) as { id: string };
    await call(`/api/t/practice/trials/${t2.id}/erase`, json("POST", { participant: "p1" }));
    expect((await env.DB.prepare("SELECT actor FROM audit_log WHERE kind = 'erase' AND json_extract(payload, '$.trial') = ?").bind(t2.id).first<{ actor: string }>())!.actor).toBe("system");
  });

  describe("1 枚の作り直し", () => {
    beforeAll(() =>
      setClientFactory(() => ({
        messages: {
          create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
            const key = JSON.parse(String(p.messages[0].content).split("\n")[1]);
            key.props[1].x = 0.7;
            return reply(key);
          },
        },
      })),
    );
    afterAll(() => setClientFactory(null));

    it("作り直しの記録の actor は呼んだ役割", async () => {
      const id = await newCard("誰が 作り直し");
      const hdr = await roleHeader("trainer");
      const ask = await call(`/api/t/practice/cards/${id}/fix`, json("POST", { frame: 0, box: { x: 0.66, y: 0.52, w: 0.18, h: 0.16 }, text: "はっきり" }, hdr));
      expect(ask.status).toBe(202);
      const { n } = (await ask.json()) as { n: number };
      expect((await call(`/api/t/practice/cards/${id}/redo`, json("POST", { n }, hdr))).status).toBe(200);
      const row = await env.DB.prepare("SELECT actor FROM audit_log WHERE card_id = ? AND kind = 'edit' AND json_extract(payload, '$.request') = 'redone'").bind(id).first<{ actor: string }>();
      expect(row!.actor).toBe("trainer.1");
    });
  });
});
