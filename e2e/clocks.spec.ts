import { expect, test } from "@playwright/test";

// 時計 2 つ（095）: ① 分かるまでの時間を、カードと文の 2 つの時計に並べる。2 つの針は同時に動き始め、それぞれ中央値の秒で止まる。
// 本物の結果は現場の確認の日のあと。ここでは作りものの数（回が sample）と、練習用の回に入れた作りものの答えで確かめる。API は呼ばない

test("時計 2 つ: 作りものの数で、カードの針が先に止まり、文の針があとで止まる", async ({ page }) => {
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
});
