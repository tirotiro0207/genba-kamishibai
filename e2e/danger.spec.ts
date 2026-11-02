import { expect, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";

// 帯・危険の印・いつも出しておく数字（048）。確かめる AI の結果は差し替え、サーバーの関門は Worker のテストで確かめる

const evidence = (rate: number, band: string, dangerous: boolean) => ({
  agent: "verifier",
  model: "claude-opus-5-5",
  frames: 3,
  cited: [1, 2],
  rate,
  band,
  dangerous,
  reason: dangerous ? "当てずに触ってよいと読める" : "伝わる",
  points: [{ id: "s1", credit: "full", frame: 1, reason: "r" }],
  reading: { frames: [], meaning: "m", do: "d", dont: null, why_guess: null, confidence: 50 },
});

test("帯は 3 色だけで、赤は危険と同じ赤。危ない読み違いには絵の外に「危険」が出て OK を押せず、上の数字が出る", async ({ page }) => {
  const state = { verify: evidence(90, "green", false) as unknown, stats: { dangerous: 0, minutes: 6, rate: 90, checked: 1, signed: 1 } };
  await page.route("**/api/t/practice/cards/**", (route) => {
    const u = route.request().url();
    if (u.endsWith("/cards/stats")) return route.fulfill({ json: state.stats });
    return route.fulfill({ json: { id: "danger-card", status: "pending", version: 1, body: sampleCard(), verify: state.verify } });
  });
  const colors: Record<string, string> = {};
  for (const [rate, band] of [
    [90, "green"],
    [70, "yellow"],
    [40, "red"],
  ] as const) {
    state.verify = evidence(rate, band, false);
    await page.goto(`/#/t/practice/card/danger-card`);
    await page.reload();
    const el = page.getByTestId("card-rate-band");
    await expect(el).toHaveAttribute("data-band", band);
    colors[band] = await el.evaluate((e) => getComputedStyle(e).borderLeftColor);
    await expect(page.getByTestId("card-danger")).toHaveCount(0);
    await expect(page.getByTestId("card-ok")).toBeEnabled();
  }
  expect(new Set(Object.values(colors)).size).toBe(3);
  await page.screenshot({ path: test.info().outputPath("band-red.png"), fullPage: true });

  // 危ない読み違い: 率が高くても赤・「危険」・OK は押せない
  state.verify = evidence(90, "red", true);
  state.stats = { dangerous: 1, minutes: 6, rate: 90, checked: 1, signed: 1 };
  await page.reload();
  const mark = page.getByTestId("card-danger");
  await expect(mark).toContainText("危険");
  await expect(page.getByTestId("card-ok")).toBeDisabled();
  await expect(page.getByTestId("card-ok")).toContainText("危険の印");
  // 赤は帯の赤と同じ（色の意味を増やさない）。印は絵の面の外で、絵の面は 0 字のまま
  expect(await mark.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(colors.red);
  expect(await page.getByTestId("card-face").locator("text").count()).toBe(0);
  expect(await page.getByTestId("card-face").locator("[data-testid=card-danger]").count()).toBe(0);

  // 上の数字
  await expect(page.getByTestId("stats-dangerous")).toHaveText("1");
  await expect(page.getByTestId("stats-minutes")).toHaveText("6");
  await expect(page.getByTestId("stats-rate")).toHaveText("90");
  await page.waitForTimeout(600);
  await page.screenshot({ path: test.info().outputPath("danger.png"), fullPage: true });
});

test("新入社員の画面には、上の数字を出さない", async ({ page }) => {
  await page.goto("/#/t/practice/read");
  await page.waitForTimeout(800);
  await expect(page.getByTestId("stats")).toHaveCount(0);
});
