import type Anthropic from "@anthropic-ai/sdk";
import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { POSES } from "../shared/picto/poses";
import { appendAudit } from "./audit";
import { setClientFactory } from "./claude-client";
import { app } from "./index";
import { hashKey } from "./mcp";
import { signRole } from "./people";
import { PIN_RATE_LIMIT } from "./rate-limit";
import { SIGN_DAILY_MAX } from "./sign";
import { hashPin } from "./tenant";

// サーバーの守りと監査の記録の直し（点検の束 B）。関所・回数の制限・監査の「誰が」・同時の書き込み・テナントの境目
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const base = "/api/t/practice/cards";
const H = (extra: Record<string, string> = {}) => ({ "content-type": "application/json", ...extra });
const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = H()) => call(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;
const PNG = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0));
const MARK = { kind: "finger", png: "data:image/png;base64," + btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3)) };
const role = async (r: "supervisor" | "author" | "trainer" | "newhire", tenant = "practice", slot: 1 | 2 = 1) => signRole("test-secret", tenant, { role: r, slot });
let dangerous = false;

beforeAll(() =>
  setClientFactory(() => ({
    messages: {
      create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
        const content = p.messages[0].content;
        // 確かめる AI（047）: 新入社員の読みと、点の付け方
        if (String(p.system).includes("新入社員です")) return reply({ frames: [], meaning: "当てる", do: "当てる", dont: null, why_guess: null, confidence: 50 });
        if (Array.isArray(content))
          return reply({ points: [{ id: "s1", credit: "full", frame: 1, reason: "r" }, { id: "s2", credit: "full", frame: 2, reason: "r" }], dangerous, danger_reason: dangerous ? "触ってよいと読める" : null, summary: "s" });
        const user = String(content);
        // 言葉で直す（rework）: 今の絵の人を「手を出す」にして返す
        if (user.includes("今の絵") && user.includes("直す範囲")) {
          const now = JSON.parse(user.slice(user.indexOf("{", user.indexOf("今の絵"))).split("\n\n直す範囲")[0]) as { motion: { keyframes: { figures: { angles: unknown }[] }[] }; parts: unknown[] };
          for (const k of now.motion.keyframes) k.figures[0].angles = { ...POSES.hands };
          return reply({ motion: now.motion, parts: now.parts, why: null });
        }
        // その 1 枚の作り直し（redo）: 2 行目のキーフレームの道具を動かして返す
        const key = JSON.parse(user.split("\n")[1]);
        key.props[1].x = 0.7;
        key.props[1].size = 0.24;
        return reply(key);
      },
    },
  })),
);
afterAll(() => setClientFactory(null));

async function newCard(tenant = "practice", headers: Record<string, string> = H()) {
  const r = await send("POST", `/api/t/${tenant}/cards`, { card: sampleCard() }, headers);
  expect(r.status).toBe(201);
  return ((await r.json()) as { id: string }).id;
}
/** 作る → 確認に回す → 確かめる AI の証拠 → OK */
async function okCard() {
  const id = await newCard();
  expect((await send("POST", `${base}/${id}/status`, { to: "pending" })).status).toBe(200);
  expect((await send("POST", `${base}/${id}/verify`, { frames: [PNG, PNG, PNG] })).status).toBe(200);
  expect((await send("POST", `${base}/${id}/status`, { to: "ok" })).status).toBe(200);
  return id;
}
/** 読む文（既定はカードを 1 枚読む getCard）の 1 回目のあとで、race を走らせる DB（重なった書き込みを決まった順で起こす） */
function readThenRace(db: D1Database, race: () => Promise<void>, at = /^SELECT id, tenant_id, body, status, version/): D1Database {
  let fired = false;
  return new Proxy(db, {
    get(target, k) {
      if (k !== "prepare") {
        const v = Reflect.get(target, k, target);
        return typeof v === "function" ? v.bind(target) : v;
      }
      return (sql: string) => {
        const st = target.prepare(sql);
        if (fired || !at.test(sql)) return st;
        return {
          bind: (...args: unknown[]) => {
            const b = st.bind(...args);
            return {
              first: async () => {
                const row = await b.first();
                if (!fired) {
                  fired = true;
                  await race();
                }
                return row;
              },
            };
          },
        };
      };
    },
  });
}
const recalls = async (id: string) => (await env.DB.prepare("SELECT count(*) AS n FROM recall_notices WHERE card_id = ?").bind(id).first<{ n: number }>())!.n;
const statusOf = async (id: string) => (await env.DB.prepare("SELECT status, version FROM cards WHERE id = ?").bind(id).first<{ status: string; version: number }>())!;

