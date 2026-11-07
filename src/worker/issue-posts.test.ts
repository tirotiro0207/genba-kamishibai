import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { morningScore } from "../shared/issue";
import { appendAudit } from "./audit";
import { ensureSample } from "./issue";
import { resetTenant } from "./reset";
import { contentHash } from "./sign";

// 貼った場所の表・週の抜き取りの見直した印・朝礼の組（11/7 既定）
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown, headers: Record<string, string> = {}): RequestInit => ({ method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
async function roleHeader(tenant: string, role: string, slot = 1) {
  const res = await call(`/api/t/${tenant}/login`, json("POST", { role, slot }));
  return { "x-role": ((await res.json()) as { token: string }).token };
}
const newTenant = (id: string) => env.DB.prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'demo', ?)").bind(id, id).run();

async function signedCard(tenant: string, extra: Partial<ReturnType<typeof sampleCard>> = {}, signer = "supervisor.1") {
  const c = (await (await call(`/api/t/${tenant}/cards`, json("POST", { card: { ...sampleCard(), ...extra } }))).json()) as { id: string };
  await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(c.id).run();
  const r = (await env.DB.prepare("SELECT body, version FROM cards WHERE id = ?").bind(c.id).first<{ body: string; version: number }>())!;
  await appendAudit(env.DB, tenant, { card_id: c.id, kind: "sign", actor: signer, payload: { version: r.version, signed_at: new Date().toISOString(), content_sha256: await contentHash(r.body) } });
  return c.id;
}

describe("貼った場所の表", () => {
  it("署名済みだけ貼れ、止めると回収の知らせに「はがす紙」として出て、はがした印を付けられる", async () => {
    await newTenant("posts-a");
    const id = await signedCard("posts-a", { rule: "貼る 1" });
    const draft = ((await (await call("/api/t/posts-a/cards", json("POST", { card: sampleCard() }))).json()) as { id: string }).id;
    const trainer = await roleHeader("posts-a", "trainer");
    const sup = await roleHeader("posts-a", "supervisor");
    expect((await call("/api/t/posts-a/issue/posts", json("POST", { card_id: draft, place: "詰所の壁" }, trainer))).status).toBe(409);
    expect((await call("/api/t/posts-a/issue/posts", json("POST", { card_id: id, place: "" }, trainer))).status).toBe(400);
    expect((await call("/api/t/posts-a/issue/posts", json("POST", { card_id: id, place: "x" }, await roleHeader("posts-a", "author")))).status).toBe(403);
    const post = (await (await call("/api/t/posts-a/issue/posts", json("POST", { card_id: id, place: "詰所の壁" }, trainer))).json()) as { id: number; version: number; content_sha256: string };
    expect(post).toMatchObject({ version: 1, content_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    let list = (await (await call("/api/t/posts-a/issue/posts", json("GET", undefined, sup))).json()) as { posts: { id: number; current: boolean; to_remove: boolean }[]; to_remove: number };
    expect(list.posts.find((p) => p.id === post.id)).toMatchObject({ current: true, to_remove: false });

    expect((await call(`/api/t/posts-a/cards/${id}/status`, json("POST", { to: "stopped", reason: "手順が変わった" }, sup))).status).toBe(200);
    const r = (await (await call("/api/t/posts-a/issue/recalls", json("GET", undefined, trainer))).json()) as { recalls: { card_id: string; posts: { id: number; place: string }[] }[] };
    expect(r.recalls.find((x) => x.card_id === id)!.posts).toEqual([expect.objectContaining({ id: post.id, place: "詰所の壁" })]);
    list = (await (await call("/api/t/posts-a/issue/posts", json("GET", undefined, sup))).json()) as typeof list;
    expect(list.to_remove).toBe(1);

    const done = (await (await call(`/api/t/posts-a/issue/posts/${post.id}/removed`, json("POST", {}, trainer))).json()) as { removed_at: string; removed_by: string };
    expect(done.removed_by).toBe("trainer.1");
    const again = (await (await call(`/api/t/posts-a/issue/posts/${post.id}/removed`, json("POST", {}, sup))).json()) as { removed_at: string; removed_by: string };
    expect(again).toMatchObject({ removed_at: done.removed_at, removed_by: "trainer.1" });
    const r2 = (await (await call("/api/t/posts-a/issue/recalls", json("GET", undefined, trainer))).json()) as typeof r;
    expect(r2.recalls.find((x) => x.card_id === id)!.posts).toEqual([]);
    // 追記だけ: 場所は書き換えられない。データを戻すと消える
    await expect(env.DB.prepare("UPDATE card_posts SET place = 'x' WHERE id = ?").bind(post.id).run()).rejects.toThrow(/append only/);
    await resetTenant(env.DB, "posts-a");
    expect((await env.DB.prepare("SELECT count(*) AS n FROM card_posts WHERE tenant_id = 'posts-a'").first<{ n: number }>())!.n).toBe(0);
  });
});

describe("週の抜き取りの見直した印", () => {
  it("割り当てた監修者だけが 1 回付け、抜き取りと監査の記録に残る", async () => {
    await newTenant("samp-r");
    await signedCard("samp-r", { rule: "見直す" }, "supervisor.1");
    const s = await ensureSample(env.DB, env as never, "samp-r");
    const pick = s.picks[0];
    expect(pick.reviewer).toBe("supervisor.2");
    const path = `/api/t/samp-r/issue/samples/${s.week}/${pick.card_id}/reviewed`;
    expect((await call(path, json("POST", {}, await roleHeader("samp-r", "trainer")))).status).toBe(403);
    expect((await call(path, json("POST", {}, await roleHeader("samp-r", "supervisor", 1)))).status).toBe(403);
    const sup2 = await roleHeader("samp-r", "supervisor", 2);
    const res = await call(path, json("POST", { note: "絵と文が合っている" }, sup2));
    expect(res.status).toBe(200);
    const v = (await res.json()) as { reviewed: number; picks: { reviewed: { by: string; note: string } | null }[] };
    expect(v.reviewed).toBe(1);
    expect(v.picks[0].reviewed).toMatchObject({ by: "supervisor.2", note: "絵と文が合っている" });
    expect((await call(path, json("POST", {}, sup2))).status).toBe(409);
    expect((await call(`/api/t/samp-r/issue/samples/${s.week}/nope/reviewed`, json("POST", {}, sup2))).status).toBe(404);
    const log = await env.DB.prepare("SELECT payload FROM audit_log WHERE tenant_id = 'samp-r' AND card_id = ? AND kind = 'status'").bind(pick.card_id).first<{ payload: string }>();
    expect(JSON.parse(log!.payload)).toMatchObject({ from: "signed", to: "signed", review: { week: s.week } });
    const list = (await (await call("/api/t/samp-r/issue/samples", json("GET", undefined, sup2))).json()) as { samples: { reviewed: number }[] };
    expect(list.samples[0].reviewed).toBe(1);
  });
});

describe("朝礼の組", () => {
  it("作業の言葉に合う署名済みを、命に関わるものを先に選び、組を日付つきで残して使った回数を数える", () => expect(morningScore("脚立の作業", "脚立の天板に立たない")).toBeGreaterThan(morningScore("脚立の作業", "盤に触る前に検電する")));

  it("口から選んで残す", async () => {
    await newTenant("morning-a");
    const a = await signedCard("morning-a", { rule: "脚立の天板に立たない", why: "落ちるから", weight: "life" });
    const b = await signedCard("morning-a", { rule: "脚立は開き止めを確かめる", why: "倒れるから" });
    await signedCard("morning-a", { rule: "盤に触る前に検電する", why: "感電するから" });
    const trainer = await roleHeader("morning-a", "trainer");
    const sug = (await (await call(`/api/t/morning-a/issue/morning/suggest?work=${encodeURIComponent("脚立を使う作業")}`, json("GET", undefined, trainer))).json()) as { cards: { id: string; weight: string }[] };
    expect(sug.cards.map((x) => x.id)).toEqual([a, b]);
    expect((await call("/api/t/morning-a/issue/morning", json("POST", { work: "脚立", cards: ["nope"] }, trainer))).status).toBe(409);
    expect((await call("/api/t/morning-a/issue/morning", json("POST", { work: "脚立", cards: [] }, trainer))).status).toBe(400);
    const set = (await (await call("/api/t/morning-a/issue/morning", json("POST", { work: "脚立を使う作業", cards: [a, b], day: "2026-11-07" }, trainer))).json()) as { day: string; cards: { id: string; version: number }[] };
    expect(set).toMatchObject({ day: "2026-11-07", cards: [{ id: a, version: 1 }, { id: b, version: 1 }] });
    await call("/api/t/morning-a/issue/morning", json("POST", { work: "脚立", cards: [a] }, trainer));
    const all = (await (await call("/api/t/morning-a/issue/morning", json("GET", undefined, trainer))).json()) as { sets: unknown[]; used: Record<string, number> };
    expect(all.sets).toHaveLength(2);
    expect(all.used).toEqual({ [a]: 2, [b]: 1 });
  });
});
