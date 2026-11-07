import { expect, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";

// 監査の記録の画面（041）: 監修者か教育担当の役で入り、1 枚の記録を ①〜⑤ の順に追う
// 連鎖の確かめはテナントの記録を全部読むので、画面は「確かめ中…」を経てから結果を出す。手元の D1 の記録が多いと 5 秒を超えるので長めに待つ
test("監修者の役で入り、1 枚の記録を順に追う", async ({ page, request }) => {
  const res = await request.post("/api/t/practice/cards", { data: { card: sampleCard() } });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  await request.post(`/api/t/practice/cards/${id}/status`, { data: { to: "pending" } });

  await page.goto(`/#/t/practice/audit/${id}`);
  await page.getByTestId("audit-as-supervisor-2").click();
  await expect(page.getByTestId("audit-chain")).toContainText("書き換え・消した跡は無い", { timeout: 15_000 });
  for (const s of [1, 2, 3, 4, 5]) await expect(page.getByTestId(`audit-step-${s}`)).toBeVisible();
  await expect(page.locator(".audit-row").first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("audit.png"), fullPage: true });

  // 教育担当でも開ける
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByTestId("audit-as-trainer-1").click();
  await expect(page.getByTestId("audit-chain")).toContainText("書き換え・消した跡は無い", { timeout: 15_000 });
  for (const s of [1, 2, 3, 4, 5]) await expect(page.getByTestId(`audit-step-${s}`)).toBeVisible();
  await expect(page.locator(".audit-row").first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("audit-trainer.png"), fullPage: true });
});
