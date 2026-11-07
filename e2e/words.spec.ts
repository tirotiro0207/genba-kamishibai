import { expect, test } from "@playwright/test";
import { freshTenant, login, sql } from "./helpers/ok";

// 会社の言葉の画面（11/7）: 監修者のホームに入口が出て、覚えた言葉の一覧を見て、まちがいを 1 行消せる。作者のホームには入口が出ない

test("監修者はホームから会社の言葉を開き、1 行を消すと一覧から消える。作者のホームには入口が無い", async ({ page, request }) => {
  const T = freshTenant("x032", "会社の言葉の確認");
  sql(
    `INSERT INTO company_words (tenant_id, kind, phrase, prefer, source, hits) VALUES ` +
      `('${T}', 'call', '主幹', 'aptomat tổng', 'glossary', 1), ('${T}', 'rephrase', 'ブレーカー', '主幹', 'edit', 2), ('${T}', 'avoid', '絶対に', '', 'edit', 1)`,
  );
  const enter = async (role: string) => {
    const token = await login(request, T, role, 1);
    await page.addInitScript(([t, tok, r]) => {
      sessionStorage.setItem(`role:${t}`, tok);
      localStorage.setItem(`avatar:${t}:${r}`, "{}");
    }, [T, token, role]);
  };

  await enter("author");
  await page.goto(`/#/t/${T}/home`);
  await expect(page.getByTestId("home-go-queue")).toBeVisible();
  await expect(page.getByTestId("home-go-words")).toHaveCount(0);

  const sup = await page.context().newPage();
  const token = await login(request, T, "supervisor", 1);
  await sup.addInitScript(([t, tok]) => {
    sessionStorage.setItem(`role:${t}`, tok);
    localStorage.setItem(`avatar:${t}:supervisor`, "{}");
  }, [T, token]);
  await sup.goto(`/#/t/${T}/home`);
  await sup.getByTestId("home-go-words").click();
  await expect(sup.getByTestId("words")).toBeVisible();
  await expect(sup.getByTestId("words-row")).toHaveCount(3);
  await expect(sup.getByTestId("words-rephrase")).toContainText("ブレーカー → 主幹");

  // 1 回目で確かめが出て、2 回目で消える。消した行だけが一覧から無くなる
  const row = sup.getByTestId("words-avoid").getByTestId("words-row");
  await row.getByTestId("words-remove").click();
  await row.getByTestId("words-remove-yes").click();
  await expect(sup.getByTestId("words-row")).toHaveCount(2);
  await expect(sup.getByTestId("words-avoid")).toHaveCount(0);
  await expect(sup.getByTestId("words")).toContainText("ブレーカー → 主幹");
  await sup.waitForTimeout(800);
});
