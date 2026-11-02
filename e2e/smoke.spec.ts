import { expect, test } from "@playwright/test";

test("画面が開き、録画が残る", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByTestId("app")).toBeAttached();
  await page.waitForTimeout(500);
  expect(info.project.use.video).toBeTruthy();
});
