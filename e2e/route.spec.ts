import { expect, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";

// 経路の画面（053）。カードと元の文の読み込みは差し替える（録画の中身を毎回同じにする）。中身は架空の例
const PAGE = ["第 3 章 盤の作業", "1. 作業の前", "", "", "", "", "", "", "", "", "", "盤に触る前に、検電器で", "電気が来ていないか確かめる。", "2. 作業の後", "", ""];
const SPEECH = "電気が来ていると感電するから、必ず確かめてください。";

test("絵の部品をタップすると元の文の該当箇所が光り、なぜそう描いたかが出る。全部品を順にタップできる", async ({ page }) => {
  const body = sampleCard();
  // 3 つ目の部品は、なぜの文（話した言葉から）につなぐ
  body.parts[2].statement = "s2";
  await page.route("**/api/t/practice/cards/route-card", (r) => r.fulfill({ json: { id: "route-card", status: "pending", version: 1, body } }));
  await page.route("**/api/t/practice/files/pdf/sample/p003.json", (r) => r.fulfill({ json: { lines: PAGE.map((text) => ({ text })) } }));
  await page.route("**/api/t/practice/extract/in-1", (r) => r.fulfill({ json: { id: "in-1", input: { text: SPEECH } } }));

  await page.goto("/#/t/practice/route/route-card");
  await expect(page.getByTestId("route")).toBeVisible();
  await expect(page.getByTestId("route-detail")).toContainText("タップすると");

  // 絵の上の部品を、1 つずつタップする
  const n = body.parts.length;
  for (let i = 0; i < n; i++) {
    const p = body.parts[i];
    // 人の箱は手の小物と重なるので、頭のあたりを押す
    const hit = page.getByTestId(`hit-${p.id}`);
    if (p.target.type === "figure") {
      const bb = (await hit.boundingBox())!;
      await hit.click({ position: { x: bb.width / 2, y: 12 } });
    } else await hit.click();
    await expect(page.getByTestId("route-detail")).toHaveAttribute("data-part", p.id);
    await expect(page.getByTestId(`hit-${p.id}`)).toHaveClass(/on/);
    await expect(page.getByTestId("route-reason")).toContainText(p.reason);
    const lit = page.getByTestId("route-sources").locator("[data-lit]");
    if (p.statement === "s1") {
      // 資料の 3 ページ 12〜13 行が光る
      await expect(page.getByTestId("route-stmt")).toContainText("盤に触る前に");
      await expect(page.getByTestId("route-sources")).toContainText("sample 3 ページ 12〜13 行");
      await expect(lit).toHaveCount(2);
      await expect(lit.first()).toHaveText("盤に触る前に、検電器で");
      await expect(lit.last()).toHaveText("電気が来ていないか確かめる。");
    } else {
      // 話した言葉の 1〜18 字が光る
      await expect(page.getByTestId("route-stmt")).toContainText("感電する");
      await expect(lit).toHaveCount(1);
      await expect(lit).toHaveText(SPEECH.slice(0, 18));
    }
    await page.waitForTimeout(600);
  }

  // 一覧から、全部品を順に選び直せる（つぎの部品）
  await page.getByTestId(`part-${body.parts[0].id}`).click();
  for (let i = 1; i < n; i++) {
    await page.getByTestId("route-next-part").click();
    await expect(page.getByTestId("route-detail")).toHaveAttribute("data-part", body.parts[i].id);
  }
  await expect(page.getByTestId("route-next-part")).toHaveCount(0);

  // ほかのコマでも部品をタップできる
  await page.getByTestId("route-frame-2").click();
  await expect(page.getByTestId("route-face")).toHaveAttribute("data-frame", "2");
  await page.getByTestId("hit-p2").click();
  await expect(page.getByTestId("route-reason")).toContainText("検電器を当てる");
  await page.screenshot({ path: test.info().outputPath("route.png"), fullPage: true });

  // スマホの幅でも、絵と元の文が縦に並んでタップできる
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("hit-p3").click();
  await expect(page.getByTestId("route-sources").locator("[data-lit]")).toHaveText(SPEECH.slice(0, 18));
  await page.screenshot({ path: test.info().outputPath("route-phone.png"), fullPage: true });
});

test("カードの画面から経路の画面を開ける", async ({ page }) => {
  await page.route("**/api/t/practice/cards/route-card", (r) => r.fulfill({ json: { id: "route-card", status: "pending", version: 1, body: sampleCard() } }));
  await page.goto("/#/t/practice/card/route-card");
  await page.getByTestId("card-show").click();
  await page.getByTestId("card-route").click();
  await expect(page.getByTestId("route")).toHaveAttribute("data-card", "route-card");
});
