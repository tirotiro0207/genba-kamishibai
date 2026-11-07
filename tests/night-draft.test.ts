import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { execD1 } from "../src/node/d1-node";
import { CARD_MAX_USD, runDrafts, type Steps } from "../src/node/night-draft";
import { queueOrder } from "../src/shared/queue";
import type { Rule } from "../src/shared/extract/rules";
import type { Evidence } from "../src/shared/verify/formal";
import { verifyTenant } from "../src/worker/audit";
import { sampleCard } from "./fixtures/card";

// 062: 仕分けで「する」のページ → 取り出し → 下書き → 確かめる AI。全部未承認で確認待ちに入り、赤は列の先頭。止めて走らせ直すと続きから
const root = join(import.meta.dirname, "..");

function memDb(before?: (sql: string, db: DatabaseSync) => void) {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(join(root, "migrations")).filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(join(root, "migrations", f), "utf-8"));
  const d1 = execD1(async (sql) => {
    before?.(sql, db);
    // batch はまとめて 1 回で来る（D1 と同じく、ひとまとめに流す）
    if (sql.includes(";\n")) {
      db.exec(`BEGIN;\n${sql};\nCOMMIT;`);
      return { results: [], changes: 0 };
    }
    if (/^\s*(SELECT|WITH)/i.test(sql)) return { results: db.prepare(sql).all() as Record<string, unknown>[], changes: 0 };
    const r = db.prepare(sql).run();
    return { results: [], changes: Number(r.changes) };
  });
  return { db, d1 };
}

const rule = (n: number): Rule => ({
  kind: "do",
  text: `決まり ${n}`,
  from: { quote: `決まり ${n}`, line: 1, line_end: 1, found: true },
  reasons: [{ text: "危ないから", from: { quote: "危ないから", line: 1, line_end: 1, found: true }, stated: true }],
  checklist: false,
  reworded: false,
});

/** 作りものの AI。ページ 2 の 1 枚目は赤、ほかは緑。crashAt 番目の確かめで落ちる */
function fakeSteps(opts: { rulesPerPage?: number; crashAt?: number; usdPerCard?: number } = {}) {
  const calls = { extract: 0, make: 0, verify: 0 };
  let usd = 0;
  const steps: Steps = {
    extract: async () => (calls.extract++, Array.from({ length: opts.rulesPerPage ?? 3 }, (_, i) => rule(i))),
    make: async (r) => (calls.make++, (usd += opts.usdPerCard ?? 0.1), { ...sampleCard(), rule: `${r.text}（${calls.make}）` }),
    words: async () => ({ words: { ja: "やさしい", vi: "dễ" }, terms: [] }),
    render: (card) => card.frames.map((_, i) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, i])),
    verify: async (card, frames): Promise<Evidence> => {
      calls.verify++;
      if (opts.crashAt === calls.verify) throw new Error("強制終了");
      const red = card.rule.startsWith("決まり 0") && calls.make === 3;
      return { agent: "verifier", model: "x", frames: frames.length, cited: [1], rate: red ? 30 : 90, band: red ? "red" : "green", dangerous: false, reason: "テスト", points: [{ id: "s1", credit: "full", frame: 1, reason: "r" }], reading: { frames: [], meaning: "", do: "", dont: null, why_guess: null, confidence: 50 } };
    },
    spent: async () => usd,
  };
  return { steps, calls };
}

const PAGES = [10, 20, 30].map((page) => ({ page, text: `p${page} の文\n決まり 0\n決まり 1\n決まり 2` }));
const base = { runId: "d1", tenant: "practice", sortRun: "night-x", doc: "manual", pages: PAGES, perPage: 2, cardMaxUsd: CARD_MAX_USD };

