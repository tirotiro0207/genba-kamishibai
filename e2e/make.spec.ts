import { expect, test } from "@playwright/test";

// 入れる画面（032）と抜き出しの画面（033）。取り出しの呼び出しは差し替える（録画で API のクレジットを使わない）
const RULES = [
  { kind: "do", text: "盤に触る前に、検電器で電気が来ていないか確かめる", from: { quote: "盤に触る前に、検電器で電気が来ていないか確かめる", line: 1, line_end: 1, found: true }, where: { page: null, line: 1 }, reasons: [{ text: "感電する", from: { quote: "感電するから", line: 2, line_end: 2, found: true }, stated: true, where: { page: null, line: 2 } }], checklist: false, reworded: false },
  { kind: "do", text: "使う前に点検表の項目を 1 つずつ確かめる", from: { quote: "使う前に点検表で確かめる", line: 3, line_end: 3, found: true }, where: { page: null, line: 3 }, reasons: [], checklist: true, reworded: false },
];

test("話した言葉を入れ、送る前に文字を確かめ、取り出した決まりを「どこから」を見て OK する", async ({ page, request }) => {
  let sent: { text: string; source: { kind: string } } | null = null;
  await page.route("**/api/t/practice/extract", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: "00000000-test", rules: RULES } });
  });
  await page.route("**/api/t/practice/extract/00000000-test/ok", (route) => route.fulfill({ status: 201, json: { ok: JSON.parse(route.request().postData() ?? "{}").items } }));

  await page.goto("/#/t/practice/make");
  await expect(page.getByTestId("make-input")).toBeVisible();
  // 端末の音声入力で文字になったものが入る大きな欄
  await page.getByTestId("speech").fill("盤に触る前に、検電器で電気が来ていないか確かめる。\n感電するから。\n使う前に点検表で確かめる。");
  await page.waitForTimeout(400);
  await page.getByTestId("to-confirm").click();
  await expect(page.getByTestId("confirm-text").locator("li")).toHaveCount(3);
  await page.waitForTimeout(600);
  // 直してから送る
  await page.getByTestId("back").click();
  await page.getByTestId("speech").fill("盤に触る前に、検電器で電気が来ていないか確かめる。\n感電するから。\n使う前に点検表で確かめる。\n");
  await page.getByTestId("to-confirm").click();
  await page.getByTestId("send").click();
  await expect(page.getByTestId("make-review")).toBeVisible();
  expect(sent!.source.kind).toBe("speech");

  await page.getByTestId("from-0").click();
  await expect(page.getByTestId("source").locator("li[data-lit]")).toHaveText(["盤に触る前に、検電器で電気が来ていないか確かめる。"]);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("rule-1")).toContainText("手元の✓");
  await expect(page.getByTestId("save-ok")).toBeDisabled();
  await page.getByTestId("ok-0").check();
  await page.getByTestId("ok-1").check();
  await page.waitForTimeout(400);
  await page.getByTestId("save-ok").click();
  await expect(page.getByTestId("make-done")).toContainText("2 項目");
});

test("資料はページを選んで入れ、送る前に行番号付きで確かめる", async ({ page, request }) => {
  const lines = (n: number) => ({ page: n, source: "text", lines: [1, 2].map((i) => ({ n: i, text: `${n} ページの ${i} 行目`, box: [0.1, 0.1 * i, 0.5, 0.03] })) });
  await request.put("/api/t/practice/files/pdf/sample/index.json", { data: { doc: "sample", pages: [] } });
  for (const p of [3, 4]) await request.put(`/api/t/practice/files/pdf/sample/p00${p}.json`, { data: lines(p) });
  let sent: { source: { kind: string; pages: unknown } } | null = null;
  await page.route("**/api/t/practice/extract", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: "00000000-test", rules: [{ ...RULES[0], where: { page: 4, line: 1 }, from: { ...RULES[0].from, line: 3, line_end: 3 } }] } });
  });
  await page.goto("/#/t/practice/make");
  await page.getByTestId("mode-doc").click();
  await page.getByTestId("doc").selectOption("sample");
  await page.getByTestId("pages").fill("3-4");
  await page.getByTestId("to-confirm").click();
  await expect(page.getByTestId("confirm-text").locator("li")).toHaveCount(4);
  await page.waitForTimeout(600);
  await page.getByTestId("send").click();
  await expect(page.getByTestId("from-0")).toContainText("4 ページ 1 行");
  expect(sent!.source).toEqual({ kind: "doc", doc: "sample", pages: [{ page: 3, lines: 2 }, { page: 4, lines: 2 }] });
});

test("資料を添付する: 文字のファイルは欄に入り、PDF は置き場に入る", async ({ page, request }) => {
  await page.goto("/#/t/practice/make");
  await page.getByTestId("file").setInputFiles({ name: "rule.txt", mimeType: "text/plain", buffer: Buffer.from("盤に触る前に、検電器で確かめる。\n感電するから。", "utf-8") });
  await expect(page.getByTestId("speech")).toHaveValue("盤に触る前に、検電器で確かめる。\n感電するから。");
  await page.getByTestId("to-confirm").click();
  await expect(page.getByTestId("confirm-text").locator("li")).toHaveCount(2);
  await page.waitForTimeout(400);

  await page.getByTestId("back").click();
  const pdf = Buffer.from("%PDF-1.4\n% e2e\n", "latin1");
  await page.getByTestId("file").setInputFiles({ name: "manual e2e.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.getByText("PDF を置き場に入れました（inbox/manual_e2e.pdf）")).toBeVisible();
  const got = await request.get("/api/t/practice/files/inbox/manual_e2e.pdf");
  expect(got.status()).toBe(200);
  expect(Buffer.from(await got.body()).equals(pdf)).toBe(true);
  await page.waitForTimeout(400);
});
