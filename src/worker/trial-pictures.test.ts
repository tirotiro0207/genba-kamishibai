import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { pictureOrder } from "../shared/picture-order";

// 059: 記録アプリに 8 枚（絵だけ）と 2 項目を載せ、教育担当の勘を集める。
// 絵だけの見せる順番は参加者ごとの乱数、2 項目の訳はテナントの中だけ、勘の記入の日時は結果より前
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const base = "/api/t/practice/trials";
const PS = ["p1", "p2", "p3", "p4", "p5"];

async function setup(seed: string) {
  const ids: string[] = [];
  for (let i = 1; i <= 8; i++) ids.push(((await (await call("/api/t/practice/cards", json("POST", { card: { ...sampleCard(), rule: `輪 ${i} の決まり` } }))).json()) as { id: string }).id);
  const t = (await (await call(base, json("POST", { participants: PS, seed }))).json()) as { id: string; seed: string };
  expect((await call(`${base}/${t.id}/cards`, json("POST", { cards: ids }))).status).toBe(201);
  return { t, ids };
}

describe("記録アプリの 8 枚と教育担当の勘（059）", () => {
  it("絵だけの順番は参加者ごとの乱数で、同じ種なら同じ。参加者には決まりの文を返さない", async () => {
    const { t, ids } = await setup("059-order");
    const orders: string[][] = [];
    for (const p of PS) {
      const r = (await (await call(`${base}/${t.id}/pictures?participant=${p}`)).json()) as { cards: { id: string; rule?: string; motion: unknown }[] };
      expect(r.cards.map((c) => c.id).sort()).toEqual([...ids].sort());
      expect(r.cards.every((c) => c.rule === undefined && c.motion)).toBe(true);
      expect(r.cards.map((c) => c.id)).toEqual(pictureOrder("059-order", p, ids));
      orders.push(r.cards.map((c) => c.id));
    }
    // 5 人の順番が全部同じにはならない（並べた順のままでもない）
    expect(new Set(orders.map((o) => o.join())).size).toBeGreaterThan(1);
    expect(orders.some((o) => o.join() !== ids.join())).toBe(true);
    // 答えは、その人の順番の次のカードとして記録される（答える側に選ばせない）
    const a1 = (await (await call(`${base}/${t.id}/picture-answers`, json("POST", { participant: "p1", answer: "手袋をはめる" }))).json()) as { card_id: string };
    const a2 = (await (await call(`${base}/${t.id}/picture-answers`, json("POST", { participant: "p1", answer: "線を確かめる" }))).json()) as { card_id: string };
    expect([a1.card_id, a2.card_id]).toEqual(orders[0].slice(0, 2));
    // 送り直し（11/5）: どのカードへの答えかを付けると、済んだカードに 2 つ目を入れず、次のカードの答えにもしない
    const again = (card_id: string) => call(`${base}/${t.id}/picture-answers`, json("POST", { participant: "p1", answer: "送り直し", card_id }));
    expect((await again(a2.card_id)).status).toBe(409);
    expect((await again(orders[0][3])).status).toBe(400);
    expect((await again(orders[0][2])).status).toBe(201);
    const mine = ((await (await call(`${base}/${t.id}/picture-answers`)).json()) as { answers: { participant: string }[] }).answers.filter((a) => a.participant === "p1");
    expect(mine).toHaveLength(3);
  });

  it("勘の記入の日時は、絵だけの答えより前。答えが入り始めたら勘は書けず、カードも変えられない", async () => {
    const { t, ids } = await setup("059-forecast");
    for (const [i, id] of ids.entries()) expect((await call(`${base}/${t.id}/forecasts`, json("POST", { card_id: id, rate: 40 + i * 5 }))).status).toBe(201);
    // 書き直しは追記で、最後の行を使う
    expect((await call(`${base}/${t.id}/forecasts`, json("POST", { card_id: ids[0], rate: 90 }))).status).toBe(201);
    expect((await call(`${base}/${t.id}/forecasts`, json("POST", { card_id: ids[0], rate: 101 }))).status).toBe(400);
    for (const p of PS) for (let k = 0; k < 8; k++) expect((await call(`${base}/${t.id}/picture-answers`, json("POST", { participant: p, answer: `答え ${k}` }))).status).toBe(201);
    expect((await call(`${base}/${t.id}/picture-answers`, json("POST", { participant: "p1", answer: "9 枚目" }))).status).toBe(409);
    expect((await call(`${base}/${t.id}/forecasts`, json("POST", { card_id: ids[1], rate: 10 }))).status).toBe(409);
    expect((await call(`${base}/${t.id}/cards`, json("POST", { cards: ids.slice(0, 2) }))).status).toBe(409);
    const view = (await (await call(`${base}/${t.id}/pictures`)).json()) as { forecasts: { card_id: string; rate: number; created_at: string }[]; answers: number };
    expect(view.answers).toBe(40);
    expect(view.forecasts).toHaveLength(8);
    expect(view.forecasts.find((f) => f.card_id === ids[0])!.rate).toBe(90);
    const answers = ((await (await call(`${base}/${t.id}/picture-answers`)).json()) as { answers: { created_at: string }[] }).answers;
    const lastForecast = view.forecasts.map((f) => f.created_at).sort().at(-1)!;
    const firstAnswer = answers.map((a) => a.created_at).sort()[0];
    expect(lastForecast < firstAnswer || lastForecast === firstAnswer).toBe(true);
    // DB でも書き換えと消すことを断る
    await expect(env.DB.prepare("UPDATE forecasts SET rate = 0 WHERE trial_id = ?").bind(t.id).run()).rejects.toThrow(/append only/);
    await expect(env.DB.prepare("DELETE FROM picture_answers WHERE trial_id = ?").bind(t.id).run()).rejects.toThrow(/append only/);
    expect((await call(`${base}/${t.id}/forecasts`, json("PUT", { card_id: ids[0], rate: 1 }))).status).toBe(405);
  }, 30_000); // 全部を一度に流すと 5 秒を超えることがあるので長めに待つ

  it("2 項目の訳はテナントの中にだけ置き、公開デモには置けない。やめた人の絵の答えも消せる", async () => {
    const { t } = await setup("059-items");
    expect((await call(`${base}/${t.id}/items`, json("POST", { item: "A", ja: "元のページの文", vi: "bản dịch" }))).status).toBe(201);
    const view = (await (await call(`${base}/${t.id}/pictures`)).json()) as { items: { item: string; vi: string }[] };
    expect(view.items).toEqual([{ item: "A", ja: "元のページの文", vi: "bản dịch" }]);
    const demo = (await (await call("/api/t/demo/trials", json("POST", { participants: ["d1"] }))).json()) as { id: string };
    expect((await call(`/api/t/demo/trials/${demo.id}/items`, json("POST", { item: "A", vi: "x" }))).status).toBe(403);
    // ほかのテナントからは見えない
    expect((await call(`/api/t/demo/trials/${t.id}/pictures`)).status).toBe(404);
    await call(`${base}/${t.id}/picture-answers`, json("POST", { participant: "p2", answer: "上の人に聞く" }));
    const er = (await (await call(`${base}/${t.id}/erase`, json("POST", { participant: "p2" }))).json()) as { erased: { pictures: number } };
    expect(er.erased.pictures).toBe(1);
    expect((await call(`${base}/${t.id}/picture-answers`, json("POST", { participant: "p2", answer: "もう一度" }))).status).toBe(409);
  });
});

