import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const base = "/api/t/practice/trials";
async function role(r: "author" | "supervisor" | "trainer") {
  const b = (await (await call("/api/t/practice/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: r, slot: 1 }) })).json()) as { token: string };
  return b.token;
}
const json = (method: string, token: string | null, body?: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json", ...(token ? { "x-role": token } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

async function answered() {
  const t = (await (await call(base, json("POST", null, { participants: ["staff-alpha"], seed: "score" }))).json()) as { id: string };
  const r = (await (await call(`${base}/${t.id}/responses`, json("POST", null, { participant: "staff-alpha", item: "B", answer: JSON.stringify({ ja: "", own: "dừng lại" }) }))).json()) as { seq: number };
  return { id: t.id, seq: r.seq };
}

describe("試しの答えの 10 段階の採点（11/7）", () => {
  it("作者と監修者が別々に付け、自分の点だけが見える", async () => {
    const t = await answered();
    const [a, s] = [await role("author"), await role("supervisor")];
    expect((await call(`${base}/${t.id}/scores`, json("POST", a, { target: `r:${t.seq}`, score: 7, comment: "止まるは伝わった" }))).status).toBe(201);
    expect((await call(`${base}/${t.id}/scores`, json("POST", s, { target: `r:${t.seq}`, score: 3 }))).status).toBe(201);
    const sa = (await (await call(`${base}/${t.id}/scoring`, json("GET", a))).json()) as { me: string; scores: Record<string, { score: number; comment: string }>; responses: { target: string }[] };
    expect(sa.me).toBe("author");
    expect(sa.scores[`r:${t.seq}`]).toEqual({ score: 7, comment: "止まるは伝わった" });
    expect(sa.responses.map((r) => r.target)).toContain(`r:${t.seq}`);
    const ss = (await (await call(`${base}/${t.id}/scoring`, json("GET", s))).json()) as { scores: Record<string, { score: number }> };
    expect(ss.scores[`r:${t.seq}`].score).toBe(3);
  });

  it("点は 1〜10 だけ。ほかの役割と、別の回の答えは断る。記録は追記だけ", async () => {
    const t = await answered();
    const a = await role("author");
    expect((await call(`${base}/${t.id}/scores`, json("POST", a, { target: `r:${t.seq}`, score: 11 }))).status).toBe(400);
    expect((await call(`${base}/${t.id}/scores`, json("POST", a, { target: `r:${t.seq}`, score: 0 }))).status).toBe(400);
    expect((await call(`${base}/${t.id}/scores`, json("POST", await role("trainer"), { target: `r:${t.seq}`, score: 5 }))).status).toBe(403);
    const other = await answered();
    expect((await call(`${base}/${t.id}/scores`, json("POST", a, { target: `r:${other.seq}`, score: 5 }))).status).toBe(400);
    await call(`${base}/${t.id}/scores`, json("POST", a, { target: `r:${t.seq}`, score: 5 }));
    await expect(env.DB.prepare("UPDATE scores SET score = 1 WHERE trial_id = ?").bind(t.id).run()).rejects.toThrow(/append only/);
    await expect(env.DB.prepare("DELETE FROM scores WHERE trial_id = ?").bind(t.id).run()).rejects.toThrow(/append only/);
  });

  it("公開の置き場（練習・デモ）の採点の表には、同意の無い名前を出さない", async () => {
    const { default: app } = await import("./index");
    const e = { ...env, AUTHOR_NAME: "作者の名前", SUPERVISOR_1_NAME: "監修者の名前", PUBLIC_NAMES: "supervisor.1" } as typeof env;
    const t = await answered();
    const a = await role("author");
    const names = async (ev: typeof env) => ((await (await app.request(`${base}/${t.id}/scoring`, json("GET", a), ev)).json()) as { names: { author: string; supervisor: string } }).names;
    // 同意した枠（監修者 1）だけ名前が出て、作者は空欄
    expect(await names(e)).toEqual({ author: "", supervisor: "監修者の名前" });
    // 同意の枠が無ければ、どちらも空欄
    expect(await names({ ...e, PUBLIC_NAMES: "" } as typeof env)).toEqual({ author: "", supervisor: "" });
  });

  it("latest で答えのある新しい回を開く", async () => {
    const t = await answered();
    const b = (await (await call(`${base}/latest/scoring`, json("GET", await role("supervisor")))).json()) as { trial: { id: string } };
    expect(b.trial.id).toBe(t.id);
  });
});

describe("採点の入口: どちらが採点するかを PIN の前に選ぶ（11/7 作者）", () => {
  it("名前と右の人の枠を PIN なしで読める。答えや点は出さない", async () => {
    const res = await call("/api/score-names");
    expect(res.status).toBe(200);
    const b = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(b).sort()).toEqual(["author", "slot", "supervisor"]);
    expect(b.slot).toBe(1);
  });

  it("右の人の枠と名前は環境変数で決まり、決めた枠でない監修者は採点できない", async () => {
    const { scoreNames, scoreSlot } = await import("./scores");
    const e = { ...env, SCORE_SUPERVISOR_SLOT: "2", SCORE_SUPERVISOR_NAME: "右の人", SUPERVISOR_2_NAME: "監修者二" } as typeof env;
    expect(scoreSlot(e)).toBe(2);
    expect(scoreNames(e).supervisor).toBe("右の人");
    expect(scoreNames({ ...e, SCORE_SUPERVISOR_NAME: "" } as typeof env).supervisor).toBe("監修者二");
    expect(scoreSlot({ ...env, SCORE_SUPERVISOR_SLOT: "x" } as typeof env)).toBe(1);
    // 既定（枠 1）のとき、監修者 2 で入っても採点の表は開けない
    const t = await answered();
    const b = (await (await call("/api/t/practice/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "supervisor", slot: 2 }) })).json()) as { token: string };
    expect((await call(`${base}/${t.id}/scoring`, json("GET", b.token))).status).toBe(403);
  });
});
