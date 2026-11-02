import type Anthropic from "@anthropic-ai/sdk";
import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { routeOf, type CardBody } from "../shared/card";
import { POSES } from "../shared/picto/poses";
import { REDO_MAX } from "../shared/redo";
import { setClientFactory } from "./claude-client";

// その 1 枚だけ作り直す（044b）
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const base = "/api/t/practice/cards";
const post = (path: string, body: unknown) => call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;
const PANEL = { x: 0.66, y: 0.52, w: 0.18, h: 0.16 };
let calls = 0;

const bodyOf = async (id: string) => JSON.parse((await env.DB.prepare("SELECT body FROM cards WHERE id = ?").bind(id).first<{ body: string }>())!.body) as CardBody;
const keys = (b: CardBody) => (b.motion.kind === "keyframes" ? b.motion.json.keyframes : []);
async function ask(id: string, frame: number, box: typeof PANEL, text = "もっとはっきり") {
  const r = await post(`${base}/${id}/fix`, { frame, box, text });
  expect(r.status).toBe(202);
  return ((await r.json()) as { n: number }).n;
}

describe("その 1 枚だけ作り直す（044b）", () => {
  beforeAll(() =>
    setClientFactory(() => ({
      messages: {
        // 作り直し係は全部の部品を変えて返す（取り込むのは選んだ部品だけ、を確かめる）
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
          calls++;
          const key = JSON.parse(String(p.messages[0].content).split("\n")[1]);
          key.figures[0].angles = { ...POSES.hands };
          key.figures[0].x = 0.9;
          key.props[0].dx = 0.2;
          key.props[1].x = 0.7;
          key.props[1].size = 0.24;
          return reply(key);
        },
      },
    })),
  );
  afterAll(() => setClientFactory(null));

  it("枠に入った部品だけが変わって版が上がり、経路は保たれ、確かめ直すまで確認待ちに戻る", async () => {
    const { id } = (await (await post(base, { card: sampleCard() })).json()) as { id: string };
    const before = await bodyOf(id);
    const n = await ask(id, 0, PANEL);
    const res = await post(`${base}/${id}/redo`, { n });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { version: number; status: string; redo: { parts: string[]; count: number; left: number } };
    expect(out).toMatchObject({ version: 2, status: "draft", redo: { parts: ["p3"], count: 1, left: REDO_MAX - 1 } });
    expect(((await (await call(`${base}/${id}`)).json()) as { verify: unknown }).verify ?? null).toBeNull();
    const after = await bodyOf(id);
    // 1 コマ目の盤だけが変わり、人・検電器・ほかのコマは元のまま
    expect(keys(after)[0].props[1]).toMatchObject({ x: 0.7, size: 0.24 });
    expect(keys(after)[0].figures).toEqual(keys(before)[0].figures);
    expect(keys(after)[0].props[0]).toEqual(keys(before)[0].props[0]);
    for (const i of [1, 2, 3]) expect(keys(after)[i]).toEqual(keys(before)[i]);
    for (const p of before.parts) expect(routeOf(after, p.id)).toEqual(routeOf(before, p.id));
    const log = await env.DB.prepare("SELECT payload FROM audit_log WHERE card_id = ? AND kind = 'edit' ORDER BY n DESC LIMIT 1").bind(id).first<{ payload: string }>();
    expect(JSON.parse(log!.payload)).toMatchObject({ request: "redone", from_n: n, from_version: 1, to_version: 2, parts: ["p3"], count: 1 });
  });

  it("人を囲めば、その人の角度だけが変わる（位置は変えない）", async () => {
    const { id } = (await (await post(base, { card: sampleCard() })).json()) as { id: string };
    const before = await bodyOf(id);
    const n = await ask(id, 1, { x: 0.3, y: 0.1, w: 0.34, h: 0.8 });
    expect((await post(`${base}/${id}/redo`, { n })).status).toBe(200);
    const k = keys(await bodyOf(id))[2];
    expect(k.figures[0].angles).toEqual(POSES.hands);
    expect(k.figures[0].x).toBe(keys(before)[2].figures[0].x);
    expect(k.props[1]).toEqual(keys(before)[2].props[1]);
  });

  it("6 回目は断られる。古い版への依頼・枠に部品が無い依頼も断る（回数に数えない）", async () => {
    const { id } = (await (await post(base, { card: sampleCard() })).json()) as { id: string };
    const stale = await ask(id, 0, PANEL);
    const empty = await ask(id, 0, { x: 0.9, y: 0.02, w: 0.08, h: 0.08 });
    const before = calls;
    expect((await post(`${base}/${id}/redo`, { n: empty })).status).toBe(400);
    expect(calls).toBe(before);
    for (let i = 1; i <= REDO_MAX; i++) {
      const r = await post(`${base}/${id}/redo`, { n: await ask(id, 0, PANEL) });
      expect(r.status, `${i} 回目`).toBe(200);
    }
    expect((await post(`${base}/${id}/redo`, { n: stale })).status).toBe(409);
    const sixth = await post(`${base}/${id}/redo`, { n: await ask(id, 0, PANEL) });
    expect(sixth.status).toBe(429);
    expect(((await sixth.json()) as { error: string }).error).toMatch(/5 回まで/);
    expect(calls).toBe(before + REDO_MAX);
    expect((await post(`${base}/${id}/redo`, { n: 99999 })).status).toBe(400);
  });
});
