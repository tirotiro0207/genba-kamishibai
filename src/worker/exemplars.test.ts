import type Anthropic from "@anthropic-ai/sdk";
import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isScriptCall, MOTION, sampleCard, SCRIPT } from "../../tests/fixtures/card";
import { categoryOf, exemplarText, usedLine, whoLabel } from "../shared/exemplars";
import { setClientFactory } from "./claude-client";
import { addCardSession, cleanupCardSessions, gatherExemplars, setSessionDeleter } from "./exemplars";
import { signRole } from "./people";

// 手本の渡し方（086・§5 L3・L6）と、Managed Agents のセッションの後片付け（§5 L4）。AI は差し替えで、本物は呼ばない
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown, headers: Record<string, string> = {}): RequestInit => ({ method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;
const PNG = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0));
const MARK = { kind: "finger", png: "data:image/png;base64," + btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3)) };

let n = 0;
async function tenant(prefix: string) {
  const id = `${prefix}-${Date.now()}-${n++}`;
  await env.DB.prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'demo', ?)").bind(id, id).run();
  return id;
}
const role = async (t: string, r: "supervisor" | "author", slot: 1 | 2 = 1) => ({ "x-role": await signRole("test-secret", t, { role: r, slot }) });

async function newCard(t: string, rule: string) {
  return ((await (await call(`/api/t/${t}/cards`, json("POST", { card: { ...sampleCard(), rule } }))).json()) as { id: string }).id;
}
/** 監修者が決まりの文を直す（② 人の直しが 1 件残る） */
async function edit(t: string, id: string, rule: string, reason: string) {
  const res = await call(`/api/t/${t}/cards/${id}`, json("PUT", { card: { ...sampleCard(), rule }, reason }, await role(t, "supervisor")));
  expect(res.status).toBe(200);
}
/** 確認に回す → 確かめる AI の証拠 → OK → 署名 */
async function sign(t: string, id: string, version = 1) {
  expect((await call(`/api/t/${t}/cards/${id}/status`, json("POST", { to: "pending" }))).status).toBe(200);
  expect((await call(`/api/t/${t}/cards/${id}/verify`, json("POST", { frames: [PNG, PNG, PNG] }))).status).toBe(200);
  expect((await call(`/api/t/${t}/cards/${id}/status`, json("POST", { to: "ok" }))).status).toBe(200);
  const res = await call(`/api/t/${t}/cards/${id}/sign`, json("POST", { version, mark: MARK }, await role(t, "supervisor", 2)));
  expect(res.status).toBe(200);
  return (await res.json()) as { sessions: { deleted: number; failed: number; left: number } };
}

/** 作成の指示（ユーザーの文）を拾う */
const made: string[] = [];

describe("カテゴリと手本の文（086）", () => {
  it("決まりの文の言葉からカテゴリを決める", () => {
    expect(categoryOf("盤に触る前に検電する")).toBe("electric");
    expect(categoryOf("床の無い高い所では安全帯を使う")).toBe("height");
    expect(categoryOf("体の具合が悪い人は作業しない")).toBe("health");
    expect(categoryOf("朝は早めに来る")).toBe("general");
  });

  it("手本が何も無ければ空。あれば直し・署名済みのカード・会社の言葉が入り、キーフレームの数字は入らない", () => {
    expect(exemplarText({ category: "electric", edits: [], cards: [], words: [] })).toBe("");
    const t = exemplarText({
      category: "electric",
      edits: [{ card_id: "c1", fields: ["rule", "motion"], before: { rule: "ブレーカーを切る", motion: { x: 1 } }, after: { rule: "主幹を切る", motion: { x: 2 } }, reason: "会社の呼び方", by: "supervisor.1", at: "2026-11-03T00:00:00Z" }],
      cards: [{ card_id: "c2", rule: "盤に触る前に検電する", why: "感電を防ぐ", by: "supervisor.2", at: "2026-11-03T00:00:00Z" }],
      words: [{ kind: "rephrase", phrase: "ブレーカー", prefer: "主幹" }],
    });
    expect(t).toContain("電気のカテゴリ");
    expect(t).toContain("「ブレーカーを切る」→「主幹を切る」");
    expect(t).toContain("守ること: 盤に触る前に検電する");
    expect(t).toContain("「ブレーカー」ではなく「主幹」");
    expect(t).not.toContain("motion");
  });
});

