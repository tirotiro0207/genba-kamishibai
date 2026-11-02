import { expect, type Page, test } from "@playwright/test";
import { faceText } from "../src/shared/card-face";
import { countChars } from "../src/shared/fold";
import { sampleCard } from "../tests/fixtures/card";

// 折りたたみの画面（081）: 元のページが積み重なってカウンターが上がり、1 枚・0 字にたたまれる。
// カードと元の文の読み込みは差し替える（録画の中身を毎回同じにする）。中身は架空の例で、画面には出ない
const PAGE = ["第 3 章 盤の作業", "1. 作業の前", "盤に触る前に、検電器で", "電気が来ていないか確かめる。", "", "2. 作業の後", "扉を閉めて、表示を外す。"];
const SPEECH = "電気が来ていると感電するから、必ず確かめてください。";
const want = countChars(PAGE.join("")) + countChars(SPEECH);

async function mock(page: Page) {
  await page.route("**/api/t/practice/cards/fold-card", (r) => r.fulfill({ json: { id: "fold-card", status: "signed", version: 1, body: sampleCard() } }));
  await page.route("**/api/t/practice/files/pdf/sample/p003.json", (r) => r.fulfill({ json: { lines: PAGE.map((text) => ({ text })) } }));
  await page.route("**/api/t/practice/extract/in-1", (r) => r.fulfill({ json: { id: "in-1", input: { text: SPEECH } } }));
}

test("ページが積み重なってカウンターが上がり、1 枚・0 字にたたまれる", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("/#/t/practice/fold/fold-card");
  await expect(page.getByTestId("fold")).toHaveAttribute("data-phase", "stack");

  // カウンターは上がるだけで、途中で下がらない
  const seen: number[] = [];
  for (let k = 0; k < 40 && (await page.getByTestId("fold").getAttribute("data-phase")) === "stack"; k++) {
    const c = page.getByTestId("fold-count");
    if (await c.count()) seen.push(Number((await c.innerText()).replace(/,/g, "")));
    await page.waitForTimeout(100);
  }
  expect(seen[0]).toBe(0);
  expect(new Set(seen).size).toBeGreaterThanOrEqual(3);
  for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  expect(seen[seen.length - 1]).toBe(want);

  // たたむと、ページ数・字数 → 1 枚・0 字
  await expect(page.getByTestId("fold")).toHaveAttribute("data-phase", "folded");
  await expect(page.getByTestId("fold-result")).toHaveText(`2 ページ・${want} 字 → 1 枚・0 字`);
  await expect(page.getByTestId("fold-face-chars")).toHaveText("0");
  expect(faceText(await page.getByTestId("fold-card").innerHTML())).toBe("");
  // 画面に元の文の中身は出ない（紙は線だけ）
  const text = await page.getByTestId("fold").innerText();
  expect(text).not.toContain("盤に触る");
  expect(text).not.toContain("感電");
  await page.waitForTimeout(900);
  await page.screenshot({ path: test.info().outputPath("fold.png") });

  // もう一度流せる
  await page.getByTestId("fold-again").click();
  await expect(page.getByTestId("fold")).toHaveAttribute("data-phase", "stack");
  await expect(page.getByTestId("fold")).toHaveAttribute("data-phase", "folded");
  await page.waitForTimeout(900);
  await page.getByTestId("fold-route").click();
  await expect(page.getByTestId("route")).toBeVisible();
});

test.describe("動きを減らす設定", () => {
  test.use({ reducedMotion: "reduce" });
  test("積み終わった数とたたんだあとを、動かさずに出す", async ({ page }) => {
    await mock(page);
    await page.goto("/#/t/practice/fold/fold-card");
    await expect(page.getByTestId("fold")).toHaveAttribute("data-phase", "folded");
    await expect(page.getByTestId("fold-result")).toHaveText(`2 ページ・${want} 字 → 1 枚・0 字`);
    expect(await page.getByTestId("fold-sheet").count()).toBe(2);
  });
});
