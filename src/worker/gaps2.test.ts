import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { app } from "./index";
import { signRole } from "./people";

// 直す一覧の残り（Worker 側）: 束の回収・同じ版からの同時の直し・口ごとの返事
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const H = (extra: Record<string, string> = {}) => ({ "content-type": "application/json", ...extra });
const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = H()) => call(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
const role = (r: "supervisor" | "author" | "trainer" | "newhire", tenant = "practice") => signRole("test-secret", tenant, { role: r, slot: 1 });
const base = "/api/t/practice/cards";

async function newCard(bundle?: { id: string; order: number; total: number; parent: string }) {
  const card = { ...sampleCard(), ...(bundle ? { bundle } : {}) };
  const r = await send("POST", base, { card });
  expect(r.status, await r.clone().text()).toBe(201);
  return ((await r.json()) as { id: string }).id;
}
const notices = async (id: string) => (await env.DB.prepare("SELECT version, reason, stopped_by FROM recall_notices WHERE card_id = ?").bind(id).all<{ version: number; reason: string; stopped_by: string }>()).results;
const statusOf = async (id: string) => (await env.DB.prepare("SELECT status FROM cards WHERE id = ?").bind(id).first<{ status: string }>())!.status;

describe("束の回収", () => {
  it("3 枚の束の 1 枚を止めると、署名済みの 3 枚分の知らせが出る。ほかの枚の状態は変えない", async () => {
    const parent = "盤に触る前に検電する";
    const ids = [await newCard({ id: "b-recall", order: 1, total: 3, parent }), await newCard({ id: "b-recall", order: 2, total: 3, parent }), await newCard({ id: "b-recall", order: 3, total: 3, parent })];
    const other = await newCard({ id: "b-other", order: 1, total: 1, parent });
    const alone = await newCard();
    // 署名の記録は本物でなくてよい（知らせは状態が signed かどうかだけで決まる）
    for (const id of [...ids, other, alone]) await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(id).run();
    const sup = H({ "x-role": await role("supervisor") });
    const res = await send("POST", `${base}/${ids[1]}/status`, { to: "stopped", reason: "絵が違った" }, sup);
    expect(res.status, await res.clone().text()).toBe(200);
    for (const id of ids) expect((await notices(id)).length, id).toBe(1);
    expect((await notices(ids[1]))[0].reason).toBe("絵が違った");
    expect((await notices(ids[0]))[0]).toMatchObject({ stopped_by: "supervisor.1", reason: expect.stringContaining("同じ束") });
    // 知らせだけ。ほかの枚は署名済みのまま
    expect(await statusOf(ids[0])).toBe("signed");
    expect(await statusOf(ids[1])).toBe("stopped");
    expect(await notices(other)).toEqual([]);
    // 束でない 1 枚は今までどおり 1 つ
    expect((await send("POST", `${base}/${alone}/status`, { to: "stopped", reason: "x" }, sup)).status).toBe(200);
    expect((await notices(alone)).length).toBe(1);
  });

  it("束のほかの枚が署名済みでなければ（下書き）、知らせは自分の分だけ", async () => {
    const parent = "盤に触る前に検電する";
    const a = await newCard({ id: "b-half", order: 1, total: 2, parent });
    const b = await newCard({ id: "b-half", order: 2, total: 2, parent });
    await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(a).run();
    expect((await send("POST", `${base}/${a}/status`, { to: "stopped", reason: "x" }, H({ "x-role": await role("supervisor") }))).status).toBe(200);
    expect((await notices(a)).length).toBe(1);
    expect(await notices(b)).toEqual([]);
  });
});

/** カードを読む文を、2 本ともが読み終えるまで待たせる DB。2 本が同じ版を読んでから書きに行く並びを必ず作る
 *  （テストの実行環境は fetch を 1 本ずつ通してしまい、素の Promise.all では重ならないため） */
function bothReadFirst(db: D1Database, readers = 2): D1Database {
  let seen = 0;
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  return new Proxy(db, {
    get(target, k) {
      if (k !== "prepare") {
        const v = Reflect.get(target, k, target);
        return typeof v === "function" ? v.bind(target) : v;
      }
      return (sql: string) => {
        const st = target.prepare(sql);
        if (!/^SELECT id, tenant_id, body, status, version/.test(sql)) return st;
        return {
          bind: (...args: unknown[]) => {
            const b = st.bind(...args);
            return {
              first: async () => {
                const row = await b.first();
                if (++seen >= readers) open();
                await gate;
                return row;
              },
            };
          },
        };
      };
    },
  }) as D1Database;
}

describe("同じ版からの同時の直し", () => {
  it("2 人が同じ版を読んでから同時に PUT すると、1 本は 200・もう 1 本は 409。版は 1 つしか上がらず、記録も 1 行", async () => {
    const id = await newCard();
    const racing = { ...env, DB: bothReadFirst(env.DB) };
    const put = (why: string) => app.request(`${base}/${id}`, { method: "PUT", headers: H(), body: JSON.stringify({ card: { ...sampleCard(), why }, reason: "同時" }) }, racing);
    const statuses = (await Promise.all([put("感電するから"), put("死ぬから")])).map((r) => r.status);
    expect(statuses.sort()).toEqual([200, 409]);
    expect((await env.DB.prepare("SELECT version FROM cards WHERE id = ?").bind(id).first<{ version: number }>())!.version).toBe(2);
    const edits = await env.DB.prepare("SELECT count(*) AS n FROM audit_log WHERE card_id = ? AND kind = 'edit'").bind(id).first<{ n: number }>();
    expect(edits!.n).toBe(1);
  });
});

describe("口ごとの返事", () => {
  it("(a) 作者・教育担当が「止める」を押すと断られる。カードは動かない", async () => {
    const id = await newCard();
    for (const r of ["author", "trainer"] as const) {
      const res = await send("POST", `${base}/${id}/status`, { to: "stopped", reason: "止めたい" }, H({ "x-role": await role(r) }));
      expect(res.status, r).toBe(403);
      expect(((await res.json()) as { error: string }).error).toContain("監修者だけ");
    }
    expect(await statusOf(id)).toBe("draft");
  });

  it("(b) 署名前のカードを理由なしで止めると 400（止める理由が要る）。理由を付ければ止まる", async () => {
    const id = await newCard();
    const sup = H({ "x-role": await role("supervisor") });
    for (const body of [{ to: "stopped" }, { to: "stopped", reason: "  " }]) {
      const res = await send("POST", `${base}/${id}/status`, body, sup);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("止める理由が要る");
    }
    expect(await statusOf(id)).toBe("draft");
    expect((await send("POST", `${base}/${id}/status`, { to: "stopped", reason: "やめる" }, sup)).status).toBe(200);
    // 署名前に止めたので回収の知らせは出ない
    expect(await notices(id)).toEqual([]);
  });

  it("(c) 参加者 0 人の交差の回で結果（時間の集計）の口を開いても、落ちずに 0 件", async () => {
    const t = (await (await send("POST", "/api/t/practice/trials", { design: "cross", participants: [] })).json()) as { id: string };
    const res = await send("GET", `/api/t/practice/trials/${t.id}/summary`);
    expect(res.status).toBe(200);
    const s = (await res.json()) as { all: { n: number }[]; groups: unknown[] };
    expect(s.all.reduce((x, c) => x + c.n, 0)).toBe(0);
    expect(s.groups).toEqual([]);
  });

  it("(d) 公開の置き場（PUBLIC_DEMO・demo）で発行の口は閉じている", async () => {
    const pub = (path: string, init?: RequestInit) => app.request(path, init, { ...env, PUBLIC_DEMO: "1" });
    const h = async (r: "supervisor" | "trainer" | "newhire" | null) => H(r ? { "x-role": await role(r, "demo") } : {});
    // 役割なし・新入社員は読めない
    expect((await pub("/api/t/demo/issue/cards", { headers: await h(null) })).status).toBe(403);
    expect((await pub("/api/t/demo/issue/recalls", { headers: await h("newhire") })).status).toBe(403);
    // 監修者・教育担当でも、書き込みの口（貼る・抜き取り・朝礼・読んだ印）は公開の置き場では断る
    for (const r of ["supervisor", "trainer"] as const) {
      for (const p of ["/posts", "/sample", "/morning", "/recalls/1/read"]) {
        const res = await pub(`/api/t/demo/issue${p}`, { method: "POST", headers: await h(r), body: "{}" });
        expect(res.status, `${r} ${p}`).toBe(403);
        expect(((await res.json()) as { error: string }).error, `${r} ${p}`).toContain("公開の置き場では見るだけ");
      }
    }
  });

  it("(e) 無い回の id で開くと 404（回が無い）。結果・書き出し・材料の口も同じ。今の回が無いときは null", async () => {
    const none = "no-such-trial";
    for (const p of [`/${none}`, `/${none}/summary`, `/${none}/answers.csv`, `/${none}/responses`, `/${none}/pictures`]) {
      const res = await send("GET", `/api/t/practice/trials${p}`);
      expect(res.status, p).toBe(404);
      expect(((await res.json()) as { error: string }).error, p).toBe("回が無い");
    }
    // 回が 1 つも無いテナントでは、今の回は null
    const empty = await send("GET", "/api/t/demo/trials/open");
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ trial: null });
  });
});

