import { expect, test } from "@playwright/test";

// 回答の記録 3（025）: 採点 2 人が別々の画面で付け、匿名の CSV に食い違いが出る
test("③ 採点 2 人が別々に付け、CSV に食い違いが出る", async ({ browser, request }) => {
  const t = (await (await request.post("/api/t/practice/trials", { data: { participants: ["p1", "p2"] } })).json()) as { id: string };
  // p1 は答えの欄 2 つ（11/5）。p2 は前からの 1 つの文
  for (const [p, a] of [["p1", JSON.stringify({ ja: "止めて", own: "dừng lại và báo" })], ["p2", "そのまま触る"]]) {
    const res = await request.post(`/api/t/practice/trials/${t.id}/responses`, { data: { participant: p, item: "B", answer: a } });
    expect(res.status()).toBe(201);
  }
  const rows = (await (await request.get(`/api/t/practice/trials/${t.id}/responses`)).json()).responses as { seq: number; answer: string }[];
  const [first, second] = rows;

  const open = async (g: string) => {
    const ctx = await browser.newContext({ recordVideo: { dir: test.info().outputPath(`grader-${g}`) } });
    const page = await ctx.newPage();
    await page.goto(`/#/t/practice/trial/${t.id}/grade/${g}`);
    await expect(page.getByTestId("grade-left")).toHaveText("2");
    return { ctx, page };
  };
  const g1 = await open("g1");
  const g2 = await open("g2");
  // 採点者 1 は自分の言葉の欄を訳して判定する。訳を書くまで判定は押せない
  await expect(g1.page.getByTestId(`grade-${first.seq}-said-own`)).toContainText("dừng lại và báo");
  await g1.page.getByTestId(`grade-${first.seq}-field-own`).check();
  await expect(g1.page.getByTestId(`grade-${first.seq}-correct`)).toBeDisabled();
  await g1.page.getByTestId(`grade-${first.seq}-ja`).fill("止めて知らせる");
  await g1.page.getByTestId(`grade-${first.seq}-correct`).click();
  await g1.page.getByTestId(`grade-${second.seq}-danger`).click();
  await expect(g1.page.getByTestId("grade-left")).toHaveText("0");
  // 採点者 2 には 1 の判定が見えない
  await g2.page.reload();
  await expect(g2.page.getByTestId("grade-left")).toHaveText("2");
  await expect(g2.page.locator(".pick.on")).toHaveCount(0);
  await g2.page.getByTestId(`grade-${first.seq}-wrong`).click();
  await g2.page.getByTestId(`grade-${second.seq}-danger`).click();
  await expect(g2.page.getByTestId("grade-left")).toHaveText("0");

  const dl = g2.page.waitForEvent("download");
  await g2.page.getByTestId("grade-csv").click();
  const csv = (await (await (await dl).createReadStream()).toArray()).join("");
  // 日本語の欄・自分の言葉の欄・訳・採点者ごとにどちらの欄で判定したか
  expect(csv).toContain("止めて,dừng lại và báo,止めて知らせる,own,ja,correct,wrong,yes");
  expect(csv).toContain("そのまま触る,,,ja,ja,danger,danger,no");
  expect(csv).not.toMatch(/\bp[12]\b/);
  for (const { ctx } of [g1, g2]) await ctx.close();
});
