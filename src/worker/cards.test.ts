import type Anthropic from "@anthropic-ai/sdk";
import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { setClientFactory } from "./claude-client";
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
    // 確かめる AI の証拠が無いので OK にはならない（047 の関門。証拠があるときは下の 047 のテスト）
    expect((await move(c.id, "ok")).status).toBe(409);
    expect((await move(c.id, "signed")).status).toBe(403);
    expect((await move(c.id, "nope")).status).toBe(400);
  });

  it("直すと版が上がって下書きに戻る。署名済みも直せ、直すと署名が外れて前の版に回収の知らせが出る（11/5）", async () => {
    const c = await newCard();
    await move(c.id, "pending");
    const fixed = { ...sampleCard(), why: "感電して大けがをするから" };
    const r = (await (await call(`${base}/${c.id}`, json("PUT", { card: fixed, reason: "文を直す" }))).json()) as { status: string; version: number };
    expect(r).toMatchObject({ status: "draft", version: 2 });
    await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(c.id).run();
    const again = { ...fixed, why: "感電して大けがをするおそれがあるから" };
    const r2 = (await (await call(`${base}/${c.id}`, json("PUT", { card: again, reason: "理由の言い方を直す" }))).json()) as { status: string; version: number };
    expect(r2).toMatchObject({ status: "draft", version: 3 });
    const recall = await env.DB.prepare("SELECT version, reason FROM recall_notices WHERE card_id = ?").bind(c.id).first<{ version: number; reason: string }>();
    expect(recall).toMatchObject({ version: 2, reason: expect.stringContaining("直したため（版 2 → 3）") });
    const log = (await (await call(`/api/t/practice/audit/cards/${c.id}`)).json()) as { entries: { kind: string; payload: Record<string, unknown> }[] };
    expect(log.entries.filter((e) => e.kind === "status").at(-1)!.payload).toMatchObject({ version: 2, from: "signed", to: "draft" });
    await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(c.id).run();
    // 停止は監修者だけ（030b）
    const sup = await signRole("test-secret", "practice", { role: "supervisor", slot: 1 });
    expect((await call(`${base}/${c.id}/status`, { ...json("POST", { to: "stopped", reason: "テストで止める" }), headers: { "content-type": "application/json", "x-role": sup } })).status).toBe(200);
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

  it("署名済みと停止したカードにも送れる。送っただけでは状態は変わらない（11/5）", async () => {
    const c = await newCard();
    for (const st of ["signed", "stopped"]) {
      await env.DB.prepare("UPDATE cards SET status = ? WHERE id = ?").bind(st, c.id).run();
      expect((await fix(c.id, { frame: 0, box, text: "x" })).status).toBe(202);
      expect(((await (await call(`${base}/${c.id}`)).json()) as { status: string }).status).toBe(st);
    }
  });
});

describe("確かめる AI の正式版と確認待ちの関門（047）", () => {
  const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 100, output_tokens: 50 } }) as unknown as Anthropic.Message;
  beforeAll(() =>
    setClientFactory(() => ({
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
          sent.push(p);
          if (String(p.system).includes("新入社員です")) return reply({ frames: [{ frame: 1, saw: "盤に近づく人" }], meaning: "盤に道具を当てる", do: "当てる", dont: null, why_guess: null, confidence: 50 });
          return reply({ points: [{ id: "s1", credit: "full", frame: 2, reason: "2 コマ目で当てている" }, { id: "s2", credit: "none", frame: null, reason: "理由は描かれていない" }], dangerous: false, danger_reason: null, summary: "やることは伝わるが、理由は伝わらない" });
        },
      },
    })),
  );
  afterAll(() => setClientFactory(null));

  // PNG の印だけの小さなバイト列（読む側は偽物なので中身は見ない）
  const PNG = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0));
  const verify = (id: string, frames: unknown) => call(`${base}/${id}/verify`, json("POST", { frames }));

  it("証拠が無いうちは確認待ちで、OK を受け付けない", async () => {
    const c = await newCard();
    expect(((await (await call(`${base}/${c.id}`)).json()) as { verify: unknown }).verify).toBeNull();
    expect((await move(c.id, "pending")).status).toBe(200);
    const res = await move(c.id, "ok");
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/確認待ち/);
  });

  it("コマの PNG を順に送ると、絵だけを読ませて証拠を ③ に残し、OK できるようになる", async () => {
    const c = await newCard();
    await move(c.id, "pending");
    expect((await verify(c.id, [PNG, PNG])).status).toBe(400);
    expect((await verify(c.id, [PNG, PNG, btoa("not a png")])).status).toBe(400);
    expect((await verify(c.id, [PNG, PNG, "%%%"])).status).toBe(400);
    sent.length = 0;
    const res = await verify(c.id, [PNG, PNG, `data:image/png;base64,${PNG}`]);
    expect(res.status).toBe(200);
    const { evidence } = (await res.json()) as { evidence: { rate: number; band: string; cited: number[]; frames: number; reason: string } };
    expect(evidence).toMatchObject({ rate: 60, band: "yellow", cited: [2], frames: 3, reason: "やることは伝わるが、理由は伝わらない" });
    // 読む側には文を見せていない
    expect(JSON.stringify(sent[0])).not.toContain(sampleCard().rule);
    const log = (await (await call(`/api/t/practice/audit/cards/${c.id}`)).json()) as { entries: { kind: string; step: number; actor: string; payload: { version: number; png_sha256: string[] } }[] };
    const row = log.entries.find((e) => e.kind === "verify")!;
    expect(row).toMatchObject({ step: 3, actor: "verifier", payload: { version: 1 } });
    expect(row.payload.png_sha256).toHaveLength(3);
    expect(((await (await call(`${base}/${c.id}`)).json()) as { verify: { rate: number } }).verify.rate).toBe(60);
    expect((await move(c.id, "ok")).status).toBe(200);
  });

  it("中身を直して版が上がると、前の版の証拠では OK できない", async () => {
    const c = await newCard();
    await move(c.id, "pending");
    await verify(c.id, [PNG, PNG, PNG]);
    expect((await call(`${base}/${c.id}`, json("PUT", { card: { ...sampleCard(), why: "感電して大けがをするから" }, reason: "けがの重さを足す" }))).status).toBe(200);
    await move(c.id, "pending");
    expect((await move(c.id, "ok")).status).toBe(409);
  });

  it("証拠は画面やスクリプトから書き込めない（監査の記録は追記の口を持たない）", async () => {
    const c = await newCard();
    const res = await call("/api/t/practice/audit", json("POST", { card_id: c.id, kind: "verify", payload: { version: 1, evidence: {} } }));
    expect(res.status).toBe(405);
  });
});

describe("監修者に見てもらう組（11/6 作者）", () => {
  it("REVIEW_CARDS の順で、このテナントにあるカードの番号だけを一覧に添える。無ければ空", async () => {
    const a = await newCard();
    const b = await newCard();
    const e = env as unknown as { REVIEW_CARDS?: string };
    expect(((await (await call(base)).json()) as { review: string[] }).review).toEqual([]);
    e.REVIEW_CARDS = `${b.id}, no-such-card ${a.id}`;
    try {
      expect(((await (await call(base)).json()) as { review: string[] }).review).toEqual([b.id, a.id]);
    } finally {
      delete e.REVIEW_CARDS;
    }
  });
});
