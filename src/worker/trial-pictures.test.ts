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
  });

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
