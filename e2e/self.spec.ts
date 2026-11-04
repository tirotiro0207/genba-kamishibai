import { expect, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";

// ① の交差の回（11/5 作者）: 見せるものを画面で結び、2 人が別の端末で同時に受ける。片方はカード、もう片方は元のページの画像
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("① 見せるものを結び、組のとおりにカードと元のページを 1 つずつ受ける", async ({ browser, page, request }) => {
  const ids: string[] = [];
  for (const rule of ["① 検電", "① 吊り荷"]) {
    const res = await request.post("/api/t/practice/cards", { data: { card: { ...sampleCard(), rule, words: { ja: "たしかめます。", vi: "kiểm tra" } } } });
    ids.push(((await res.json()) as { id: string }).id);
  }
  // 回を作る画面で、交差の回を作る
  await page.goto("/#/t/practice/trial/new");
  await page.getByTestId("new-cross").check();
  await page.getByTestId("new-ids").fill("v1 ベトナム\nv2 ベトナム");
  await page.getByTestId("new-submit").click();
  const link = page.getByTestId("new-material-link");
  await expect(link).toBeVisible();
  const id = (await link.getAttribute("href"))!.split("/")[4];

  // 見せるものを結ぶ
  await link.click();
  for (const [k, c] of [["A", ids[0]], ["B", ids[1]]] as const) {
    await page.getByTestId(`ms-card-${k}`).fill(c);
    await page.getByTestId(`ms-file-${k}`).setInputFiles({ name: `p${k}.png`, mimeType: "image/png", buffer: png });
  }
  await page.getByTestId("ms-submit").click();
  await expect(page.getByTestId("ms-done")).toBeVisible();

  const devices = await Promise.all(["v1", "v2"].map(async (p) => {
    const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, recordVideo: { dir: test.info().outputPath(`self-${p}`) } });
    const pg = await ctx.newPage();
    await pg.goto(`/#/t/practice/trial/${id}/self/${p}`);
    return { p, ctx, pg };
  }));
  const seen: Record<string, string[]> = {};
  for (const round of [0, 1]) {
    await Promise.all(devices.map(async ({ p, pg }) => {
      await pg.getByTestId("self-show").click();
      const m = pg.getByTestId("material");
      const shown = (await m.getAttribute("data-shown"))!;
      (seen[p] ??= []).push(shown);
      if (shown === "card") await expect(m).toContainText("たしかめます。");
      else await expect(m.locator("img.material-page")).toBeVisible();
      await expect(m).not.toContainText("kiểm tra");
      await pg.waitForTimeout(300);
      await pg.getByTestId("self-got").click();
      await pg.getByTestId("self-text").fill(`${p} の答え ${round}`);
      await pg.getByTestId("self-submit").click();
      await expect(pg.getByTestId(round === 0 ? "self-show" : "self-done")).toBeVisible();
    }));
  }
  for (const { ctx } of devices) await ctx.close();
  // 1 人がカードと文を 1 つずつ。2 人は組が違うので、項目 A で見たものが逆
  for (const p of ["v1", "v2"]) expect([...seen[p]].sort()).toEqual(["card", "text"]);
  expect(seen.v1[0]).not.toBe(seen.v2[0]);
  const rows = (await (await request.get(`/api/t/practice/trials/${id}/responses`)).json()).responses as { participant: string; ms: number; answer: string }[];
  expect(rows).toHaveLength(4);
  for (const r of rows) expect(r.ms).toBeGreaterThan(0);
});