describe("夜間の下書きの走り手（062）", () => {
  it("「する」のページから 1 ページ 2 枚まで作り、全部確認待ちに入り、赤は確認待ちの列の先頭。監査の連鎖も正しい", async () => {
    const { db, d1 } = memDb();
    const { steps, calls } = fakeSteps();
    const s = await runDrafts({ db: d1, steps, ...base });
    expect(s).toMatchObject({ pages: 3, made_now: 6, cards: 6, red: 1, green: 5, errors: 0, stopped: null });
    expect(calls).toEqual({ extract: 3, make: 6, verify: 6 });
    const cards = db.prepare("SELECT id, status, body, created_at FROM cards WHERE tenant_id = 'practice'").all() as { id: string; status: string; body: string; created_at: string }[];
    expect(cards).toHaveLength(6);
    // 全部未承認（OK も署名も無い）で、確認待ち
    expect(new Set(cards.map((c) => c.status))).toEqual(new Set(["pending"]));
    // 確認待ちの列に並べると、赤が先頭
    const bands = db.prepare("SELECT card_id, band FROM night_drafts WHERE item >= 0").all() as { card_id: string; band: "red" | "green" }[];
    const q = queueOrder(cards.map((c) => ({ id: c.id, status: "pending" as const, band: bands.find((b) => b.card_id === c.id)!.band, dangerous: false, created_at: c.created_at })));
    expect(q[0].band).toBe("red");
    expect(JSON.parse(cards.find((c) => c.id === q[0].id)!.body).rule).toBe("決まり 0（3）");
    // 監査の記録: 1 枚ごとに ① ② ③（確かめ）と状態の 1 行。連鎖は切れていない
    const kinds = db.prepare("SELECT kind, count(*) AS n FROM audit_log WHERE tenant_id = 'practice' GROUP BY kind ORDER BY kind").all();
    expect(kinds).toEqual([{ kind: "make", n: 6 }, { kind: "source", n: 6 }, { kind: "status", n: 6 }, { kind: "verify", n: 6 }]);
    expect((await verifyTenant(d1, "practice")).ok).toBe(true);
    // 取り出しは記録に残り、OK の印は夜間の走り手（人の OK ではない）
    expect(db.prepare("SELECT actor, items FROM extraction_oks").all()).toEqual(Array(3).fill({ actor: "night", items: "[0,1]" }));
  });

  it("新人役の試し（11/5）: 全部のコマで合格の目安に届いたカードだけ場を抜いてもう 1 回読ませ、結果を確かめの記録に残す", async () => {
    const { db, d1 } = memDb();
    const { steps } = fakeSteps();
    let drops = 0;
    // 場を抜くと、1 枚目だけ 70% に下がる（ほかは 90%）
    steps.dropRead = async (card, frames) => {
      drops++;
      const e = await steps.verify(card, frames.slice(1));
      return { index: 0, evidence: drops === 1 ? { ...e, rate: 70, band: "yellow" } : e };
    };
    const s = await runDrafts({ db: d1, steps, ...base });
    // 赤の 1 枚（30%）には呼ばない
    expect(drops).toBe(5);
    expect(s).toMatchObject({ made_now: 6, red: 1, read_pass_now: 4 });
    const pays = (db.prepare("SELECT payload FROM audit_log WHERE kind = 'verify'").all() as { payload: string }[]).map((r) => JSON.parse(r.payload));
    expect(pays.filter((p) => p.read_pass === true)).toHaveLength(4);
    expect(pays.filter((p) => p.read_pass === false && p.drop === null)).toHaveLength(1);
    expect(pays.filter((p) => p.drop?.evidence.rate === 70)).toHaveLength(1);
    expect((await verifyTenant(d1, "practice")).ok).toBe(true);
  });

  it("途中で止まって走らせ直すと、済んだカードは飛ばし、作ったが確かめていないカードは作り直さずに確かめだけをする", async () => {
    const { db, d1 } = memDb();
    const first = fakeSteps({ crashAt: 3, });
    const a = await runDrafts({ db: d1, steps: first.steps, ...base, maxErrorsInRow: 1 });
    expect(a).toMatchObject({ made_now: 2, errors: 1, stopped: "1 回続けて失敗" });
    // 3 枚目は作ってあるが確かめていない
    expect(db.prepare("SELECT state, card_id IS NOT NULL AS has FROM night_drafts WHERE page = 20 AND item = 0").get()).toEqual({ state: "error", has: 1 });
    const second = fakeSteps();
    const b = await runDrafts({ db: d1, steps: second.steps, ...base });
    expect(b).toMatchObject({ made_now: 4, cards: 6, errors: 0 });
    // 2 回目の作成は、まだ作っていない 3 枚だけ（取り出し済みのページ 10・20 は取り出し直さない）
    expect(second.calls).toEqual({ extract: 1, make: 3, verify: 4 });
    expect(db.prepare("SELECT count(*) AS n FROM cards").get()).toEqual({ n: 6 });
    expect(db.prepare("SELECT attempts FROM night_drafts WHERE page = 20 AND item = 0").get()).toEqual({ attempts: 2 });
  });

  it("試しの枚数で止まり、1 枚の費用が上限を超えたら止まる", async () => {
    const { d1 } = memDb();
    const ten = await runDrafts({ db: d1, steps: fakeSteps().steps, ...base, runId: "d2", maxCards: 3 });
    expect(ten).toMatchObject({ made_now: 3, cards: 3, stopped: null });
    const { db: db2, d1: d1b } = memDb();
    const dear = await runDrafts({ db: d1b, steps: fakeSteps({ usdPerCard: CARD_MAX_USD + 0.1 }).steps, ...base, runId: "d3" });
    expect(dear.made_now).toBe(1);
    expect(dear.stopped).toMatch(/上限/);
    expect(db2.prepare("SELECT count(*) AS n FROM cards").get()).toEqual({ n: 1 });
  });

  // 063 の前の通しのレビューで直したこと
  it("選ぶ段があれば、先頭でなく選んだ決まりの番号で枠を作り、分けをページの行に残す。取り出しの費用もページの行に入る", async () => {
    const { db, d1 } = memDb();
    const { steps } = fakeSteps({ rulesPerPage: 5 });
    steps.pick = async (rules) => ({ items: [3, 1], notes: rules.map((_, i) => ({ i, class: i === 1 || i === 3 ? "動き" : "書類・教育・資格", weight: "高", reason: "r" })) });
    let spent = 0;
    const extract = steps.extract;
    steps.extract = async (t) => ((spent += 0.05), extract(t));
    const inner = steps.spent;
    steps.spent = async () => (await inner()) + spent;
    const s = await runDrafts({ db: d1, steps, ...base, pages: PAGES.slice(0, 1) });
    expect(s.made_now).toBe(2);
    expect(db.prepare("SELECT item FROM night_drafts WHERE item >= 0 ORDER BY item").all()).toEqual([{ item: 1 }, { item: 3 }]);
    const head = db.prepare("SELECT usd, pick FROM night_drafts WHERE item = -1").get() as { usd: number; pick: string };
    expect(head.usd).toBeCloseTo(0.05);
    expect(JSON.parse(head.pick)).toHaveLength(5);
    expect(s.extract_usd).toBeCloseTo(0.05);
    expect(s.usd).toBeCloseTo(0.25);
    expect(db.prepare("SELECT items FROM extraction_oks").get()).toEqual({ items: "[3,1]" });
  });

  it("枚数の上限はこの回の合計で数え、同じ上限で走らせ直しても超えない", async () => {
    const { d1 } = memDb();
    const a = await runDrafts({ db: d1, steps: fakeSteps().steps, ...base, maxCards: 3 });
    expect(a.made_now).toBe(3);
    const b = await runDrafts({ db: d1, steps: fakeSteps().steps, ...base, maxCards: 3 });
    expect(b).toMatchObject({ made_now: 0, cards: 3 });
    const c = await runDrafts({ db: d1, steps: fakeSteps().steps, ...base, maxCards: 5 });
    expect(c).toMatchObject({ made_now: 2, cards: 5 });
  });

  it("この回の費用の合計が上限に届いたら止まる（前の回の分も入れる）", async () => {
    const { db, d1 } = memDb();
    const a = await runDrafts({ db: d1, steps: fakeSteps({ usdPerCard: 0.1 }).steps, ...base, runMaxUsd: 0.25 });
    expect(a.made_now).toBe(3);
    expect(a.stopped).toMatch(/この回の費用/);
    const b = await runDrafts({ db: d1, steps: fakeSteps({ usdPerCard: 0.1 }).steps, ...base, runMaxUsd: 0.25 });
    expect(b.made_now).toBe(0);
    expect(db.prepare("SELECT count(*) AS n FROM cards").get()).toEqual({ n: 3 });
  });
  it("同じ走り手の番号を別のテナントで使うと、始める前に断る", async () => {
    const { db, d1 } = memDb();
    await runDrafts({ db: d1, steps: fakeSteps().steps, ...base, maxCards: 1 });
    const n = db.prepare("SELECT count(*) AS n FROM night_drafts").get();
    await expect(runDrafts({ db: d1, steps: fakeSteps().steps, ...base, tenant: "other" })).rejects.toThrow(/別のテナント/);
    // 断ったあとは何も書いていない
    expect(db.prepare("SELECT count(*) AS n FROM night_drafts").get()).toEqual(n);
  });

  it("確認待ちへ移す UPDATE が 0 行（間で状態が変わった）のときは、監査に note つきの状態の行をもう 1 行入れる", async () => {
    // 移す直前に、ほかの人がカードを止めたことにする
    const { db, d1 } = memDb((sql, raw) => {
      if (/^\s*UPDATE cards SET status = 'pending'/.test(sql)) raw.exec("UPDATE cards SET status = 'stopped'");
    });
    const s = await runDrafts({ db: d1, steps: fakeSteps().steps, ...base, maxCards: 1 });
    expect(s.made_now).toBe(1);
    expect(db.prepare("SELECT status FROM cards").all()).toEqual([{ status: "stopped" }]);
    const rows = (db.prepare("SELECT payload FROM audit_log WHERE kind = 'status' ORDER BY chain, n").all() as { payload: string }[]).map((r) => JSON.parse(r.payload));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ to: "pending" });
    expect(rows[0].note).toBeUndefined();
    expect(rows[1]).toMatchObject({ from: rows[0].from, to: rows[0].from, note: expect.stringContaining("移せなかった") });
  });
});