describe("PIN の総当たりの歯止め", () => {
  beforeAll(async () => {
    await env.DB.prepare("INSERT INTO tenants (id, kind, name, pin_hash) VALUES ('co-guard', 'company', '会社 G', ?)").bind(await hashPin("1234")).run();
    await env.DB.prepare("INSERT INTO people (tenant_id, role, slot, pin_hash) VALUES ('co-guard', 'supervisor', 1, ?)").bind(await hashPin("2468")).run();
  });
  const session = (pin: string, ip: string) => send("POST", "/api/t/co-guard/session", { pin }, H({ "cf-connecting-ip": ip }));

  it("会社の PIN の打ち間違いが続くと、正しい PIN でもしばらく 429。別の所からは入れる", async () => {
    for (let i = 0; i < PIN_RATE_LIMIT.limit; i++) expect((await session("0000", "198.51.100.1")).status).toBe(401);
    expect((await session("1234", "198.51.100.1")).status).toBe(429);
    expect((await session("1234", "198.51.100.2")).status).toBe(200);
  });

  it("役割の PIN（/login）も同じに数える", async () => {
    const ip = "198.51.100.3";
    const tok = ((await (await session("1234", ip)).json()) as { token: string }).token;
    const login = (pin: string) => send("POST", "/api/t/co-guard/login", { role: "supervisor", slot: 1, pin }, H({ authorization: `Bearer ${tok}`, "cf-connecting-ip": ip }));
    for (let i = 0; i < PIN_RATE_LIMIT.limit; i++) expect((await login("0000")).status).toBe(401);
    expect((await login("2468")).status).toBe(429);
  });

  it("役割のしるしの要らない口は、テナントの直下の login・me・people だけ（/files/people などは素通りさせない）", async () => {
    const tok = ((await (await session("1234", "198.51.100.4")).json()) as { token: string }).token;
    const auth = H({ authorization: `Bearer ${tok}` });
    expect((await send("GET", "/api/t/co-guard/me", undefined, auth)).status).toBe(200);
    expect((await send("GET", "/api/t/co-guard/people", undefined, auth)).status).toBe(200);
    for (const p of ["/files/people", "/files/me", "/files/login"]) expect((await send("GET", `/api/t/co-guard${p}`, undefined, auth)).status, p).toBe(403);
  });
});

