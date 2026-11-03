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

function memDb() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(join(root, "migrations")).filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(join(root, "migrations", f), "utf-8"));
  const d1 = execD1(async (sql) => {
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
});
