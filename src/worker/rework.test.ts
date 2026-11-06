import type Anthropic from "@anthropic-ai/sdk";
import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import type { CardBody } from "../shared/card";
import { POSES } from "../shared/picto/poses";
import { REWORK_MAX } from "../shared/rework";
import { setClientFactory } from "./claude-client";

// 言葉で直す口（POST /:id/rework・11/6）
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const base = "/api/t/practice/cards";
const post = (path: string, body: unknown) => call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;
const bodyOf = async (id: string) => JSON.parse((await env.DB.prepare("SELECT body FROM cards WHERE id = ?").bind(id).first<{ body: string }>())!.body) as CardBody;
const keys = (b: CardBody) => (b.motion.kind === "keyframes" ? b.motion.json.keyframes : []);
let calls = 0;
let broken = false;

describe("言葉で直す口", () => {
  beforeAll(() =>
    setClientFactory(() => ({
      messages: {
        // 作り直しの係: 今の絵を受け取り、全部のキーフレームの人を「手を出す」にして返す（1 コマだけのときは、そのコマだけを取り込むのを確かめる）
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
          calls++;
          const user = String(p.messages[0].content);
          const now = JSON.parse(user.slice(user.indexOf("{", user.indexOf("今の絵"))).split("\n\n直す範囲")[0]) as { motion: { keyframes: { figures: { angles: unknown }[]; mark: boolean }[] }; parts: unknown[] };
          for (const k of now.motion.keyframes) k.figures[0].angles = { ...POSES.hands };
          if (broken) for (const k of now.motion.keyframes) k.mark = false;
          return reply({ motion: now.motion, parts: now.parts, why: null });
        },
      },
    })),
  );
  afterAll(() => setClientFactory(null));

  const make = async () => ((await (await post(base, { card: sampleCard() })).json()) as { id: string }).id;

  it("カード全体を直すと版が上がり、④ に「言葉で直した」と頼みが残り、下書きに戻る", async () => {
    const id = await make();
    const res = await post(`${base}/${id}/rework`, { text: "人を全部、手を出す姿勢にして", frame: null, actor: "安全の監修者" });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { version: number; status: string; rework: { count: number; left: number } };
    expect(out).toMatchObject({ version: 2, status: "draft", rework: { count: 1, left: REWORK_MAX - 1 } });
    for (const k of keys(await bodyOf(id))) expect(k.figures[0].angles).toEqual(POSES.hands);
    const log = await env.DB.prepare("SELECT payload FROM audit_log WHERE card_id = ? AND kind = 'edit' ORDER BY n DESC LIMIT 1").bind(id).first<{ payload: string }>();
    expect(JSON.parse(log!.payload)).toMatchObject({ request: "rework", frame: null, text: "人を全部、手を出す姿勢にして", from_version: 1, to_version: 2, reason: "言葉で直した: 人を全部、手を出す姿勢にして", fields: ["motion"] });
    // 1 つ前の版に戻せる
    const undo = await post(`${base}/${id}/undo`, {});
    expect(undo.status).toBe(200);
    expect(keys(await bodyOf(id))).toEqual(keys(sampleCard()));
  });

  it("to: 1 で、何回直したあとでも最初の版の中身に戻せる（元の状態に戻す・11/6 作者）", async () => {
    const id = await make();
    expect((await post(`${base}/${id}/rework`, { text: "人を全部、手を出す姿勢にして", frame: null })).status).toBe(200);
    expect((await post(`${base}/${id}/rework`, { text: "1 コマ目は手を下ろして", frame: 0 })).status).toBe(200);
    const res = await post(`${base}/${id}/undo`, { to: 1 });
    expect(res.status).toBe(200);
    const v = ((await res.json()) as { version: number }).version;
    expect(v).toBeGreaterThanOrEqual(3);
    expect(keys(await bodyOf(id))).toEqual(keys(sampleCard()));
    expect((await post(`${base}/${id}/undo`, { to: v })).status).toBe(409);
    expect((await post(`${base}/${id}/undo`, { to: 0 })).status).toBe(400);
  });

  it("1 コマだけ直すと、そのコマだけが変わる", async () => {
    const id = await make();
    const before = await bodyOf(id);
    expect((await post(`${base}/${id}/rework`, { text: "2 コマ目は手を出して", frame: 1 })).status).toBe(200);
    const k = keys(await bodyOf(id));
    expect(k[2].figures[0].angles).toEqual(POSES.hands);
    for (const i of [0, 1, 3]) expect(k[i]).toEqual(keys(before)[i]);
  });

  it("頼みが空・コマの番号が外れは 400（呼ばない）、形が 2 回とも壊れたら 502（回数に数えない）、6 回目は 429", async () => {
    const id = await make();
    const start = calls;
    expect((await post(`${base}/${id}/rework`, { text: "  " })).status).toBe(400);
    expect((await post(`${base}/${id}/rework`, { text: "直して", frame: 9 })).status).toBe(400);
    expect((await post(`${base}/${id}/rework`, { text: "直して", frame: "1" })).status).toBe(400);
    expect(calls).toBe(start);
    broken = true;
    const bad = await post(`${base}/${id}/rework`, { text: "直して" });
    broken = false;
    expect(bad.status).toBe(502);
    expect(calls).toBe(start + 2);
    expect(((await (await call(`${base}/${id}`)).json()) as { version: number }).version).toBe(1);
    // 交互に姿勢が変わるよう、毎回ちがう版から直す（同じ答えは「変わらない直し」で数えない）
    for (let i = 1; i <= REWORK_MAX; i++) {
      if (i > 1) expect((await post(`${base}/${id}/undo`, {})).status).toBe(200);
      const r = await post(`${base}/${id}/rework`, { text: `${i} 回目の直し`, frame: null });
      expect(r.status, `${i} 回目`).toBe(200);
      expect(((await r.json()) as { rework: { count: number } }).rework.count).toBe(i);
    }
    const sixth = await post(`${base}/${id}/rework`, { text: "もう一度" });
    expect(sixth.status).toBe(429);
    expect(((await sixth.json()) as { error: string }).error).toMatch(/5 回まで/);
  });

  it("無いカードは 404", async () => {
    expect((await post(`${base}/nope/rework`, { text: "直して" })).status).toBe(404);
  });
});
