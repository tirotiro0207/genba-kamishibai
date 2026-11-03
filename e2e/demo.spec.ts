import { expect, test } from "@playwright/test";

// 公開デモの入口（093b）の録画。DEMO_URL を渡すと本番の公開 URL で撮る（無ければ手元）。
// DEMO_LIVE=1 のときだけ「その場で作る」を本当に押す（Claude を呼ぶので 1 回 0.1 USD ほどかかり、IP ごとの 1 日 3 回のうち 1 回を使う）
const BASE = process.env.DEMO_URL;
const LIVE = process.env.DEMO_LIVE === "1";

test("入口から完成品を見て、その場で 1 枚作る", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto(BASE ? `${BASE}/` : "/");
  await expect(page.getByTestId("demo")).toBeVisible();
  await page.waitForTimeout(1500);

  // 完成品を見る: 署名済みのカードの閲覧
  await page.getByTestId("demo-view").click();
  await expect(page.locator(".read")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(4000);
  await page.goBack();
  await expect(page.getByTestId("demo")).toBeVisible();

  // その場で作る
  await page.getByTestId("demo-make-open").click();
  await expect(page.getByTestId("demo-text")).toBeVisible();
  await page.waitForTimeout(1500);
  if (!LIVE) return;
  await page.getByTestId("demo-make").click();
  await expect(page.getByTestId("demo-made")).toBeVisible({ timeout: 200_000 });
  await page.waitForTimeout(1000);
  await page.getByTestId("demo-made").click();
  await expect(page.getByTestId("app")).toBeVisible();
  await page.waitForTimeout(5000);
});
