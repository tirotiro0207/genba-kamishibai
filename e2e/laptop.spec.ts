import { expect, type APIRequestContext, test } from "@playwright/test";
import sharp from "sharp";
import { sampleCard } from "../tests/fixtures/card";

// ① をノートパソコンで受ける（11/5 作者: 端末を会社の iPad からノートパソコンに替えた）。
// Enter で「分かった」「おくる」が押されないこと、表紙が抜けた時から数えること、13〜15 インチの画面に見せるものが収まるかを見る。
// ブラウザは LAPTOP_CHANNEL で選べる（chrome・msedge。無ければ同梱の Chromium）
if (process.env.LAPTOP_CHANNEL) test.use({ channel: process.env.LAPTOP_CHANNEL });

// 元のページの画像と同じ縦長（A4 の縦・150 dpi ほど）の、無地の画像
const page1 = () => sharp({ create: { width: 1240, height: 1754, channels: 3, background: "#f4f4f4" } }).png().toBuffer();

async function crossTrial(request: APIRequestContext, people: string[]) {
  const ids: string[] = [];
  for (const rule of ["① 検電", "① 吊り荷"]) {
    const res = await request.post("/api/t/practice/cards", { data: { card: { ...sampleCard(), rule, words: { ja: "たしかめます。", vi: "kiểm tra" } } } });
    ids.push(((await res.json()) as { id: string }).id);
  }
  const t = (await (await request.post("/api/t/practice/trials", { data: { design: "cross", participants: people.map((id) => ({ id, group: "ベトナム" })) } })).json()) as { id: string };
  const png = await page1();
  for (const k of ["A", "B"]) expect((await request.put(`/api/t/practice/files/pages/${t.id}-${k}.png`, { headers: { "content-type": "image/png" }, data: png })).status()).toBe(201);
  expect((await request.put(`/api/t/practice/trials/${t.id}/material`, { data: { A: { card: ids[0], page: `pages/${t.id}-A.png` }, B: { card: ids[1], page: `pages/${t.id}-B.png` } } })).status()).toBe(201);
  return t;
}

const rows = async (request: APIRequestContext, id: string) => ((await (await request.get(`/api/t/practice/trials/${id}/responses`)).json()).responses as { participant: string; ms: number }[]);

test("ノートパソコン: Enter では「分かった」も「おくる」も押されず、答えの欄では改行になる", async ({ page, request }) => {
  const t = await crossTrial(request, ["n1", "n2"]);
  await page.goto(`/#/t/practice/trial/${t.id}/self/n1`);
  await expect(page.getByTestId("self-start")).toBeEnabled();
  // 表紙の上で Enter を押しても始まらない（押すのはマウスかタッチパッドだけ）
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  await expect(page.getByTestId("stage")).toHaveAttribute("data-started", "false");
  await page.getByTestId("self-start").click();
  await expect(page.getByTestId("self-got")).toBeEnabled();
  // 見ているあいだに Enter を何度押しても「分かった」にならない
  for (let i = 0; i < 3; i++) await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await expect(page.getByTestId("self-got")).toBeVisible();
  await page.getByTestId("self-got").click();
  // 答えの欄で Enter を押すと改行になり、送られない
  const ja = page.getByTestId("self-text-ja");
  await ja.click();
  await page.keyboard.type("とめる");
  await page.keyboard.press("Enter");
  await page.keyboard.type("たしかめる");
  await page.keyboard.press("Enter");
  await expect(ja).toHaveValue("とめる\nたしかめる\n");
  await page.waitForTimeout(500);
  expect(await rows(request, t.id)).toHaveLength(0);
  await page.getByTestId("self-submit").click();
  await expect(page.getByTestId("self-start")).toBeVisible();
  await expect.poll(async () => (await rows(request, t.id)).length).toBe(1);
});

test("ノートパソコン: 表紙が抜けきった時から数える（マウスで押す）", async ({ page, request }) => {
  const t = await crossTrial(request, ["m1", "m2"]);
  await page.goto(`/#/t/practice/trial/${t.id}/self/m1`);
  for (let k = 0; k < 2; k++) {
    await expect(page.getByTestId("self-start")).toBeEnabled();
    await expect(page.getByTestId("self-start")).toHaveText("はじめる");
    // 今の見せ方では、文の側の「はじめる」が 1280×720 の画面の外（下）に出る。スクロールしてから押す（11/5 の確かめで分かった。直すかは作者が決める）
    await page.getByTestId("self-start").scrollIntoViewIfNeeded();
    const box = (await page.getByTestId("self-start").boundingBox())!;
    const before = await page.evaluate(() => performance.now());
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId("stage")).toHaveAttribute("data-started", "true");
    const t0 = Number(await page.getByTestId("stage").getAttribute("data-t0"));
    expect(t0 - before).toBeGreaterThanOrEqual(330);
    await page.getByTestId("self-got").click();
    await page.getByTestId("self-text-ja").fill(`答え ${k}`);
    await page.getByTestId("self-submit").click();
  }
  await expect(page.getByTestId("self-done")).toBeVisible();
  expect((await rows(request, t.id)).filter((r) => r.participant === "m1")).toHaveLength(2);
});

// 13 インチ（1280×800 ほど）と 15 インチ（1366×768・1920×1080）の画面で、見せるものと「分かった」が 1 画面に収まるか。
// 収まらないときは数だけを記録に出す（見せ方を直すかは作者が決める）
for (const vp of [{ width: 1280, height: 800 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test(`ノートパソコン: ${vp.width}×${vp.height} で見せるものが 1 画面に収まるか`, async ({ page, request }) => {
    await page.setViewportSize(vp);
    const t = await crossTrial(request, [`v${vp.width}a`, `v${vp.width}b`]);
    await page.goto(`/#/t/practice/trial/${t.id}/self/v${vp.width}a`);
    const fit: Record<string, { bottom: number; got: number }> = {};
    for (let k = 0; k < 2; k++) {
      await expect(page.getByTestId("self-start")).toBeEnabled();
      await page.getByTestId("self-start").click();
      await expect(page.getByTestId("self-got")).toBeEnabled();
      const m = page.getByTestId("material");
      const shown = (await m.getAttribute("data-shown"))!;
      const b = (await m.boundingBox())!;
      const g = (await page.getByTestId("self-got").boundingBox())!;
      fit[shown] = { bottom: Math.round(b.y + b.height), got: Math.round(g.y + g.height) };
      await page.getByTestId("self-got").click();
      await page.getByTestId("self-text-ja").fill("x");
      await page.getByTestId("self-submit").click();
    }
    test.info().annotations.push({ type: "fit", description: `${vp.width}x${vp.height} 画面の高さ ${vp.height} / ${JSON.stringify(fit)}` });
    console.log(`fit ${vp.width}x${vp.height}`, JSON.stringify(fit));
  });
}
