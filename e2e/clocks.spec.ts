import { type APIRequestContext, expect, test } from "@playwright/test";
import type { Shown } from "../src/shared/clocks";

// 時計 2 つ（095）: ① 分かるまでの時間を、カードと文の 2 つの時計に並べる。2 つの針は同時に動き始め、それぞれ中央値の秒で止まる。
// 本物の結果は現場の確認の日のあと。ここでは仮の数字（回が sample・交差の回で答えが 0 件）と、練習用の回に入れた試しの答えで確かめる

test("時計 2 つ: 仮の数字で、カードの針が先に止まり、文の針があとで止まる", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/#/t/practice/trial/sample/clocks");
  await expect(page.getByTestId("clocks")).toHaveAttribute("data-fake", "true");
  await expect(page.getByTestId("clocks-fake")).toBeVisible();
  const card = page.getByTestId("clock-card");
  const text = page.getByTestId("clock-text");
  await expect(card).toHaveAttribute("data-done", "true", { timeout: 10_000 });
  // カードが止まった時点で、文はまだ動いている
  await expect(text).toHaveAttribute("data-done", "false");
  await expect(card).toContainText("4.2 秒");
  await expect(text).toHaveAttribute("data-done", "true", { timeout: 20_000 });
  await expect(text).toContainText("13.8 秒");
  await page.waitForTimeout(1500);
});

test("時計 2 つ: 回の ① の答えから中央値を出す", async ({ page, request }) => {
  const t = await request.post("/api/t/practice/trials", { data: { participants: ["p1", "p2", "p3"], seed: `095-${Date.now()}` } });
  expect(t.status()).toBe(201);
  const trial = (await t.json()) as { id: string; assignments: { participant: string; A: ["card" | "text", "card" | "text"] }[] };
  // 1 人 2 回ずつ（カードと文を 1 回ずつ）。カードは 2・3・4 秒、文は 9・10・11 秒
  const ms = { card: [2000, 3000, 4000], text: [9000, 10000, 11000] };
  for (const [i, a] of trial.assignments.entries())
    for (const shown of a.A) expect((await request.post(`/api/t/practice/trials/${trial.id}/responses`, { data: { participant: a.participant, item: "A", ms: ms[shown][i] } })).status()).toBe(201);
  await page.goto(`/#/t/practice/trial/${trial.id}/clocks`);
  await expect(page.getByTestId("clocks")).toHaveAttribute("data-fake", "false");
  await expect(page.getByTestId("clock-card")).toHaveAttribute("data-ms", "3000");
  await expect(page.getByTestId("clock-text")).toHaveAttribute("data-ms", "10000");
  await expect(page.getByTestId("clock-text")).toHaveAttribute("data-done", "true", { timeout: 15_000 });
  await expect(page.getByTestId("clocks")).toContainText("カード 3 人・文 3 人");
  await expect(page.getByTestId("clocks-fake")).toHaveCount(0);
});

// 試しの交差の回を作る（練習のテナント）。返る割り当てに、項目ごとに見せるもの（card か text）が入っている
type Cross = { id: string; assignments: { participant: string; A: Shown[]; B: Shown[] }[] };
async function crossTrial(request: APIRequestContext, people: string[]) {
  const t = await request.post("/api/t/practice/trials", { data: { design: "cross", participants: people.map((id) => ({ id, group: "ベトナム" })) } });
  expect(t.status()).toBe(201);
  return (await t.json()) as Cross;
}

test("時計 2 つ: 交差の回の答えが 0 件なら、仮の数字を出す", async ({ page, request }) => {
  const trial = await crossTrial(request, ["e1", "e2"]);
  await page.goto(`/#/t/practice/trial/${trial.id}/clocks`);
  await expect(page.getByTestId("clocks")).toHaveAttribute("data-fake", "true");
  await expect(page.getByTestId("clocks-fake")).toContainText("仮の数字");
  await expect(page.getByTestId("clock-card")).toHaveAttribute("data-ms", "4200");
});

test("時計 2 つ: 交差の回は /summary の中央値で、項目 A・B の 2 行を出す", async ({ page, request }) => {
  test.setTimeout(60_000);
  const trial = await crossTrial(request, ["c1", "c2", "c3", "c4"]);
  // 項目ごと・見せ方ごとに同じ秒を入れる（A はカード 2 秒・文 8 秒、B はカード 3 秒・文 12 秒）
  const ms = { A: { card: 2000, text: 8000 }, B: { card: 3000, text: 12000 } };
  for (const a of trial.assignments)
    for (const item of ["A", "B"] as const)
      expect((await request.post(`/api/t/practice/trials/${trial.id}/responses`, { data: { participant: a.participant, item, ms: ms[item][a[item][0]] } })).status()).toBe(201);
  await page.goto(`/#/t/practice/trial/${trial.id}/clocks`);
  await expect(page.getByTestId("clocks")).toHaveAttribute("data-fake", "false");
  await expect(page.getByTestId("clocks-fake")).toHaveCount(0);
  await expect(page.getByTestId("clock-A-card")).toHaveAttribute("data-ms", "2000");
  await expect(page.getByTestId("clock-A-text")).toHaveAttribute("data-ms", "8000");
  await expect(page.getByTestId("clock-B-card")).toHaveAttribute("data-ms", "3000");
  await expect(page.getByTestId("clock-B-text")).toHaveAttribute("data-ms", "12000");
  await expect(page.getByTestId("clocks-item-A")).toContainText("カード 2 人・文 2 人");
  await expect(page.getByTestId("clock-B-text")).toHaveAttribute("data-done", "true", { timeout: 20_000 });
  // 国籍ごとの数はこの画面に出さない
  await expect(page.getByTestId("clocks")).not.toContainText("ベトナム");
});
