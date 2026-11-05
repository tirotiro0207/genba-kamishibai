import { expect, test } from "@playwright/test";
import { SCRIPT, sampleCard } from "../tests/fixtures/card";
import { freshTenant, login } from "./helpers/ok";

// 脚本なしの印（11/6）: 脚本（11/5〜）を書かずに作った前の作り方のカードには、確認待ちの一覧とカードの画面に「脚本なし」の印が出る。
// 脚本の有るカードには出ない。本物の Claude API は呼ばない（カードはテスト用の本文を API で足す）

test("脚本の無いカードには、確認待ちの一覧とカードの画面に「脚本なし」の印が出る", async ({ page, request }) => {
  test.setTimeout(180_000);
  const T = freshTenant("scr", "脚本なしの印の確認");
  const make = async (rule: string, script?: unknown) => {
    const res = await request.post(`/api/t/${T}/cards`, { data: { card: { ...sampleCard(), rule, ...(script ? { script } : {}) } } });
    expect(res.status()).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };
  const old = await make("前の作り方のカード（脚本なし）");
  const fresh = await make("新しい作り方のカード（脚本あり）", SCRIPT);

  const token = await login(request, T, "supervisor", 1);
  await page.goto("/");
  await page.evaluate(([t, tok]) => sessionStorage.setItem(`role:${t}`, tok), [T, token]);
  await page.goto(`/#/t/${T}/queue`);

  // 1. 一覧: 脚本の無い行にだけ印が出て、title に理由がある
  const items = page.getByTestId("queue-item");
  await expect(items).toHaveCount(2);
  const oldRow = items.filter({ hasText: "前の作り方のカード" });
  const freshRow = items.filter({ hasText: "新しい作り方のカード" });
  await expect(oldRow.getByTestId("queue-noscript")).toHaveText("脚本なし");
  await expect(oldRow.getByTestId("queue-noscript")).toHaveAttribute("title", "11/5 より前の作り方。見せ場・山場の脚本が無い");
  await expect(freshRow.getByTestId("queue-noscript")).toHaveCount(0);
  await page.waitForTimeout(1000);

  // 2. カードの画面: 脚本の無いカードには 1 行が出る
  await page.goto(`/#/t/${T}/card/${old}`);
  await expect(page.getByTestId("card")).toBeVisible();
  await expect(page.getByTestId("card-noscript")).toContainText("脚本なし（11/5 より前の作り方）");
  await page.waitForTimeout(1000);

  // 3. 脚本の有るカードには出ない
  await page.goto(`/#/t/${T}/card/${fresh}`);
  await expect(page.getByTestId("card")).toHaveAttribute("data-card", fresh);
  await expect(page.getByTestId("card-noscript")).toHaveCount(0);
  await page.waitForTimeout(1000);
});
