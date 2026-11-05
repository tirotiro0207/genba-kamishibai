import { expect, test } from "@playwright/test";

// 見る人が答える公開デモ（094）: 入口から「時間を計って答える」「絵だけで答える」を選び、答えると決まりの文が出て、新入社員の匿名の結果と並ぶ。
// 新入社員の結果は本物の前なので作りものの数（画面にそう出る）。見る人の答えはどこにも送らない（GET のほかの呼び出しが無い）。API は呼ばない。
// 録画の絵は仮（※取り直しの対象）

test("時間を計って答えると、あなたの秒が新入社員のカードと文の秒と並ぶ", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => r.url().includes("/api/") && r.method() !== "GET" && sent.push(`${r.method()} ${r.url()}`));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/demo");
  await page.getByTestId("demo-try-time").click();
  await expect(page.getByTestId("try")).toHaveAttribute("data-mode", "time");
  await page.getByTestId("try-begin").click();
  await expect(page.getByTestId("read-frames")).toBeVisible();
  await page.waitForTimeout(2500);
  await page.getByTestId("try-stop").click();
  const rank = page.getByTestId("try-rank").locator("li");
  await expect(rank).toHaveCount(3);
  // 2.5 秒ほどで止めたので、作りものの新入社員（カード 4.2 秒・文 13.8 秒）より速い
  await expect(rank.first()).toHaveAttribute("data-who", "you");
  await expect(page.getByTestId("try-rule")).toBeVisible();
  await expect(page.getByTestId("try-fake")).toBeVisible();
  await expect(page.getByTestId("try-fake")).toContainText("仮の数字");
  await page.waitForTimeout(1500);
  expect(sent).toEqual([]);
});

test("絵だけで答えると、決まりの文が出て、合っていたかを付けると新入社員の正答率と並ぶ", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => r.url().includes("/api/") && r.method() !== "GET" && sent.push(`${r.method()} ${r.url()}`));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/demo");
  await page.getByTestId("demo-try-picture").click();
  await expect(page.getByTestId("try")).toHaveAttribute("data-mode", "picture");
  await expect(page.getByTestId("read-frames")).toBeVisible();
  // 答える前は決まりの文を出さない
  await expect(page.getByTestId("try-rule")).toHaveCount(0);
  await page.getByTestId("try-answer").fill("作業の前に道具を確かめる");
  await page.getByTestId("try-submit").click();
  await expect(page.getByTestId("try-rule")).toBeVisible();
  await page.waitForTimeout(1000);
  await page.getByTestId("try-right").click();
  await expect(page.getByTestId("try-compare")).toContainText("80%");
  await expect(page.getByTestId("try-fake")).toBeVisible();
  await expect(page.getByTestId("try-fake")).toContainText("仮の数字");
  // 国籍ごとの数は 2 人以上のまとまりだけ（「(1 人)」は出ない）
  const groups = await page.getByTestId("try-groups").locator("li").allTextContents();
  expect(groups.length).toBeGreaterThan(0);
  for (const t of groups) expect(t).not.toMatch(/（1 人）/);
  await page.waitForTimeout(1500);
  expect(sent).toEqual([]);
});
