import { expect, test } from "@playwright/test";

// 回答の記録 2（012）: ① は 2 列で並行して計れ、② は端末ごとに同時に答えられる
async function newTrial(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post("/api/t/practice/trials", { data: { participants: ["p1", "p2", "p3", "p4"] } });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; assignments: { participant: string; A: string[]; B: string[] }[] };
}

test("① 2 列で並行して計り、「分かった」で止まって保存される", async ({ page, request }) => {
  const t = await newTrial(request);
  await page.goto(`/#/t/practice/trial/${t.id}/time`);
  await page.getByTestId("lane-0-start").click();
  await page.waitForTimeout(700);
  await page.getByTestId("lane-1-start").click();
  // 2 列とも時計が動いている
  await expect(page.getByTestId("lane-0-clock")).toBeVisible();
  await expect(page.getByTestId("lane-1-clock")).toBeVisible();
  await page.waitForTimeout(800);
  await page.getByTestId("lane-1-got").click();
  await page.waitForTimeout(600);
  await page.getByTestId("lane-0-got").click();
  await expect(page.getByTestId("lane-0-saved")).toBeVisible();
  await expect(page.getByTestId("lane-1-saved")).toBeVisible();

  const rows = (await (await request.get(`/api/t/practice/trials/${t.id}/responses`)).json()).responses as { participant: string; shown: string; ms: number }[];
  const p1 = rows.find((r) => r.participant === "p1")!;
  const p2 = rows.find((r) => r.participant === "p2")!;
  expect(p1.ms).toBeGreaterThan(p2.ms); // 先に始めて後で止めた列のほうが長い
  expect(p1.shown).toBe(t.assignments[0].A[0]);
  expect(p2.shown).toBe(t.assignments[1].A[0]);
});

test("② 端末ごとに同時に答えられる", async ({ browser, request }) => {
  const t = await newTrial(request);
  const devices = await Promise.all(["p3", "p4"].map(async (p) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: test.info().outputPath(`device-${p}`) } });
    const page = await ctx.newPage();
    await page.goto(`/#/t/practice/trial/${t.id}/answer/${p}`);
    return { p, ctx, page };
  }));
  for (const round of [1, 2]) {
    await Promise.all(devices.map(async ({ p, page }) => {
      const B = t.assignments.find((a) => a.participant === p)!.B;
      await expect(page.getByTestId("material")).toHaveAttribute("data-shown", B[round - 1]);
      await page.getByTestId("answer-text").fill(`${p} の答え ${round}`);
      await page.getByTestId("answer-submit").click();
      await expect(page.getByTestId("answer-text").or(page.getByTestId("answer-done"))).toBeVisible();
      if (round === 1) await expect(page.getByTestId("material")).toHaveAttribute("data-shown", B[1]);
    }));
  }
  for (const { page } of devices) await expect(page.getByTestId("answer-done")).toBeVisible();
  for (const { ctx } of devices) await ctx.close();

  const rows = (await (await request.get(`/api/t/practice/trials/${t.id}/responses`)).json()).responses as { participant: string; item: string; shown: string; answer: string }[];
  for (const p of ["p3", "p4"]) {
    const mine = rows.filter((r) => r.participant === p && r.item === "B");
    expect(mine.map((r) => r.answer)).toEqual([`${p} の答え 1`, `${p} の答え 2`]);
    expect(mine.map((r) => r.shown)).toEqual(t.assignments.find((a) => a.participant === p)!.B);
  }
});
