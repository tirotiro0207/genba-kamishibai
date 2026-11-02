import { expect, test } from "@playwright/test";

test("姿勢の一覧のページで主な姿勢が見られる", async ({ page }, info) => {
  await page.goto("/#/picto/poses");
  for (const name of ["stand", "point", "squat", "raise_hand", "walk", "fall", "report", "hands"]) {
    for (const facing of ["right", "left"]) await expect(page.getByTestId(`pose-${name}-${facing}`).locator("svg")).toBeVisible();
  }
  for (const id of ["gaze-down", "distance-far", "distance-near", "emph-thick", "emph-large", "emph-dark", "emph-frame", "zoom-hands"]) await expect(page.getByTestId(`staging-${id}`).locator("svg")).toBeVisible();
  await page.screenshot({ path: info.outputPath("poses.png"), fullPage: true });
});
