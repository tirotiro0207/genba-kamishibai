import { expect, type Locator, type Page, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";

// 署名の入力（051b）: パソコンは電子印鑑、タブレットとスマホは指。役で入るところは本物の API、
// カードと署名の受け口は差し替える（署名の記録と絵の確かめは Worker のテストで確かめる）
const ID = "sign-card";

async function mockCard(page: Page) {
  const state = { status: "ok", opened: 0, sent: null as null | { version: number; mark: { kind: string; png: string } } };
  await page.route(`**/api/t/practice/cards/${ID}**`, async (route) => {
    const r = route.request();
    if (r.url().endsWith("/open")) {
      state.opened++;
      return route.fulfill({ json: { version: 1, opened_at: new Date().toISOString() } });
    }
    if (r.url().endsWith("/sign")) {
      state.sent = r.postDataJSON();
      state.status = "signed";
      return route.fulfill({ json: { signed: true, version: 1, signed_at: new Date().toISOString(), mark: { kind: state.sent!.mark.kind } } });
    }
    return route.fulfill({ json: { id: ID, status: state.status, version: 1, body: sampleCard(), verify: null } });
  });
  return state;
}

const pngHead = (data: string) => [...Buffer.from(data.split(",")[1], "base64").subarray(0, 4)];

async function finger(face: Locator, pts: [number, number][]) {
  const r = (await face.boundingBox())!;
  const ev = (p: [number, number]) => ({ pointerId: 3, pointerType: "touch", isPrimary: true, bubbles: true, clientX: r.x + r.width * p[0], clientY: r.y + r.height * p[1] });
  await face.dispatchEvent("pointerdown", ev(pts[0]));
  for (const p of pts.slice(1)) await face.dispatchEvent("pointermove", ev(p));
  await face.dispatchEvent("pointerup", ev(pts[pts.length - 1]));
}

test("パソコンは電子印鑑。監修者の役で入り、印を押して署名すると「未承認の下書き」が消える", async ({ page }) => {
  const state = await mockCard(page);
  await page.goto(`/#/t/practice/sign/${ID}`);
  await page.getByTestId("sign-as-1").click();
  await expect(page.getByTestId("sign-input")).toHaveAttribute("data-kind", "stamp");
  await expect.poll(() => state.opened).toBe(1);
  await expect(page.getByTestId("sign-submit")).toBeDisabled();
  await page.getByTestId("sign-press").click();
  await expect(page.getByTestId("sign-submit")).toBeEnabled();
  await page.waitForTimeout(500);
  await page.screenshot({ path: test.info().outputPath("sign-stamp.png"), fullPage: true });
  await page.getByTestId("sign-submit").click();
  await expect(page.getByTestId("sign-done")).toContainText("署名しました");
  expect(state.sent!.version).toBe(1);
  expect(state.sent!.mark.kind).toBe("stamp");
  expect(pngHead(state.sent!.mark.png)).toEqual([0x89, 0x50, 0x4e, 0x47]);
  // カードの画面に戻ると、未承認の下書きの帯が無い
  await page.getByTestId("sign-to-card").click();
  await expect(page.getByTestId("card")).toHaveAttribute("data-status", "signed");
  await expect(page.getByTestId("card-band")).toHaveCount(0);
  await page.waitForTimeout(500);
});

test.describe("タブレットとスマホ", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("指で名前を書いて署名する。短すぎる線では署名できない", async ({ page }) => {
    const state = await mockCard(page);
    await page.goto(`/#/t/practice/sign/${ID}`);
    await page.getByTestId("sign-as-2").click();
    await expect(page.getByTestId("sign-input")).toHaveAttribute("data-kind", "finger");
    const pad = page.getByTestId("sign-pad");
    await finger(pad, [
      [0.2, 0.5],
      [0.22, 0.52],
    ]);
    await expect(page.getByTestId("sign-submit")).toBeDisabled();
    await page.getByTestId("sign-clear").click();
    await finger(pad, [
      [0.15, 0.6],
      [0.25, 0.3],
      [0.35, 0.7],
      [0.45, 0.35],
      [0.6, 0.65],
      [0.8, 0.4],
    ]);
    await expect(page.getByTestId("sign-submit")).toBeEnabled();
    await page.waitForTimeout(500);
    await page.screenshot({ path: test.info().outputPath("sign-finger.png"), fullPage: true });
    await page.getByTestId("sign-submit").click();
    await expect(page.getByTestId("sign-done")).toBeVisible();
    expect(state.sent!.mark.kind).toBe("finger");
    expect(pngHead(state.sent!.mark.png)).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});

test("監修者でない役のしるしでは、署名の画面は監修者で入り直すところから始まる", async ({ page }) => {
  await mockCard(page);
  await page.goto("/");
  await page.evaluate(() => sessionStorage.setItem("role:practice", "practice.trainer.1.9999999999.00"));
  await page.goto(`/#/t/practice/sign/${ID}`);
  await expect(page.getByTestId("sign-pick")).toBeVisible();
  await expect(page.getByTestId("sign-input")).toHaveCount(0);
});
