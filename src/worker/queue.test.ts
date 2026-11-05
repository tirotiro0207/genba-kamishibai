import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { SCRIPT, sampleCard } from "../../tests/fixtures/card";
import { appendAudit } from "./audit";

// 061: 確認待ちの列は赤のカードが先頭。監修者は仕分けの一覧を入れ替えられ、保存される
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown, headers: Record<string, string> = {}): RequestInit => ({ method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

async function roleHeader(tenant: string, role: string, slot = 1) {
  const res = await call(`/api/t/${tenant}/login`, json("POST", { role, slot }));
  return { "x-role": ((await res.json()) as { token: string }).token };
}

/** カードを作り、帯を渡したら今の版の確かめの証拠を監査の記録に足す */
async function card(tenant: string, rule: string, band?: "red" | "yellow" | "green") {
  const c = (await (await call(`/api/t/${tenant}/cards`, json("POST", { card: { ...sampleCard(), rule } }))).json()) as { id: string; version: number; body: { frames: unknown[] } };
  if (band) {
    const frames = c.body.frames.length;
    const evidence = { agent: "verifier", model: "x", frames, cited: [1], rate: band === "red" ? 40 : band === "yellow" ? 70 : 90, band, dangerous: false, reason: "テスト", points: [{ id: "s1", credit: "full", frame: 1, reason: "テスト" }], reading: {} };
    await appendAudit(env.DB, tenant, { card_id: c.id, kind: "verify", actor: "system", payload: { version: c.version, evidence } });
  }
  return c.id;
}

describe("確認待ちの列と仕分けの入れ替え（061）", () => {
  it("確認待ちの列は赤のカードが先頭で、署名済みは入らない", async () => {
    await env.DB.prepare("INSERT INTO tenants (id, kind, name) VALUES ('q061', 'demo', 'q061')").run();
    const g = await card("q061", "緑のカード", "green");
    const n = await card("q061", "まだのカード");
    const r = await card("q061", "赤のカード", "red");
    const y = await card("q061", "黄のカード", "yellow");
    const s = await card("q061", "署名済み", "red");
    await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(s).run();
    const res = await call("/api/t/q061/queue", json("GET", undefined, await roleHeader("q061", "supervisor")));
    expect(res.status).toBe(200);
    const { cards } = (await res.json()) as { cards: { id: string; band: string | null; rule: string }[] };
    expect(cards.map((x) => x.id)).toEqual([r, y, n, g]);
    expect(cards[0]).toMatchObject({ band: "red", rule: "赤のカード" });
  });

  it("夜間の一括で作ったカードには夜間の印が付き、人が作ったカードには付かない（11/6）", async () => {
    await env.DB.prepare("INSERT INTO tenants (id, kind, name) VALUES ('q063n', 'demo', 'q063n')").run();
    const made = await card("q063n", "人が作ったカード", "red");
    const nightCard = await card("q063n", "夜間の下書き", "red");
    await env.DB.prepare("INSERT INTO night_drafts (run_id, tenant_id, sort_run, page, item, card_id) VALUES ('nd-test', 'q063n', 'ns-test', 3, 0, ?)").bind(nightCard).run();
    const res = await call("/api/t/q063n/queue", json("GET", undefined, await roleHeader("q063n", "supervisor")));
    const { cards } = (await res.json()) as { cards: { id: string; night: boolean }[] };
    expect(cards.find((x) => x.id === nightCard)?.night).toBe(true);
    expect(cards.find((x) => x.id === made)?.night).toBe(false);
  });

  it("脚本の有るカードは scripted が true、脚本の無い前の作り方のカードは false。本文が壊れた 1 枚があっても一覧は落ちない（11/6）", async () => {
    await env.DB.prepare("INSERT INTO tenants (id, kind, name) VALUES ('qscr', 'demo', 'qscr')").run();
    const old = await card("qscr", "脚本の無いカード");
    const res0 = await call("/api/t/qscr/cards", json("POST", { card: { ...sampleCard(), rule: "脚本の有るカード", script: SCRIPT } }));
    const withScript = ((await res0.json()) as { id: string }).id;
    const broken = await card("qscr", "本文が壊れたカード");
    await env.DB.prepare("UPDATE cards SET body = '{壊れた' WHERE id = ?").bind(broken).run();
    const res = await call("/api/t/qscr/queue", json("GET", undefined, await roleHeader("qscr", "supervisor")));
    expect(res.status).toBe(200);
    const { cards } = (await res.json()) as { cards: { id: string; scripted: boolean }[] };
    expect(cards.find((x) => x.id === withScript)?.scripted).toBe(true);
    expect(cards.find((x) => x.id === old)?.scripted).toBe(false);
    expect(cards.find((x) => x.id === broken)?.scripted).toBe(false);
  });

  it("監修者が「する／しない」を入れ替えると保存され、最初の AI の答えと入れ替えた人が残る。監修者のほかは入れ替えられない", async () => {
    await env.DB.prepare("INSERT INTO night_runs (id, tenant_id, doc, pages) VALUES ('n061', 'practice', 'manual', 2)").run();
    await env.DB.prepare("INSERT INTO night_pages (run_id, tenant_id, page, state, card, reason) VALUES ('n061', 'practice', 1, 'done', 0, '目次'), ('n061', 'practice', 2, 'pending', NULL, NULL)").run();
    const sup = await roleHeader("practice", "supervisor");
    expect((await call("/api/t/practice/sort/n061/1", json("PUT", { card: true }, await roleHeader("practice", "author")))).status).toBe(403);
    expect((await call("/api/t/practice/sort/n061/1", json("PUT", { card: "yes" }, sup))).status).toBe(400);
    expect((await call("/api/t/practice/sort/n061/2", json("PUT", { card: true }, sup))).status).toBe(409);
    expect((await call("/api/t/practice/sort/n061/9", json("PUT", { card: true }, sup))).status).toBe(404);
    const res = await call("/api/t/practice/sort/n061/1", json("PUT", { card: true, reason: "服装の決まりがある" }, sup));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ page: 1, card: true, ai_card: false, swapped_by: "supervisor.1", swap_reason: "服装の決まりがある" });
    // 読み直しても入れ替えたまま（保存されている）
    const list = (await (await call("/api/t/practice/sort?run=n061", json("GET", undefined, sup))).json()) as { run: { id: string }; pages: { page: number; card: boolean | null; ai_card: boolean | null }[] };
    expect(list.run.id).toBe("n061");
    expect(list.pages.map((p) => [p.page, p.card, p.ai_card])).toEqual([[1, true, false], [2, null, null]]);
    // 元に戻すと AI の答えと同じになり、ai_card は最初の答えのまま
    const back = (await (await call("/api/t/practice/sort/n061/1", json("PUT", { card: false }, sup))).json()) as { card: boolean; ai_card: boolean };
    expect(back).toMatchObject({ card: false, ai_card: false });
    // 新入社員は一覧も見られない
    expect((await call("/api/t/practice/sort", json("GET", undefined, await roleHeader("practice", "newhire")))).status).toBe(403);
  });
});
