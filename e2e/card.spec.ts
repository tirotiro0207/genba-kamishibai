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
  // 言葉はやさしい日本語だけ（11/5 作者）。データに vi があっても出さない
  await expect(page.getByTestId("card-words")).toContainText("けんでんきで");
  await expect(page.getByTestId("card-words")).not.toContainText("tủ điện");
  await page.waitForTimeout(1000);

  // 署名の前の下書きは「未承認の下書き」、署名済みは帯なし
  await page.goto("/#/t/practice/card/card-draft");
  await expect(page.getByTestId("card-band")).toContainText("未承認の下書き");
  await page.waitForTimeout(600);
  await page.goto("/#/t/practice/card/card-signed");
  await expect(page.getByTestId("card")).toHaveAttribute("data-status", "signed");
  await expect(page.getByTestId("card-band")).toHaveCount(0);
});

test("絵の上にやさしい日本語・決まり・なぜが出て、文を直して保存でき、4 コマ（横 1 列）でも見られる（11/6 作者）", async ({ page }) => {
  let saved: { card: { rule: string; why: string; words?: { ja: string; vi: string }; statements: { field: string; text: string }[] }; reason: string } | null = null;
  await page.route("**/api/t/practice/cards/card-*", (route) => {
    if (route.request().method() === "PUT") {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: { ...view("draft", false), version: 2, body: saved!.card } });
    }
    const v = view("pending", false);
    return route.fulfill({ json: saved ? { ...v, status: "draft", version: 2, body: saved.card } : v });
  });
  await page.route("**/api/t/practice/cards/card-*/exemplars", (route) => route.fulfill({ json: { used: [] } }));

  await page.goto("/#/t/practice/card/card-pending");
  const lead = page.getByTestId("card-lead");
  await expect(page.getByTestId("card-lead-words")).toContainText("けんでんきで");
  await expect(page.getByTestId("card-lead-rule")).toContainText("盤に触る前に");
  await expect(page.getByTestId("card-lead-why")).toContainText("感電する");
  // 絵より上にある
  const top = async (id: string) => (await page.getByTestId(id).boundingBox())!.y;
  expect(await top("card-lead")).toBeLessThan(await top("card-face"));

  // 4 コマ（横 1 列）に切り替える
  await page.getByTestId("card-layout-strip").click();
  const frames = page.getByTestId("card-strip").locator(".read-frame");
  expect(await frames.count()).toBeGreaterThanOrEqual(3);
  const ys = await frames.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().y)));
  expect(new Set(ys).size).toBe(1);
  await expect(page.getByTestId("card-nav")).toHaveCount(0);
  await page.waitForTimeout(800);

  // 文を直して保存する
  await page.getByTestId("card-lead-edit").click();
  await page.getByTestId("card-lead-input-why").fill("手で触ると感電するおそれがあるから");
  await page.getByTestId("card-lead-input-words").fill("さわる まえに たしかめます。");
  await page.waitForTimeout(600);
  await page.getByTestId("card-lead-save").click();
  await expect(page.getByTestId("card-lead-why")).toHaveText("手で触ると感電するおそれがあるから");
  expect(saved!.reason).toContain("なぜ");
  expect(saved!.card.why).toBe("手で触ると感電するおそれがあるから");
  expect(saved!.card.statements.filter((s) => s.field === "why").map((s) => s.text)).toEqual(["手で触ると感電するおそれがあるから"]);
  expect(saved!.card.words?.vi).toContain("tủ điện");
  await expect(lead).toBeVisible();
  await page.waitForTimeout(800);
});
