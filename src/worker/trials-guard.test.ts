import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";

// 試しの回の守り（点検の直し）: 同時に来た答え・止めたカード・新入社員に見せる回の中身・前もって並べる ID の形
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const req = (method: string, body?: unknown, headers: Record<string, string> = {}): RequestInit => ({ method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const base = "/api/t/practice/trials";
const newCard = async (rule: string) => ((await (await call("/api/t/practice/cards", req("POST", { card: { ...sampleCard(), rule } }))).json()) as { id: string }).id;
const stop = (id: string) => env.DB.prepare("UPDATE cards SET status = 'stopped' WHERE id = ?").bind(id).run();
const login = async (body: Record<string, unknown>) => ((await (await call("/api/t/practice/login", req("POST", body))).json()) as { token: string }).token;

describe("同時に来た答え", () => {
  it("同じ人・同じ項目の答えが 2 つ同時に来ても、1 つだけ入り、もう 1 つは 409", async () => {
    const t = (await (await call(base, req("POST", { design: "cross", participants: [{ id: "g1", group: "ベトナム" }] }))).json()) as { id: string };
    const rs = await Promise.all([1, 2].map((i) => call(`${base}/${t.id}/responses`, req("POST", { participant: "g1", item: "A", ms: 1000 * i, answer: `a${i}` }))));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    const n = await env.DB.prepare("SELECT count(*) AS n FROM responses WHERE trial_id = ?").bind(t.id).first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("絵の答えを同じ人が 2 つ同時に送ると、後の方は 500 でなく 409。勘の card_id が文字でなければ 400", async () => {
    const ids = [await newCard("同時 1"), await newCard("同時 2")];
    const t = (await (await call(base, req("POST", { participants: ["q1"] }))).json()) as { id: string };
    expect((await call(`${base}/${t.id}/cards`, req("POST", { cards: ids }))).status).toBe(201);
    const rs = await Promise.all([1, 2].map(() => call(`${base}/${t.id}/picture-answers`, req("POST", { participant: "q1", answer: "x", card_id: undefined }))));
    for (const r of rs) expect([201, 409]).toContain(r.status);
    expect((await call(`${base}/${t.id}/forecasts`, req("POST", { card_id: { a: 1 }, rate: 50 }))).status).toBe(400);
  });
});

describe("止めたカードは試しの回で見せない", () => {
  it("止めたカードは結べず、結んだあとに止めると絵の 8 枚から抜ける。ほかのカードの文つきは変わらない", async () => {
    const ids: string[] = [];
    for (let i = 1; i <= 4; i++) ids.push(await newCard(`止め ${i}`));
    const t = (await (await call(base, req("POST", { design: "cross", participants: [{ id: "s1", group: "ベトナム" }, { id: "s2", group: "ベトナム" }] }))).json()) as { id: string };
    expect((await call(`${base}/${t.id}/cards`, req("POST", { cards: ids }))).status).toBe(201);
    const before = (await (await call(`${base}/${t.id}/pictures?participant=s1`)).json()) as { cards: { id: string; words?: string }[] };
    await stop(ids[1]);
    const after = (await (await call(`${base}/${t.id}/pictures?participant=s1`)).json()) as { cards: { id: string; words?: string }[] };
    expect(after.cards.map((x) => x.id)).not.toContain(ids[1]);
    for (const x of after.cards) expect(!!x.words).toBe(!!before.cards.find((y) => y.id === x.id)?.words);
    const staff = (await (await call(`${base}/${t.id}/pictures`)).json()) as { cards: { id: string; pos?: number }[] };
    expect(staff.cards.map((x) => x.id)).toEqual([ids[0], ids[2], ids[3]]);
    expect(staff.cards.every((x) => x.pos === undefined)).toBe(true);
    // 止めたカードを入れて結び直そうとすると断る
    expect((await call(`${base}/${t.id}/cards`, req("POST", { cards: [ids[0], ids[1]] }))).status).toBe(400);
  });

  it("① の素材に止めたカードは結べない。結んだあとに止めると、参加者には 409 で知らせる", async () => {
    const [ca, cb, cc] = [await newCard("素材 A"), await newCard("素材 B"), await newCard("素材 C")];
    const t = (await (await call(base, req("POST", { design: "cross", participants: [{ id: "m1", group: "ベトナム" }] }))).json()) as { id: string };
    for (const p of ["pages/guard-a.png", "pages/guard-b.png"]) await call(`/api/t/practice/files/${p}`, { method: "PUT", headers: { "content-type": "image/png" }, body: new Uint8Array([137, 80, 78, 71]) });
    await stop(cc);
    expect((await call(`${base}/${t.id}/material`, req("PUT", { A: { card: cc, page: "pages/guard-a.png" }, B: { card: cb, page: "pages/guard-b.png" } }))).status).toBe(400);
    expect((await call(`${base}/${t.id}/material`, req("PUT", { A: { card: ca, page: "pages/guard-a.png" }, B: { card: cb, page: "pages/guard-b.png" } }))).status).toBe(201);
    expect((await call(`${base}/${t.id}/material?participant=m1`)).status).toBe(200);
    await stop(ca);
    await stop(cb);
    expect((await call(`${base}/${t.id}/material?participant=m1`)).status).toBe(409);
  });
});

describe("新入社員に見せる回の中身と、前もって並べる ID", () => {
  it("新入社員の GET /trials/:id は自分の割り当てだけ。ほかの人の ID と国籍は出さない", async () => {
    const t = (await (await call(base, req("POST", { design: "cross", participants: [{ id: "student_V_7", group: "ベトナム" }, { id: "student_M_7", group: "ミャンマー" }] }))).json()) as { id: string };
    const me = { "x-role": await login({ role: "newhire", student: "student_V_7" }) };
    const v = (await (await call(`${base}/${t.id}`, req("GET", undefined, me))).json()) as { participants: string[]; assignments: { participant: string; group?: string }[] };
    expect(v.participants).toEqual(["student_V_7"]);
    expect(v.assignments.map((a) => a.participant)).toEqual(["student_V_7"]);
    expect(JSON.stringify(v)).not.toContain("student_M_7");
  });

  it("交差の回で前もって並べた student_ の ID は、入るときと同じ形に揃える", async () => {
    const made = (await (await call(base, req("POST", { design: "cross", participants: [{ id: "student_v_08", group: "ベトナム" }, { id: "p-free", group: "日本" }] }))).json()) as { id: string; participants: string[] };
    expect(made.participants).toEqual(["student_V_8", "p-free"]);
    // 同じ人が入り直しても、前もって並べた行の組のまま（別人として足されない）
    const j = await call(`${base}/${made.id}/join`, req("POST", { participant: "Student_V_8" }));
    expect(j.status).toBe(200);
    const again = (await (await call(`${base}/${made.id}`)).json()) as { participants: string[] };
    expect(again.participants).toEqual(["student_V_8", "p-free"]);
    // 揃えると重なる ID は断る
    expect((await call(base, req("POST", { design: "cross", participants: [{ id: "student_v_1", group: "ベトナム" }, { id: "student_V_01", group: "ベトナム" }] }))).status).toBe(400);
  });
});

describe("○× の組を同時に結ぶ", () => {
  it("同じカードを含む組を 2 つ同時に結ぶと、後の方は 500 でなく 409", async () => {
    const [g, b1, b2] = [await newCard("組 ○"), await newCard("組 ×1"), await newCard("組 ×2")];
    const rs = await Promise.all([b1, b2].map((bad) => call("/api/t/practice/pairs", req("POST", { good: g, bad }))));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
  });
});

describe("その場で同時に加わる（83・11/7）", () => {
  it("同じ国籍の 4 人が同時に加わっても、組は 2 人と 2 人に分かれる", async () => {
    const t = (await (await call(base, req("POST", { design: "cross", participants: [] }))).json()) as { id: string };
    const rs = await Promise.all([1, 2, 3, 4].map((i) => call(`${base}/${t.id}/join`, req("POST", { participant: `student_V_${40 + i}` }))));
    const sets = await Promise.all(rs.map(async (r) => ((await r.json()) as { set: 1 | 2 }).set));
    expect(rs.every((r) => r.status === 201)).toBe(true);
    expect(sets.filter((s) => s === 1).length).toBe(2);
  });
});