describe("署名が外れる直しの記録", () => {
  it("「状態が移った」の行が書けなければ、直しごと戻る（版も直しの行も増えない）", async () => {
    const id = await newCard();
    expect((await send("POST", `${base}/${id}/status`, { to: "pending" })).status).toBe(200);
    await env.DB.prepare("CREATE TRIGGER IF NOT EXISTS t_status_fail BEFORE INSERT ON audit_log WHEN new.kind = 'status' AND new.payload LIKE '%状態の行を落とす%' BEGIN SELECT RAISE(ABORT, 'status fail'); END").run();
    try {
      const res = await send("PUT", `${base}/${id}`, { card: { ...sampleCard(), why: "感電するから" }, reason: "状態の行を落とす" });
      expect(res.status).not.toBe(200);
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS t_status_fail").run();
    }
    expect((await env.DB.prepare("SELECT version, status FROM cards WHERE id = ?").bind(id).first())).toEqual({ version: 1, status: "pending" });
    expect((await env.DB.prepare("SELECT count(*) AS n FROM audit_log WHERE card_id = ? AND kind = 'edit'").bind(id).first<{ n: number }>())!.n).toBe(0);
  });

  it("直しの行・状態の行・知らせが 1 つのバッチで入り、連鎖は切れない", async () => {
    const id = await newCard();
    expect((await send("POST", `${base}/${id}/status`, { to: "pending" })).status).toBe(200);
    expect((await send("PUT", `${base}/${id}`, { card: { ...sampleCard(), why: "感電するから" }, reason: "直す" })).status).toBe(200);
    const rows = (await env.DB.prepare("SELECT kind, n FROM audit_log WHERE card_id = ? ORDER BY n").bind(id).all<{ kind: string; n: number }>()).results;
    const kinds = rows.map((x) => x.kind);
    expect(kinds.slice(-3)).toEqual(["status", "edit", "status"]);
    const last2 = rows.slice(-2);
    expect(last2[1].n).toBe(last2[0].n + 1);
    const v = (await (await send("GET", "/api/t/practice/audit/verify")).json()) as { ok: boolean };
    expect(v.ok).toBe(true);
  });

  it("署名済みの 1 枚を直して下書きに戻すと、同じ束の署名済みの枚にも回収の知らせが出る（知らせだけ）", async () => {
    const parent = "盤に触る前に検電する";
    const ids = [await newCard({ id: "b-edit", order: 1, total: 3, parent }), await newCard({ id: "b-edit", order: 2, total: 3, parent }), await newCard({ id: "b-edit", order: 3, total: 3, parent })];
    for (const id of ids) await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(id).run();
    const sup = H({ "x-role": await role("supervisor") });
    const res = await send("PUT", `${base}/${ids[0]}`, { card: { ...sampleCard(), why: "感電するから", bundle: { id: "b-edit", order: 1, total: 3, parent } }, reason: "理由を直す" }, sup);
    expect(res.status, await res.clone().text()).toBe(200);
    for (const id of ids) expect((await notices(id)).length, id).toBe(1);
    expect((await notices(ids[2]))[0].reason).toContain("直して署名が外れた");
    expect(await statusOf(ids[0])).toMatch(/draft/);
    expect(await statusOf(ids[1])).toBe("signed");
  });
});