describe("置き場の資料の返し方", () => {
  it("HTML などは octet-stream のダウンロードで返し、nosniff を付ける。許した形はそのまま", async () => {
    await call("/api/t/practice/files/docs/a.html", { method: "PUT", headers: { "content-type": "text/html" }, body: "<script>alert(1)</script>" });
    const html = await call("/api/t/practice/files/docs/a.html");
    expect(html.headers.get("content-type")).toBe("application/octet-stream");
    expect(html.headers.get("content-disposition")).toBe("attachment");
    expect(html.headers.get("x-content-type-options")).toBe("nosniff");
    await call("/api/t/practice/files/docs/a.png", { method: "PUT", headers: { "content-type": "image/png" }, body: "x" });
    const png = await call("/api/t/practice/files/docs/a.png");
    expect(png.headers.get("content-type")).toBe("image/png");
    expect(png.headers.get("content-disposition")).toBeNull();
    expect(png.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("?prefix は区切りまでの名前として読む（pdf に pdfabc/ を混ぜない）", async () => {
    await call("/api/t/practice/files/pdf/d/p001.json", { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" });
    await call("/api/t/practice/files/pdfabc/x.json", { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" });
    const { files } = (await (await call("/api/t/practice/files?prefix=pdf")).json()) as { files: { path: string }[] };
    expect(files.map((f) => f.path)).toEqual(["pdf/d/p001.json"]);
  });
});

describe("本番の公開の置き場の関所", () => {
  const pub = (path: string, init?: RequestInit) => app.request(path, init, { ...env, PUBLIC_DEMO: "1" });
  it("役割で入る口と、新入社員が見た印は通す。試しの回の書き込みは断る", async () => {
    expect((await pub("/api/t/practice/login", { method: "POST", headers: H(), body: JSON.stringify({ role: "supervisor", slot: 1 }) })).status).toBe(200);
    // 見た印は関所を通る（カードが無いので 404）
    expect((await pub("/api/t/demo/read/cards/none/seen", { method: "POST", headers: H(), body: "{}" })).status).toBe(404);
    expect((await pub("/api/t/demo/trials", { method: "POST", headers: H(), body: "{}" })).status).toBe(403);
    expect((await pub("/api/t/demo/files/x/login", { method: "PUT", headers: H(), body: "{}" })).status).toBe(403);
  });
});

describe("監査の記録の「誰が」", () => {
  it("送った名前（actor）は使わず、役割のしるしから取る。しるしが無ければ anon", async () => {
    const sup = await role("supervisor");
    const id = await newCard();
    await send("POST", `${base}/${id}/status`, { to: "pending", actor: "なりすまし" });
    await send("POST", `${base}/${id}/fix`, { frame: 0, box: { x: 0.5, y: 0.3, w: 0.3, h: 0.4 }, text: "x", actor: "なりすまし" }, H({ "x-role": sup }));
    await send("POST", `${base}/${id}/status`, { to: "draft", actor: "なりすまし" }, H({ "x-role": sup }));
    const rows = (await env.DB.prepare("SELECT kind, actor FROM audit_log WHERE card_id = ? AND kind IN ('status', 'edit') ORDER BY n").bind(id).all<{ kind: string; actor: string }>()).results;
    expect(rows).toEqual([
      { kind: "status", actor: "anon" },
      { kind: "edit", actor: "supervisor.1" },
      { kind: "status", actor: "supervisor.1" },
    ]);
  });

  it("監修者が止めた行・回収の知らせには、その監修者が残る", async () => {
    const id = await okCard();
    const sup = H({ "x-role": await role("supervisor", "practice", 2) });
    expect((await send("POST", `${base}/${id}/sign`, { version: 1, mark: MARK }, sup)).status).toBe(200);
    expect((await send("POST", `${base}/${id}/status`, { to: "stopped", reason: "古い" }, sup)).status).toBe(200);
    const row = await env.DB.prepare("SELECT actor FROM audit_log WHERE card_id = ? AND kind = 'status' ORDER BY n DESC LIMIT 1").bind(id).first<{ actor: string }>();
    expect(row?.actor).toBe("supervisor.2");
    expect((await env.DB.prepare("SELECT stopped_by FROM recall_notices WHERE card_id = ?").bind(id).first<{ stopped_by: string }>())?.stopped_by).toBe("supervisor.2");
  });

  it("取り出しの OK の「誰が」も supervisor.1 の形", async () => {
    await env.DB.prepare("INSERT INTO extractions (id, tenant_id, input, rules) VALUES ('ex-actor', 'practice', '{\"text\":\"a\"}', '[{}]')").run();
    expect((await send("POST", "/api/t/practice/extract/ex-actor/ok", { items: [0] }, H({ "x-role": await role("supervisor") }))).status).toBe(201);
    expect((await env.DB.prepare("SELECT actor FROM extraction_oks WHERE extraction_id = 'ex-actor'").first<{ actor: string }>())?.actor).toBe("supervisor.1");
  });
});

describe("状態を移す口の守り", () => {
  it("監修者のしるしでも、状態の口から署名済みにはできない（署名は署名の記録からだけ）", async () => {
    const id = await okCard();
    const r = await send("POST", `${base}/${id}/status`, { to: "signed" }, H({ "x-role": await role("supervisor") }));
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toContain("署名の記録からだけ");
  });

  it("署名済みと停止のカードは確かめ直さない（409）", async () => {
    const id = await newCard();
    for (const st of ["signed", "stopped"]) {
      await env.DB.prepare("UPDATE cards SET status = ? WHERE id = ?").bind(st, id).run();
      expect((await send("POST", `${base}/${id}/verify`, { frames: [PNG, PNG, PNG] })).status, st).toBe(409);
    }
  });

  it("証拠の無い OK のカードと、危険の印の付いたカードには署名できない", async () => {
    const sup = H({ "x-role": await role("supervisor") });
    // 証拠なし: OK のまま（DB で移す）。署名は「確認待ち」で断る
    const bare = await newCard();
    await env.DB.prepare("UPDATE cards SET status = 'ok' WHERE id = ?").bind(bare).run();
    const r1 = await send("POST", `${base}/${bare}/sign`, { version: 1, mark: MARK }, sup);
    expect(r1.status).toBe(409);
    expect(((await r1.json()) as { error: string }).error).toContain("証拠が無い");
    // 危険の印: OK したあとで確かめ直して危ないと出たら、署名を断る
    const id = await okCard();
    dangerous = true;
    try {
      expect((await send("POST", `${base}/${id}/verify`, { frames: [PNG, PNG, PNG] })).status).toBe(200);
    } finally {
      dangerous = false;
    }
    const r2 = await send("POST", `${base}/${id}/sign`, { version: 1, mark: MARK }, sup);
    expect(r2.status).toBe(409);
    expect(((await r2.json()) as { error: string }).error).toContain("危険の印");
    expect((await statusOf(id)).status).toBe("ok");
  });

  it("数えたあとにほかの署名が入っても、1 日の上限を超えない（数えると移すを 1 つにした）", async () => {
    const sup = H({ "x-role": await role("supervisor", "practice", 2) });
    const signedAt = new Date().toISOString();
    const already = (await env.DB.prepare("SELECT count(*) AS n FROM audit_log WHERE tenant_id = 'practice' AND kind = 'sign' AND actor = 'supervisor.2'").first<{ n: number }>())!.n;
    for (let i = already; i < SIGN_DAILY_MAX - 1; i++) await appendAudit(env.DB, "practice", { card_id: `dummy-${i}`, kind: "sign", actor: "supervisor.2", payload: { signed_at: signedAt } });
    const [a, b] = [await okCard(), await okCard()];
    const sign = (id: string, db: D1Database = env.DB) => app.request(`${base}/${id}/sign`, { method: "POST", headers: sup, body: JSON.stringify({ version: 1, mark: MARK }) }, { ...env, DB: db });
    // b の署名が「今日は 19 枚」と数えたあと・移す前に、a の署名（20 枚目）を先に入れる
    const racing = readThenRace(env.DB, async () => expect((await sign(a)).status).toBe(200), /^SELECT opened_at FROM card_opens/);
    expect((await sign(b, racing)).status).toBe(429);
    const signed = await Promise.all([a, b].map(async (id) => (await statusOf(id)).status));
    expect(signed.filter((s) => s === "signed")).toHaveLength(1);
  });
});

describe("同時の直しと、署名済みを直したとき", () => {
  it("読んだあとでほかの直しが先に入ると、後のほうは 409 で ④ の行も足さない。戻すも効く", async () => {
    const id = await newCard();
    const put = (why: string, db: D1Database = env.DB) =>
      app.request(`${base}/${id}`, { method: "PUT", headers: H(), body: JSON.stringify({ card: { ...sampleCard(), why }, reason: "理由を直す" }) }, { ...env, DB: db });
    // カードを読んだ直後に、ほかの直し（版 1 → 2）を先に入れる DB で PUT する
    const racing = readThenRace(env.DB, async () => expect((await put("感電するから")).status).toBe(200));
    expect((await put("大けがをするから", racing)).status).toBe(409);
    expect((await statusOf(id)).version).toBe(2);
    const edits = (await env.DB.prepare("SELECT count(*) AS n FROM audit_log WHERE card_id = ? AND kind = 'edit'").bind(id).first<{ n: number }>())!.n;
    expect(edits).toBe(1);
    expect((await send("POST", `${base}/${id}/undo`, {})).status).toBe(200);
    expect((await statusOf(id)).version).toBe(3);
  });

  it("確認待ちのカードを直して下書きに戻ると、状態の 1 行が残る", async () => {
    const id = await newCard();
    await send("POST", `${base}/${id}/status`, { to: "pending" });
    await send("PUT", `${base}/${id}`, { card: { ...sampleCard(), why: "感電するから" }, reason: "理由を直す" });
    const last = await env.DB.prepare("SELECT payload FROM audit_log WHERE card_id = ? AND kind = 'status' ORDER BY n DESC LIMIT 1").bind(id).first<{ payload: string }>();
    expect(JSON.parse(last!.payload)).toMatchObject({ from: "pending", to: "draft", version: 1 });
  });

  async function signedCard() {
    const id = await okCard();
    expect((await send("POST", `${base}/${id}/sign`, { version: 1, mark: MARK }, H({ "x-role": await role("supervisor") }))).status).toBe(200);
    return id;
  }

  it("署名済みのカードを戻す・言葉で直す・その 1 枚を作り直すと、下書きに戻り回収の知らせが 1 つ出る", async () => {
    // 戻す: 先に 1 回直して版 2 にし、署名済みにしてから戻す
    const supH = H({ "x-role": await role("supervisor") });
    const u = await newCard();
    await send("PUT", `${base}/${u}`, { card: { ...sampleCard(), why: "感電するから" }, reason: "理由を直す" });
    await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(u).run();
    expect((await send("POST", `${base}/${u}/undo`, {}, supH)).status).toBe(200);
    expect(await statusOf(u)).toMatchObject({ status: "draft", version: 3 });
    expect(await recalls(u)).toBe(1);

    const w = await signedCard();
    const rw = await send("POST", `${base}/${w}/rework`, { text: "手を出す形にして" }, supH);
    expect(rw.status, await rw.clone().text()).toBe(200);
    expect((await statusOf(w)).status).toMatch(/draft/);
    expect(await recalls(w)).toBe(1);

    const r = await signedCard();
    const fix = (await (await send("POST", `${base}/${r}/fix`, { frame: 0, box: { x: 0.66, y: 0.52, w: 0.18, h: 0.16 }, text: "もっとはっきり" }, supH)).json()) as { n: number };
    const rd = await send("POST", `${base}/${r}/redo`, { n: fix.n }, supH);
    expect(rd.status, await rd.clone().text()).toBe(200);
    expect((await statusOf(r)).status).toMatch(/draft/);
    expect(await recalls(r)).toBe(1);
  });
});

describe("別のテナントからは、どの口でもカードに届かない", () => {
  it("練習用のカードを架空の会社から叩くと 404", async () => {
    const id = await okCard();
    const sup = H({ "x-role": await role("supervisor", "demo") });
    const box = { x: 0.5, y: 0.3, w: 0.3, h: 0.4 };
    for (const [method, path, body] of [
      ["POST", "/open", {}],
      ["POST", "/sign", { version: 1, mark: MARK }],
      ["GET", "/signature", undefined],
      ["GET", "/exemplars", undefined],
      ["POST", "/verify", { frames: [PNG, PNG, PNG] }],
      ["POST", "/undo", {}],
      ["POST", "/fix", { frame: 0, box, text: "x" }],
      ["POST", "/redo", { n: 1 }],
      ["POST", "/rework", { text: "x" }],
      ["PUT", "", { card: sampleCard(), reason: "x" }],
    ] as const)
      expect((await send(method, `/api/t/demo/cards/${id}${path}`, body, sup)).status, `${method} ${path}`).toBe(404);
    expect((await statusOf(id)).status).toBe("ok");
  });

  it("仕分けの入れ替えも、別のテナントの走りには届かない", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO night_runs (id, tenant_id, doc, pages) VALUES ('run-g', 'practice', 'd', 1)"),
      env.DB.prepare("INSERT INTO night_pages (run_id, tenant_id, page, state, card) VALUES ('run-g', 'practice', 1, 'done', 1)"),
    ]);
    expect((await send("PUT", "/api/t/demo/sort/run-g/1", { card: false }, H({ "x-role": await role("supervisor", "demo") }))).status).toBe(404);
    expect((await send("PUT", "/api/t/practice/sort/run-g/1", { card: false }, H({ "x-role": await role("supervisor") }))).status).toBe(200);
  });
});

describe("一覧が壊れた 1 枚で落ちない", () => {
  it("確認待ちの列は壊れた枚に broken の印を付け、新入社員の一覧は読めない枚を飛ばす", async () => {
    const id = await newCard();
    await env.DB.prepare("UPDATE cards SET status = 'pending', body = '{壊れた' WHERE id = ?").bind(id).run();
    const q = (await (await call("/api/t/practice/queue")).json()) as { cards: { id: string; broken: boolean; scripted: boolean }[] };
    expect(q.cards.find((x) => x.id === id)).toMatchObject({ broken: true, scripted: false });
    const s = await newCard();
    await env.DB.prepare("UPDATE cards SET status = 'signed', body = '{壊れた' WHERE id = ?").bind(s).run();
    await appendAudit(env.DB, "practice", { card_id: s, kind: "sign", actor: "supervisor.1", payload: { version: 1, content_sha256: "x" } });
    expect((await call("/api/t/practice/read/cards")).status).toBe(200);
  });

  it("脚本ありの印は、コマ割りが 1 つ以上ある脚本のときだけ", async () => {
    const id = await newCard();
    await env.DB.prepare("UPDATE cards SET status = 'pending', body = json_set(body, '$.script', json('{}')) WHERE id = ?").bind(id).run();
    const q = (await (await call("/api/t/practice/queue")).json()) as { cards: { id: string; scripted: boolean }[] };
    expect(q.cards.find((x) => x.id === id)?.scripted).toBe(false);
  });
});

describe("用語表の確かめ済みの印", () => {
  it("監修者か作者が付け外しでき、ほかの役割と役割なしは断る", async () => {
    const id = await newCard();
    await env.DB.prepare("INSERT INTO glossary (tenant_id, ja, vi, card_id) VALUES ('practice', '検電器', 'bút thử điện', ?)").bind(id).run();
    const put = (body: unknown, h: Record<string, string>) => send("PUT", `${base}/glossary`, body, h);
    expect((await put({ ja: "検電器", checked: true }, H())).status).toBe(403);
    expect((await put({ ja: "検電器", checked: true }, H({ "x-role": await role("trainer") }))).status).toBe(403);
    expect((await put({ ja: "検電器", checked: true }, H({ "x-role": await role("supervisor") }))).status).toBe(200);
    const g = (await (await call(`${base}/glossary`)).json()) as { terms: { ja: string; checked: boolean }[] };
    expect(g.terms.find((t) => t.ja === "検電器")?.checked).toBe(true);
    expect((await put({ ja: "無い言葉", checked: true }, H({ "x-role": await role("author") }))).status).toBe(404);
    expect((await put({ ja: "検電器" }, H({ "x-role": await role("author") }))).status).toBe(400);
  });
});

describe("MCP の守り", () => {
  const rpc = (tenant: string, body: unknown, key?: string, pub = false) =>
    app.request(`/mcp/${tenant}`, { method: "POST", headers: H(key ? { authorization: `Bearer ${key}` } : {}), body: JSON.stringify(body) }, pub ? { ...env, PUBLIC_DEMO: "1" } : env);

  it("ページは一度に 50 まで", async () => {
    const out = (await (await rpc("demo", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "extract_rules", arguments: { doc: "d", pages: Array.from({ length: 51 }, (_, i) => i + 1) } } })).json()) as { result: { isError: boolean; content: { text: string }[] } };
    expect(out.result.isError).toBe(true);
    expect(out.result.content[0].text).toContain("50 ページまで");
  });

  it("本番の公開の置き場の架空の会社は、鍵があっても見るだけと告げ、書き込む道具を断る", async () => {
    const key = "gk-guard-test";
    await env.DB.prepare("INSERT INTO mcp_keys (key_hash, tenant_id) VALUES (?, 'demo')").bind(await hashKey(key)).run();
    const init = (await (await rpc("demo", { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, key, true)).json()) as { result: { instructions: string } };
    expect(init.result.instructions).toContain("見るだけ");
    const out = (await (await rpc("demo", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "doc_to_cards", arguments: { text: "盤に触る前に検電する" } } }, key, true)).json()) as { result: { isError: boolean } };
    expect(out.result.isError).toBe(true);
  });
});