describe("絵の 8 枚の半分に文を付ける（11/6 朝 作者）", () => {
  it("交差の回では、組 1 は偶数番・組 2 は奇数番のカードに文が付き、どのカードも文つきと絵だけが半分ずつ。答えにも文つきかの印が付く", async () => {
    const ids: string[] = [];
    for (let i = 1; i <= 8; i++) ids.push(((await (await call("/api/t/practice/cards", json("POST", { card: { ...sampleCard(), rule: `文 ${i} の決まり`, words: { ja: `ことば ${i}`, vi: "x" } } }))).json()) as { id: string }).id);
    const people = ["student_V_1", "student_V_2", "student_C_1", "student_C_2"].map((id) => ({ id, group: id.includes("_V_") ? "ベトナム" : "カンボジア" }));
    const t = (await (await call(base, json("POST", { design: "cross", participants: people, seed: "half-words" }))).json()) as { id: string; assignments: { participant: string; set: 1 | 2 }[] };
    expect((await call(`${base}/${t.id}/cards`, json("POST", { cards: ids }))).status).toBe(201);
    const shownTo = new Map<string, number>();
    for (const a of t.assignments) {
      const r = (await (await call(`${base}/${t.id}/pictures?participant=${a.participant}`)).json()) as { cards: { id: string; words?: string }[] };
      const withText = r.cards.filter((c) => c.words).map((c) => ids.indexOf(c.id)).sort();
      expect(withText).toEqual(a.set === 1 ? [0, 2, 4, 6] : [1, 3, 5, 7]);
      for (const c of r.cards) if (c.words) expect(c.words).toBe(`ことば ${ids.indexOf(c.id) + 1}`);
      for (const i of withText) shownTo.set(ids[i], (shownTo.get(ids[i]) ?? 0) + 1);
    }
    // 4 人のうち、どのカードも 2 人が文つきで見る
    expect(ids.map((id) => shownTo.get(id))).toEqual(ids.map(() => 2));
    const a = t.assignments[0];
    await call(`${base}/${t.id}/picture-answers`, json("POST", { participant: a.participant, answer: "こたえ" }));
    const got = (await (await call(`${base}/${t.id}/picture-answers`)).json()) as { answers: { card_id: string; words: boolean }[] };
    expect(got.answers[0].words).toBe(ids.indexOf(got.answers[0].card_id) % 2 === (a.set === 1 ? 0 : 1));
  });

  it("組の無い回（前からの回）は、いつも絵だけ", async () => {
    const { t } = await setup("half-words-order");
    const r = (await (await call(`${base}/${t.id}/pictures?participant=p1`)).json()) as { cards: { words?: string }[] };
    expect(r.cards.every((c) => c.words === undefined)).toBe(true);
  });
});
