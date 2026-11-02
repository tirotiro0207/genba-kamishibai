import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { pickSample, reviewerFor } from "../shared/issue";
import { appendAudit } from "./audit";
import { ensureSample } from "./issue";
import { contentHash } from "./sign";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown, headers: Record<string, string> = {}): RequestInit => ({ method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

async function roleHeader(tenant: string, role: string, slot = 1) {
  const res = await call(`/api/t/${tenant}/login`, json("POST", { role, slot }));
  return { "x-role": ((await res.json()) as { token: string }).token };
}

/** 署名済みのカードを作る。署名の行は署名の API を通さずに足す（署名の人と日時を決められる） */
async function signedCard(tenant: string, rule: string, signer = "supervisor.1", signedAt = new Date().toISOString()) {
  const c = (await (await call(`/api/t/${tenant}/cards`, json("POST", { card: { ...sampleCard(), rule } }))).json()) as { id: string };
  await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(c.id).run();
  const r = (await env.DB.prepare("SELECT body, version FROM cards WHERE id = ?").bind(c.id).first<{ body: string; version: number }>())!;
  await appendAudit(env.DB, tenant, { card_id: c.id, kind: "sign", actor: signer, payload: { version: r.version, signed_at: signedAt, content_sha256: await contentHash(r.body) } });
  return c.id;
}

const newTenant = (id: string) => env.DB.prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'demo', ?)").bind(id, id).run();

describe("見た人の記録（088）", () => {
  it("新入社員が見た印を送ると、版・しるしごとに最初と最後の時刻と回数が残り、監修者と教育担当が読める", async () => {
    const id = await signedCard("practice", "088 見た人");
    const nh = await roleHeader("practice", "newhire");
    expect((await call(`/api/t/practice/read/cards/${id}/seen`, json("POST", {}, nh))).status).toBe(200);
    expect((await call(`/api/t/practice/read/cards/${id}/seen`, json("POST", {}, nh))).status).toBe(200);
    // しるしの無い閲覧は anon
    expect((await call(`/api/t/practice/read/cards/${id}/seen`, json("POST", {}))).status).toBe(200);
    for (const who of ["supervisor", "trainer"]) {
      const res = await call(`/api/t/practice/issue/cards/${id}/views`, json("GET", undefined, await roleHeader("practice", who)));
      expect(res.status, who).toBe(200);
      const { views } = (await res.json()) as { views: { version: number; actor: string; views: number; first_viewed_at: string; last_viewed_at: string }[] };
      expect(views.map((v) => [v.actor, v.version, v.views]).sort()).toEqual([["anon", 1, 1], ["newhire.1", 1, 2]]);
      expect(views.every((v) => v.first_viewed_at <= v.last_viewed_at)).toBe(true);
    }
    const sup = await roleHeader("practice", "supervisor");
    const list = (await (await call("/api/t/practice/issue/cards", json("GET", undefined, sup))).json()) as { cards: { id: string; viewers: number; views: number }[] };
    expect(list.cards.find((x) => x.id === id)).toMatchObject({ viewers: 2, views: 3 });
  });

  it("署名済みでないカード・停止したカードの見た印は断る。別のテナントのカードにも付かない", async () => {
    const draft = (await (await call("/api/t/practice/cards", json("POST", { card: { ...sampleCard(), rule: "088 下書き" } }))).json()) as { id: string };
    expect((await call(`/api/t/practice/read/cards/${draft.id}/seen`, json("POST", {}))).status).toBe(404);
    const id = await signedCard("practice", "088 停止後");
    await env.DB.prepare("UPDATE cards SET status = 'stopped' WHERE id = ?").bind(id).run();
    expect((await call(`/api/t/practice/read/cards/${id}/seen`, json("POST", {}))).status).toBe(404);
    const other = await signedCard("practice", "088 別のテナント");
    expect((await call(`/api/t/demo/read/cards/${other}/seen`, json("POST", {}))).status).toBe(404);
  });
});

describe("停止と回収の知らせ（088）", () => {
  it("署名済みを理由つきで止めると、新入社員の口から消え、版と署名の日付つきの知らせが教育担当に出る", async () => {
    const signedAt = "2026-11-02T01:23:45.000Z";
    const id = await signedCard("practice", "088 回収", "supervisor.2", signedAt);
    const sup = await roleHeader("practice", "supervisor");
    const trainer = await roleHeader("practice", "trainer");
    const nh = await roleHeader("practice", "newhire");
    expect((await call(`/api/t/practice/read/cards/${id}`, json("GET", undefined, nh))).status).toBe(200);
    const stop = await call(`/api/t/practice/cards/${id}/status`, json("POST", { to: "stopped", reason: "  手順が現場と違っていた  " }, sup));
    expect(stop.status).toBe(200);
    // 新入社員の画面と API から消える
    expect((await call(`/api/t/practice/read/cards/${id}`, json("GET", undefined, nh))).status).toBe(404);
    expect((await call(`/api/t/practice/read/cards/${id}/seen`, json("POST", {}, nh))).status).toBe(404);
    const list = (await (await call("/api/t/practice/read/cards", json("GET", undefined, nh))).json()) as { cards: { id: string }[] };
    expect(list.cards.map((x) => x.id)).not.toContain(id);
    // 回収の知らせ
    const { recalls, unread } = (await (await call("/api/t/practice/issue/recalls", json("GET", undefined, trainer))).json()) as { recalls: { id: number; card_id: string; version: number; signed_at: string; reason: string; stopped_by: string; rule: string; read_at: string | null }[]; unread: number };
    const mine = recalls.find((x) => x.card_id === id)!;
    expect(mine).toMatchObject({ version: 1, signed_at: signedAt, reason: "手順が現場と違っていた", stopped_by: "supervisor.1", rule: "088 回収", read_at: null });
    expect(unread).toBeGreaterThan(0);
    // 監査の記録の状態の行にも理由が残る
    const row = await env.DB.prepare("SELECT payload FROM audit_log WHERE card_id = ? AND kind = 'status' ORDER BY n DESC LIMIT 1").bind(id).first<{ payload: string }>();
    expect(JSON.parse(row!.payload)).toMatchObject({ from: "signed", to: "stopped", reason: "手順が現場と違っていた" });
    // 読んだ印は教育担当だけ。最初に読んだ時刻のまま
    expect((await call(`/api/t/practice/issue/recalls/${mine.id}/read`, json("POST", {}, sup))).status).toBe(403);
    const first = (await (await call(`/api/t/practice/issue/recalls/${mine.id}/read`, json("POST", {}, trainer))).json()) as { read_at: string; read_by: string };
    expect(first.read_by).toBe("trainer.1");
    const again = (await (await call(`/api/t/practice/issue/recalls/${mine.id}/read`, json("POST", {}, trainer))).json()) as { read_at: string };
    expect(again.read_at).toBe(first.read_at);
    expect((await call(`/api/t/demo/issue/recalls/${mine.id}/read`, json("POST", {}, await roleHeader("demo", "trainer")))).status).toBe(404);
  });

  it("理由は無くても止められ（空で残る）、文字でなければ断る。署名済み以外の停止では知らせを作らない", async () => {
    const sup = await roleHeader("practice", "supervisor");
    const id = await signedCard("practice", "088 理由なし");
    expect((await call(`/api/t/practice/cards/${id}/status`, json("POST", { to: "stopped", reason: 5 }, sup))).status).toBe(400);
    expect((await call(`/api/t/practice/cards/${id}/status`, json("POST", { to: "stopped" }, sup))).status).toBe(200);
    const n = (await env.DB.prepare("SELECT count(*) AS n, max(reason) AS reason FROM recall_notices WHERE card_id = ?").bind(id).first<{ n: number; reason: string }>())!;
    expect(n).toEqual({ n: 1, reason: "" });
    // 止めたカードを下書きに戻しても、知らせは増えない
    expect((await call(`/api/t/practice/cards/${id}/status`, json("POST", { to: "draft" }, sup))).status).toBe(200);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM recall_notices WHERE card_id = ?").bind(id).first<{ n: number }>())!.n).toBe(1);
  });

  it("発行の口は監修者と教育担当だけ。新入社員・作者・役割なしは入れない", async () => {
    const paths = ["/issue/cards", "/issue/recalls", "/issue/samples", "/issue/cards/x/views"];
    for (const who of ["newhire", "author"]) {
      const h = await roleHeader("practice", who);
      for (const p of paths) expect((await call(`/api/t/practice${p}`, json("GET", undefined, h))).status, `${who} ${p}`).toBe(403);
      expect((await call("/api/t/practice/issue/sample", json("POST", {}, h))).status, who).toBe(403);
    }
    for (const p of paths) expect((await call(`/api/t/practice${p}`)).status, p).toBe(403);
    for (const who of ["supervisor", "trainer"]) expect((await call("/api/t/practice/issue/cards", json("GET", undefined, await roleHeader("practice", who)))).status, who).toBe(200);
  });
});

describe("週の抜き取り（088）", () => {
  const wk = new Date("2026-11-03T03:00:00Z");

  it("その週の署名済みから 2 枚を種で選んで記録し、同じ週の 2 回目は作り直さない。別の監修者が見直す", async () => {
    await newTenant("samp-a");
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(await signedCard("samp-a", `088 抜き取り ${i}`, i % 2 ? "supervisor.2" : "supervisor.1"));
    const first = await ensureSample(env.DB, env, "samp-a", wk);
    expect(first.week).toBe("2026-W45");
    expect(first.pool).toBe(6);
    expect(first.picks).toHaveLength(2);
    // 種から選び直すと同じ 2 枚（種が記録されているので、あとから確かめられる）
    expect(first.picks.map((p) => p.card_id).sort()).toEqual((await pickSample(ids, first.seed!)).sort());
    for (const p of first.picks) {
      expect(p.reviewer).toBe(reviewerFor(p.signed_by));
      expect(p.reviewer).not.toBe(p.signed_by);
      expect(p.version).toBe(1);
    }
    // 2 回目: 署名済みが増えても同じものを返す
    await signedCard("samp-a", "088 抜き取り 後から");
    const second = await ensureSample(env.DB, env, "samp-a", new Date("2026-11-05T03:00:00Z"));
    expect(second).toEqual(first);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM weekly_samples WHERE tenant_id = 'samp-a'").first<{ n: number }>())!.n).toBe(1);
    // 次の週は新しく作る
    const next = await ensureSample(env.DB, env, "samp-a", new Date("2026-11-10T03:00:00Z"));
    expect(next.week).toBe("2026-W46");
    expect(next.pool).toBe(7);
    expect(next.seed).not.toBe(first.seed);
  });

  it("署名済みが 1 枚ならそれだけ、0 枚なら何も記録しない。署名のあとに中身が変わった・止めたカードは候補に入らない", async () => {
    await newTenant("samp-b");
    const none = await ensureSample(env.DB, env, "samp-b", wk);
    expect(none).toMatchObject({ seed: null, picks: [] });
    expect((await env.DB.prepare("SELECT count(*) AS n FROM weekly_samples WHERE tenant_id = 'samp-b'").first<{ n: number }>())!.n).toBe(0);
    const edited = await signedCard("samp-b", "088 変わった");
    await env.DB.prepare("UPDATE cards SET body = json_set(body, '$.why', '書き換えた') WHERE id = ?").bind(edited).run();
    const stopped = await signedCard("samp-b", "088 停止");
    await env.DB.prepare("UPDATE cards SET status = 'stopped' WHERE id = ?").bind(stopped).run();
    expect((await ensureSample(env.DB, env, "samp-b", wk)).picks).toEqual([]);
    const only = await signedCard("samp-b", "088 ひとつだけ", "supervisor.2");
    const one = await ensureSample(env.DB, env, "samp-b", wk);
    expect(one.picks.map((p) => p.card_id)).toEqual([only]);
    expect(one.picks[0].reviewer).toBe("supervisor.1");
  });

  it("口から作ると今週の分が返り、もう一度呼んでも同じ。一覧にも出る。テナントごとに別", async () => {
    await newTenant("samp-c");
    for (let i = 0; i < 3; i++) await signedCard("samp-c", `088 口 ${i}`);
    const sup = await roleHeader("samp-c", "supervisor");
    const a = (await (await call("/api/t/samp-c/issue/sample", json("POST", {}, sup))).json()) as { week: string; seed: string; picks: unknown[] };
    const b = (await (await call("/api/t/samp-c/issue/sample", json("POST", {}, await roleHeader("samp-c", "trainer")))).json()) as typeof a;
    expect(a.picks).toHaveLength(2);
    expect(b).toEqual(a);
    const { samples } = (await (await call("/api/t/samp-c/issue/samples", json("GET", undefined, sup))).json()) as { samples: { week: string }[] };
    expect(samples.map((s) => s.week)).toContain(a.week);
    expect(samples).toHaveLength(1);
  });
});
