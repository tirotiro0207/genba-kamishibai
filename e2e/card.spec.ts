import { expect, test } from "@playwright/test";
import { faceText } from "../src/shared/card-face";
import { sampleCard } from "../tests/fixtures/card";

// カードの画面（037）。カードの読み込みは差し替える（録画の中身を毎回同じにする）
function view(status: string, ai: boolean) {
  const body = sampleCard();
  if (ai) body.statements[1].ai = true;
  body.words = { ja: "ばんに さわる まえに けんでんきで たしかめます。", vi: "Trước khi chạm vào tủ điện, hãy kiểm tra bằng bút thử điện." };
  return { id: `card-${status}`, status, version: 1, body };
}

test("コマを 1 つずつ送り、絵の面は 0 字、タップで文が出る。AI 下書きの帯が出る", async ({ page }) => {
  await page.route("**/api/t/practice/cards/card-*", (route) => {
    const status = route.request().url().split("card-").pop()!;
    return route.fulfill({ json: view(status, status === "ai_draft") });
  });

  await page.goto("/#/t/practice/card/card-ai_draft");
  await expect(page.getByTestId("card-band")).toContainText("AI 下書き");
  await expect(page.getByTestId("card-band")).toContainText("元の文に無い理由");
  const face = page.getByTestId("card-face");
  const dots = page.getByTestId("card-dots").locator("li");
  const n = await dots.count();
  expect(n).toBeGreaterThanOrEqual(3);
  expect(n).toBeLessThanOrEqual(4);

  // 1 コマずつ送る。どのコマも絵の面は文字 0 字
  for (let j = 0; j < n; j++) {
    await expect(face).toHaveAttribute("data-frame", String(j));
    expect(faceText(await face.innerHTML())).toBe("");
    await page.waitForTimeout(700);
    if (j < n - 1) await page.getByTestId("card-next").click();
  }
  await expect(page.getByTestId("card-next")).toBeDisabled();
  await page.keyboard.press("ArrowLeft");
  await expect(face).toHaveAttribute("data-frame", String(n - 2));

  // 絵をタップすると、守ること・なぜ・言葉が出る
  await expect(page.getByTestId("card-text")).toHaveCount(0);
  await face.click();
  await expect(page.getByTestId("card-text")).toContainText("盤に触る前に");
  await expect(page.getByTestId("card-text")).toContainText("感電する");
  await expect(page.getByTestId("card-words")).toContainText("tủ điện");
  await page.waitForTimeout(1000);

  // 署名の前の下書きは「未承認の下書き」、署名済みは帯なし
  await page.goto("/#/t/practice/card/card-draft");
  await expect(page.getByTestId("card-band")).toContainText("未承認の下書き");
  await page.waitForTimeout(600);
  await page.goto("/#/t/practice/card/card-signed");
  await expect(page.getByTestId("card")).toHaveAttribute("data-status", "signed");
  await expect(page.getByTestId("card-band")).toHaveCount(0);
});
