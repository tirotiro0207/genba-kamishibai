import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { appendAudit } from "./audit";
import { contentHash } from "./sign";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown, headers: Record<string, string> = {}): RequestInit => ({ method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

/** 署名の行（⑤）を足す。署名の API を通さずに署名済みの状態を作るテスト用 */
async function addSignRow(id: string, tenant = "practice") {
  const r = (await env.DB.prepare("SELECT body, version FROM cards WHERE id = ?").bind(id).first<{ body: string; version: number }>())!;
  await appendAudit(env.DB, tenant, { card_id: id, kind: "sign", actor: "supervisor.1", payload: { version: r.version, signed_at: new Date().toISOString(), content_sha256: await contentHash(r.body) } });
}

/** 状態を直接決めたカード。signed には署名の行も足す（署名の行が無い署名済みは出さない決まり） */
async function cardWith(status: string, rule: string, tenant = "practice") {
  const c = (await (await call(`/api/t/${tenant}/cards`, json("POST", { card: { ...sampleCard(), rule } }))).json()) as { id: string };
  await env.DB.prepare("UPDATE cards SET status = ? WHERE id = ?").bind(status, c.id).run();
  if (status === "signed") await addSignRow(c.id, tenant);
  return c.id;
}

describe("新入社員の閲覧の入口（028）", () => {
  it("署名済みのカードだけが一覧に出て、未署名・停止は一覧にも 1 枚にも出ない", async () => {
    const ids: Record<string, string> = {};
    for (const s of ["draft", "ai_draft", "pending", "ok", "signed", "stopped"]) ids[s] = await cardWith(s, `028 ${s}`);
    const list = (await (await call("/api/t/practice/read/cards")).json()) as { cards: { id: string; rule: string }[] };
    const mine = list.cards.filter((x) => x.rule.startsWith("028 "));
    expect(mine.map((x) => x.id)).toEqual([ids.signed]);
    expect((await call(`/api/t/practice/read/cards/${ids.signed}`)).status).toBe(200);
    for (const s of ["draft", "ai_draft", "pending", "ok", "stopped"]) expect((await call(`/api/t/practice/read/cards/${ids[s]}`)).status, s).toBe(404);
  });

  it("経路や部品の理由は返さない", async () => {
    const id = await cardWith("signed", "028 経路なし");
    const c = (await (await call(`/api/t/practice/read/cards/${id}`)).json()) as Record<string, unknown>;
    expect(Object.keys(c).sort()).toEqual(["bundle", "frames", "id", "motion", "rule", "shape", "weight", "why", "words"]);
    expect(JSON.stringify(c)).not.toContain("sources");
  });

  it("言葉はやさしい日本語だけを返し、ベトナム語は返さない。データの vi は残る（11/5 作者）", async () => {
    const vi = "Trước khi chạm vào tủ điện, hãy kiểm tra bằng bút thử điện.";
    const made = (await (await call("/api/t/practice/cards", json("POST", { card: { ...sampleCard(), rule: "028 言葉", words: { ja: "ばんに さわる まえに たしかめます。", vi } } }))).json()) as { id: string };
    await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(made.id).run();
    await addSignRow(made.id);
    const c = (await (await call(`/api/t/practice/read/cards/${made.id}`)).json()) as { words: Record<string, string> };
    expect(c.words).toEqual({ ja: "ばんに さわる まえに たしかめます。" });
    const list = (await (await call("/api/t/practice/read/cards")).json()) as { cards: { id: string; words: unknown }[] };
    expect(JSON.stringify(list.cards.find((x) => x.id === made.id))).not.toContain("tủ điện");
    const row = (await env.DB.prepare("SELECT body FROM cards WHERE id = ?").bind(made.id).first<{ body: string }>())!;
    expect((JSON.parse(row.body) as { words: { vi: string } }).words.vi).toBe(vi);
  });

  it("新入社員の役割のしるしで読め、停止すると消える。別のテナントからは見えない", async () => {
    const id = await cardWith("signed", "028 停止");
    const nh = { "x-role": ((await (await call("/api/t/practice/login", json("POST", { role: "newhire" }))).json()) as { token: string }).token };
    expect((await call(`/api/t/practice/read/cards/${id}`, json("GET", undefined, nh))).status).toBe(200);
    await env.DB.prepare("UPDATE cards SET status = 'stopped' WHERE id = ?").bind(id).run();
    expect((await call(`/api/t/practice/read/cards/${id}`, json("GET", undefined, nh))).status).toBe(404);
    const other = await cardWith("signed", "028 別のテナント", "practice");
    expect((await call(`/api/t/demo/read/cards/${other}`)).status).toBe(404);
  });

  it("署名の行が無い署名済み・署名のあとに中身か版が変わった署名済みは、一覧にも 1 枚にも出ない（052）", async () => {
    const good = await cardWith("signed", "052 そのまま");
    const noRow = await cardWith("draft", "052 署名の行なし");
    await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(noRow).run();
    const edited = await cardWith("signed", "052 中身が変わった");
    await env.DB.prepare("UPDATE cards SET body = json_set(body, '$.why', '書き換えた') WHERE id = ?").bind(edited).run();
    const bumped = await cardWith("signed", "052 版が変わった");
    await env.DB.prepare("UPDATE cards SET version = version + 1 WHERE id = ?").bind(bumped).run();
    const list = (await (await call("/api/t/practice/read/cards")).json()) as { cards: { id: string; rule: string }[] };
    expect(list.cards.filter((x) => x.rule.startsWith("052 ")).map((x) => x.id)).toEqual([good]);
    expect((await call(`/api/t/practice/read/cards/${good}`)).status).toBe(200);
    for (const id of [noRow, edited, bumped]) expect((await call(`/api/t/practice/read/cards/${id}`)).status, id).toBe(404);
  });

  it("新入社員のしるしでは、署名の無いカードをスタッフ向けの口・監査・置き場・取り出し・回答の記録のどこからも取れない（052）", async () => {
    const nh = { "x-role": ((await (await call("/api/t/practice/login", json("POST", { role: "newhire" }))).json()) as { token: string }).token };
    const draft = await cardWith("draft", "052 下書き");
    const stopped = await cardWith("stopped", "052 停止");
    const ok = await cardWith("ok", "052 OK");
    const before = (await env.DB.prepare("SELECT count(*) AS n FROM cards WHERE tenant_id = 'practice'").first<{ n: number }>())!.n;
    const get = ["/cards", "/cards/stats", "/cards/glossary", "/audit/verify", "/files", "/files/pdf/x/p001.json", "/pairs", "/trials/none", "/trials/none/responses", "/trials/none/answers.csv", "/trials/none/grades?grader=g1"];
    for (const id of [draft, stopped, ok]) get.push(`/cards/${id}`, `/cards/${id}/signature`, `/audit/cards/${id}`, `/extract/${id}`);
    for (const path of get) expect((await call(`/api/t/practice${path}`, json("GET", undefined, nh))).status, `GET ${path}`).toBe(403);
    for (const path of ["/cards", `/cards/${draft}/open`, `/cards/${draft}/sign`, `/cards/${draft}/status`, "/extract", "/pairs", "/trials", "/trials/none/erase", "/reset", "/audit/cards/x"])
      expect((await call(`/api/t/practice${path}`, json("POST", { to: "signed", confirm: "practice" }, nh))).status, `POST ${path}`).toBe(403);
    expect((await call(`/api/t/practice/cards/${draft}`, json("PUT", {}, nh))).status).toBe(403);
    // 戻す操作を断ったので、カードは消えていない
    expect((await env.DB.prepare("SELECT count(*) AS n FROM cards WHERE tenant_id = 'practice'").first<{ n: number }>())!.n).toBe(before);
    // 入口のしるしが違うテナントのものなら、読む口も開かない
    expect((await call(`/api/t/demo/read/cards`, json("GET", undefined, nh))).status).toBe(401);
  });
});
