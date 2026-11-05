import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { joinSet } from "./trials";
import { normalizeStudent, signRole, studentGroup, verifyRole } from "./people";

// 新入社員は ID（student_V_1 など）で入り、その場で今の回に加わる（11/6 作者）
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const req = (method: string, body?: unknown, headers: Record<string, string> = {}): RequestInit => ({ method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const as = async (body: Record<string, unknown>) => {
  const r = await call("/api/t/practice/login", req("POST", body));
  return { status: r.status, body: (await r.json()) as { token?: string; student?: string | null; error?: string } };
};

describe("新入社員の ID（11/6）", () => {
  it("ID は student_<V・M・J・C>_<番号>。大文字小文字と前後の空白はそろえ、国籍は頭文字から決まる", () => {
    expect(normalizeStudent(" Student_v_01 ")).toBe("student_V_1");
    expect(normalizeStudent("student_C_12")).toBe("student_C_12");
    for (const bad of ["student_X_1", "student_V_0", "student_V", "V_1", "", 3]) expect(normalizeStudent(bad)).toBeNull();
    expect(["V", "M", "J", "C"].map((g) => studentGroup(`student_${g}_1`))).toEqual(["ベトナム", "ミャンマー", "日本", "カンボジア"]);
  });

  it("しるしに ID が入り、書き換えると通らない。ID は新入社員だけ", async () => {
    const t = await signRole("k", "practice", { role: "newhire", slot: 1, student: "student_V_2" });
    expect(await verifyRole("k", t, "practice")).toEqual({ role: "newhire", slot: 1, student: "student_V_2" });
    expect(await verifyRole("k", t.replace("student_V_2", "student_V_3"), "practice")).toBeNull();
    expect(await verifyRole("k", await signRole("k", "practice", { role: "trainer", slot: 1, student: "student_V_2" }), "practice")).toBeNull();
    expect((await as({ role: "newhire", student: "student_M_1" })).body.student).toBe("student_M_1");
    expect((await as({ role: "supervisor", student: "student_M_1" })).status).toBe(400);
    expect((await as({ role: "newhire", student: "student_Z_1" })).status).toBe(400);
  });

  it("その場で加わる組は、同じ国籍の中で少ない方。前に加わった人の組は変わらない", () => {
    expect(joinSet("s", "ベトナム", [1])).toBe(2);
    expect(joinSet("s", "ベトナム", [2, 2, 1])).toBe(1);
    const sets: (1 | 2)[] = [];
    for (let i = 0; i < 6; i++) sets.push(joinSet("seed", "カンボジア", sets));
    expect(sets.filter((s) => s === 1)).toHaveLength(3);
  });

  it("0 人で作った回に、新入社員が ID で加わり、自分の分だけ受けられる。ほかの人の分・採点・結果は開かない", async () => {
    const staff = { "x-role": (await as({ role: "trainer" })).body.token! };
    const made = await call("/api/t/practice/trials", req("POST", { design: "cross", participants: [] }, staff));
    expect(made.status).toBe(201);
    const { id } = (await made.json()) as { id: string };
    const open = (await (await call("/api/t/practice/trials/open", req("GET", undefined, staff))).json()) as { trial: { id: string } };
    expect(open.trial.id).toBe(id);

    const v1 = { "x-role": (await as({ role: "newhire", student: "student_V_1" })).body.token! };
    const v2 = { "x-role": (await as({ role: "newhire", student: "student_V_2" })).body.token! };
    const j1 = (await (await call(`/api/t/practice/trials/${id}/join`, req("POST", {}, v1))).json()) as { group: string; set: number };
    const j2 = (await (await call(`/api/t/practice/trials/${id}/join`, req("POST", {}, v2))).json()) as { group: string; set: number };
    expect(j1.group).toBe("ベトナム");
    expect(j1.set + j2.set).toBe(3);
    // 何度押しても組は変わらない
    expect(((await (await call(`/api/t/practice/trials/${id}/join`, req("POST", {}, v1))).json()) as { set: number }).set).toBe(j1.set);
    // 自分の答えは送れる。ほかの人の分は送れない
    expect((await call(`/api/t/practice/trials/${id}/responses`, req("POST", { participant: "student_V_1", item: "A", ms: 1000, answer: "a" }, v1))).status).toBe(201);
    expect((await call(`/api/t/practice/trials/${id}/responses`, req("POST", { participant: "student_V_2", item: "A", ms: 1000, answer: "a" }, v1))).status).toBe(403);
    expect((await call(`/api/t/practice/trials/${id}/material?participant=student_V_2`, req("GET", undefined, v1))).status).toBe(403);
    // 答えの一覧は自分の分だけ
    await call(`/api/t/practice/trials/${id}/responses`, req("POST", { participant: "student_V_2", item: "A", ms: 900, answer: "b" }, v2));
    const mine = (await (await call(`/api/t/practice/trials/${id}/responses`, req("GET", undefined, v1))).json()) as { responses: { participant: string }[] };
    expect(mine.responses.map((r) => r.participant)).toEqual(["student_V_1"]);
    const all = (await (await call(`/api/t/practice/trials/${id}/responses`, req("GET", undefined, staff))).json()) as { responses: unknown[] };
    expect(all.responses).toHaveLength(2);
    for (const path of ["summary", "grades?grader=g1", "answers.csv", "picture-answers"]) expect((await call(`/api/t/practice/trials/${id}/${path}`, req("GET", undefined, v1))).status, path).toBe(403);
    expect((await call("/api/t/practice/trials", req("POST", { design: "cross", participants: [] }, v1))).status).toBe(403);
    // ID の無い新入社員は今までどおり入れない
    const plain = { "x-role": (await as({ role: "newhire" })).body.token! };
    expect((await call(`/api/t/practice/trials/${id}`, req("GET", undefined, plain))).status).toBe(403);
  });
});

describe("新入社員に見せるページの画像（11/6）", () => {
  it("資料の置き場は読めないが、自分に「文」として見せるページだけは回の口から読める", async () => {
    const staff = { "x-role": (await as({ role: "trainer" })).body.token! };
    const ids: string[] = [];
    for (const rule of ["page A", "page B"]) ids.push(((await (await call("/api/t/practice/cards", req("POST", { card: { ...sampleCard(), rule } }, staff))).json()) as { id: string }).id);
    const { id } = (await (await call("/api/t/practice/trials", req("POST", { design: "cross", participants: [] }, staff))).json()) as { id: string };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    for (const k of ["A", "B"]) expect((await call(`/api/t/practice/files/pages/${id}-${k}.png`, { method: "PUT", headers: { ...staff, "content-type": "image/png" }, body: png })).status).toBe(201);
    expect((await call(`/api/t/practice/trials/${id}/material`, req("PUT", { A: { card: ids[0], page: `pages/${id}-A.png` }, B: { card: ids[1], page: `pages/${id}-B.png` } }, staff))).status).toBe(201);
    const me = { "x-role": (await as({ role: "newhire", student: "student_M_1" })).body.token! };
    await call(`/api/t/practice/trials/${id}/join`, req("POST", {}, me));
    const m = (await (await call(`/api/t/practice/trials/${id}/material?participant=student_M_1`, req("GET", undefined, me))).json()) as { items: { item: "A" | "B"; shown: string; page_src?: string }[] };
    const text = m.items.find((x) => x.shown === "text")!;
    const card = m.items.find((x) => x.shown === "card")!;
    const got = await call(`/api/t/practice/${text.page_src}`, req("GET", undefined, me));
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(png);
    // カードの側の項目のページ・ほかの人の分・置き場は読めない
    expect((await call(`/api/t/practice/trials/${id}/page/${card.item}?participant=student_M_1`, req("GET", undefined, me))).status).toBe(403);
    expect((await call(`/api/t/practice/trials/${id}/page/${text.item}?participant=student_M_2`, req("GET", undefined, me))).status).toBe(403);
    expect((await call(`/api/t/practice/files/pages/${id}-A.png`, req("GET", undefined, me))).status).toBe(403);
  });
});

describe("データを戻すと、その場で加わった人も消える（11/6）", () => {
  it("練習用のテナントを戻すと trial_joins も 0 になる", async () => {
    const staff = { "x-role": (await as({ role: "trainer" })).body.token! };
    const { id } = (await (await call("/api/t/practice/trials", req("POST", { design: "cross", participants: [] }, staff))).json()) as { id: string };
    await call(`/api/t/practice/trials/${id}/join`, req("POST", { participant: "student_J_1" }, staff));
    const r = (await (await call("/api/t/practice/reset", req("POST", {}, staff))).json()) as { removed: Record<string, number> };
    expect(r.removed.trial_joins).toBeGreaterThanOrEqual(1);
    expect((await call(`/api/t/practice/trials/${id}`, req("GET", undefined, staff))).status).toBe(404);
  });
});