describe("手本の渡し方（086・§5 L3・L6）", () => {
  beforeAll(() =>
    setClientFactory(() => ({
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
          if (isScriptCall(p.system)) return reply(SCRIPT);
          const sys = String(p.system);
          if (sys.includes("言葉」の欄")) return reply({ ja: "けんでん", vi: "kiểm tra điện", terms: [] });
          if (sys.includes("カードの下ごしらえ"))
            return reply({ rules: [{ kind: "do", text: "分電盤を開ける前に検電する", from: { quote: "分電盤を開ける前に検電する", lines: [1] }, reasons: [{ text: "感電を防ぐ", from: { quote: "感電", lines: [1] }, stated: true }], checklist: false, reworded: false }] });
          if (sys.includes("新入社員です")) return reply({ frames: [], meaning: "当てる", do: "当てる", dont: null, why_guess: null, confidence: 50 });
          if (!sys.includes("部品ごとの経路")) return reply({ points: [{ id: "s1", credit: "full", frame: 1, reason: "r" }, { id: "s2", credit: "full", frame: 2, reason: "r" }], dangerous: false, danger_reason: null, summary: "伝わる" });
          made.push(JSON.stringify(p.messages));
          return reply({ motion: MOTION, parts: [{ type: "figure", index: 0, statement: "s1", reason: "人" }, { type: "prop", index: 0, statement: "s1", reason: "検電器" }, { type: "prop", index: 1, statement: "s2", reason: "盤" }], why: null });
        },
      },
    })),
  );
  afterAll(() => setClientFactory(null));

  it("同じ会社・同じカテゴリの直近の直しと署名済みのカードだけを集め、件数の上限を守る", async () => {
    const a = await tenant("exa");
    const b = await tenant("exb");
    // 会社 A: 電気の直しが 2 件、高い所の直しが 1 件、電気の署名済みが 1 枚
    const e1 = await newCard(a, "ブレーカーを切ってから盤に触る");
    await edit(a, e1, "主幹を切ってから盤に触る", "会社の呼び方");
    const e2 = await newCard(a, "検電器で確かめる");
    await edit(a, e2, "検電ドライバーで確かめる", "会社の道具の名前");
    const h = await newCard(a, "脚立の天板に乗らない");
    await edit(a, h, "可搬式作業台の天板に乗らない", "高い所は作業台");
    const s = await newCard(a, "盤に触る前に検電する");
    await sign(a, s);
    // 会社 B: 電気の直し（A に渡ってはいけない）
    const x = await newCard(b, "漏電遮断器を確かめる");
    await edit(b, x, "Bの社内の呼び名で盤を確かめる", "B の呼び方");

    const ex = await gatherExemplars(env.DB, a, "分電盤を開ける前に検電する");
    expect(ex.category).toBe("electric");
    expect(ex.edits.map((e) => e.card_id).sort()).toEqual([e1, e2].sort());
    expect(ex.edits[0].card_id).toBe(e2); // 新しい順
    expect(ex.cards.map((c) => c.card_id)).toEqual([s]);
    expect(ex.edits.every((e) => e.by === "supervisor.1")).toBe(true);
    expect(JSON.stringify(ex)).not.toContain("Bの社内の呼び名");
    // 件数の上限
    const one = await gatherExemplars(env.DB, a, "分電盤を開ける前に検電する", { edits: 1, cards: 0, words: 2 });
    expect([one.edits.length, one.cards.length, one.words.length <= 2]).toEqual([1, 0, true]);
    // 高い所のカテゴリでは、電気の直しは渡さない
    const ht = await gatherExemplars(env.DB, a, "はしごを使う");
    expect(ht.edits.map((e) => e.card_id)).toEqual([h]);
    // 会社 B からは、A のものは何も見えない
    const fromB = await gatherExemplars(env.DB, b, "分電盤を開ける前に検電する");
    expect(fromB.edits.map((e) => e.card_id)).toEqual([x]);
    expect(fromB.cards).toEqual([]);
    expect(JSON.stringify(fromB)).not.toMatch(/主幹|検電ドライバー/);
  });

  it("作成の指示に同じ会社の手本が入り、ほかの会社の差分は入らない。手本にしたものはカードに残る（087 の元）", async () => {
    const a = await tenant("exa");
    const b = await tenant("exb");
    const e1 = await newCard(a, "ブレーカーを切ってから盤に触る");
    await edit(a, e1, "主幹を切ってから盤に触る", "会社の呼び方");
    const x = await newCard(b, "盤を開ける");
    await edit(b, x, "Bの社内の呼び名の盤を開ける", "B の呼び方");

    const make = async (t: string) => {
      const ext = (await (await call(`/api/t/${t}/extract`, json("POST", { text: "分電盤を開ける前に検電する" }))).json()) as { id: string };
      await call(`/api/t/${t}/extract/${ext.id}/ok`, json("POST", { items: [0] }));
      made.length = 0;
      const res = await call(`/api/t/${t}/extract/${ext.id}/make`, json("POST", { item: 0 }));
      expect(res.status).toBe(201);
      return { id: ((await res.json()) as { id: string }).id, prompt: made.join("\n") };
    };
    const ma = await make(a);
    expect(ma.prompt).toContain("主幹を切ってから盤に触る");
    expect(ma.prompt).not.toContain("Bの社内の呼び名");
    const used = (await (await call(`/api/t/${a}/cards/${ma.id}/exemplars`)).json()) as { used: { kind: string; src_card_id: string; by: string; at: string }[] };
    expect(used.used).toEqual([expect.objectContaining({ kind: "edit", src_card_id: e1, by: "supervisor.1" })]);
    // 別の会社のテナントからは、そのカードの手本の記録は見えない
    expect((await call(`/api/t/${b}/cards/${ma.id}/exemplars`)).status).toBe(404);
    // 会社 B の作成には B の直しだけが入る
    const mb = await make(b);
    expect(mb.prompt).toContain("Bの社内の呼び名の盤を開ける");
    expect(mb.prompt).not.toContain("主幹");
  });

  it("手本が無い会社では、指示に手本の段が付かない", async () => {
    const c = await tenant("exc");
    const ext = (await (await call(`/api/t/${c}/extract`, json("POST", { text: "分電盤を開ける前に検電する" }))).json()) as { id: string };
    await call(`/api/t/${c}/extract/${ext.id}/ok`, json("POST", { items: [0] }));
    made.length = 0;
    expect((await call(`/api/t/${c}/extract/${ext.id}/make`, json("POST", { item: 0 }))).status).toBe(201);
    expect(made.join("\n")).not.toContain("手本（");
  });

  it("署名済みになったら、そのカードのセッションを消して時刻を残す。鍵が無ければ残し、失敗は理由を残す（§5 L4）", async () => {
    const a = await tenant("exs");
    const id = await newCard(a, "盤に触る前に検電する");
    const other = await newCard(a, "盤に触る前に検電する（別）");
    await addCardSession(env.DB, a, id, "sesn_a1");
    await addCardSession(env.DB, a, id, "sesn_a2");
    await addCardSession(env.DB, a, other, "sesn_o1");
    const gone: string[] = [];
    setSessionDeleter(() => async (sid) => {
      if (sid === "sesn_a2") throw new Error("見つからない");
      gone.push(sid);
    });
    try {
      const r = await sign(a, id);
      expect(r.sessions).toEqual({ deleted: 1, failed: 1, left: 0 });
    } finally {
      setSessionDeleter(null);
    }
    expect(gone).toEqual(["sesn_a1"]);
    const rows = (await env.DB.prepare("SELECT session_id, deleted_at, error FROM card_sessions WHERE tenant_id = ? ORDER BY session_id").bind(a).all<{ session_id: string; deleted_at: string | null; error: string | null }>()).results;
    expect(rows.map((r) => [r.session_id, !!r.deleted_at, r.error])).toEqual([
      ["sesn_a1", true, null],
      ["sesn_a2", false, "見つからない"],
      // ほかのカードのセッションは消さない
      ["sesn_o1", false, null],
    ]);
    // 消す鍵が無いときは、消さずに残す
    expect(await cleanupCardSessions(env.DB, a, id, null)).toEqual({ deleted: 0, failed: 0, left: 1 });
  });
});

describe("手本にしたものの 1 行（087）", () => {
  it("直しを先に、日本時間の日付と役割で出す。名前は出さない", () => {
    const at = "2026-11-02T16:30:00.000Z"; // 日本時間 11 月 3 日 1 時半
    expect(usedLine([{ kind: "card", src_card_id: "c", by: "supervisor.2", at }, { kind: "edit", src_card_id: "e", by: "supervisor.1", at }])).toBe("前回の修正（11月3日・監修者 1）を手本にしました");
    expect(usedLine([{ kind: "card", src_card_id: "c", by: "trainer.1", at: "2026-11-03 02:00:00" }])).toBe("署名済みのカード（11月3日・教育担当）を手本にしました");
    expect(usedLine([])).toBeNull();
    expect(whoLabel("author.1")).toBe("作者");
  });
});
