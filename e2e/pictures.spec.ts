import { expect, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";

// 絵だけの 8 枚と教育担当の勘（059）: 教育担当が 8 枚を選んで勘を書き、参加者が絵だけを見て答える。答えが始まると勘は締め切り。
// 記入の日時が答えより前であることも画面の外（API）で確かめる。録画の絵は仮（※取り直しの対象）。API（Claude）は呼ばない

test("教育担当が 8 枚に勘を書き、参加者が絵だけで答えると、勘は締め切りになる", async ({ page, request }) => {
  test.setTimeout(90_000);
  for (let i = 1; i <= 8; i++) expect((await request.post("/api/t/practice/cards", { data: { card: { ...sampleCard(), rule: `059 の輪 ${i} の決まり` } } })).status()).toBe(201);
  const t = (await (await request.post("/api/t/practice/trials", { data: { participants: ["p1", "p2"], seed: `059-${Date.now()}` } })).json()) as { id: string };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/t/practice/trial/${t.id}/forecast`);
  await expect(page.getByTestId("pic-choose")).toBeVisible();
  const boxes = page.getByTestId("pic-choose").locator("li", { hasText: "059 の輪" }).getByTestId("pic-choose-card");
  for (let i = 0; i < 8; i++) await boxes.nth(i).check();
  await page.getByTestId("pic-choose-save").click();

  await expect(page.getByTestId("forecast-card")).toHaveCount(8);
  const rates = page.getByTestId("forecast-rate");
  for (let i = 0; i < 8; i++) await rates.nth(i).fill(String(30 + i * 5));
  await page.waitForTimeout(800);
  await page.getByTestId("forecast-save").click();
  await expect(page.getByTestId("forecast-at")).toHaveCount(8);
  await expect(page.getByTestId("forecast-count")).toContainText("書いた 8 / 8 枚");
  await page.waitForTimeout(1200);

  // 参加者は絵だけを見て答える（決まりの文は出ない）
  await page.goto(`/#/t/practice/trial/${t.id}/pictures/p1`);
  await expect(page.getByTestId("pic-answer")).toBeVisible();
  await expect(page.getByTestId("read-frames")).toBeVisible();
  await expect(page.getByTestId("pic-answer")).not.toContainText("059 の輪");
  const first = await page.getByTestId("pic-answer").getAttribute("data-card");
  await page.getByTestId("pic-text-ja").fill("手袋をはめてから触る");
  await page.waitForTimeout(800);
  await page.getByTestId("pic-submit").click();
  await expect(page.getByTestId("pic-answer")).not.toHaveAttribute("data-card", first!);
  await expect(page.getByTestId("pic-answer")).toContainText("2 / 8 枚");
  await page.waitForTimeout(1000);

  // 答えが始まったので、勘は締め切り
  await page.goto(`/#/t/practice/trial/${t.id}/forecast`);
  await expect(page.getByTestId("forecast")).toHaveAttribute("data-locked", "true");
  await expect(page.getByTestId("forecast-save")).toHaveCount(0);
  await expect(page.getByTestId("forecast-count")).toContainText("答えが始まったので締め切り");
  await page.waitForTimeout(1500);

  const view = (await (await request.get(`/api/t/practice/trials/${t.id}/pictures`)).json()) as { forecasts: { created_at: string }[] };
  const answers = ((await (await request.get(`/api/t/practice/trials/${t.id}/picture-answers`)).json()) as { answers: { created_at: string }[] }).answers;
  expect(view.forecasts.map((f) => f.created_at).sort().at(-1)! < answers[0].created_at).toBe(true);
});
