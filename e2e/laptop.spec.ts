import { expect, type APIRequestContext, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { sampleCard } from "../tests/fixtures/card";

// ① をノートパソコンで受ける（11/5 作者: 端末を会社の iPad からノートパソコンに替えた）。
// Enter で「分かった」「おくる」が押されないこと、表紙が抜けた時から数えること、13〜15 インチの画面に見せるものが収まるかを見る。
// ブラウザは LAPTOP_CHANNEL で選べる（chrome・msedge。無ければ同梱の Chromium）
if (process.env.LAPTOP_CHANNEL) test.use({ channel: process.env.LAPTOP_CHANNEL });

// 元のページの画像と同じ縦長（A4 の縦・150 dpi ほど）の、無地の画像
const page1 = () => sharp({ create: { width: 1240, height: 1754, channels: 3, background: "#f4f4f4" } }).png().toBuffer();

// FIT_PAGES に本物のページの画像を 2 つ（カンマ区切り）渡すと、その画像で確かめる（会社の資料なので手元だけ。リポジトリに入れない）
const real = process.env.FIT_PAGES?.split(",");
// FIT_SHOTS の静止画は、流すたびに日時つきの新しい置き場に書き、前の回を上書きしない（e2e/clocks.spec.ts と同じ形）
const fitShots = process.env.FIT_SHOTS && `${process.env.FIT_SHOTS}/${new Date().toISOString().replace(/[:.]/g, "-")}`;

async function crossTrial(request: APIRequestContext, people: string[]) {
  const ids: string[] = [];
  for (const rule of ["① 検電", "① 吊り荷"]) {
    const res = await request.post("/api/t/practice/cards", { data: { card: { ...sampleCard(), rule, words: { ja: "たしかめます。", vi: "kiểm tra" } } } });
    ids.push(((await res.json()) as { id: string }).id);
  }
  const t = (await (await request.post("/api/t/practice/trials", { data: { design: "cross", participants: people.map((id) => ({ id, group: "ベトナム" })) } })).json()) as { id: string };
  const blank = await page1();
  for (const [i, k] of ["A", "B"].entries()) {
    const png = real ? readFileSync(real[i]) : blank;
    expect((await request.put(`/api/t/practice/files/pages/${t.id}-${k}.png`, { headers: { "content-type": "image/png" }, data: png })).status()).toBe(201);
  }
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
    // 11/6 から見せるものを画面の高さに収めたので、スクロールせずに押せる
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

// 13 インチ（1280×800 ほど）と 15 インチ（1366×768・1920×1080）の画面で（11/6 本部の決定）:
// カードの側は絵と「分かった」が 1 画面に収まる。ページの側は幅いっぱいでスクロールあり、「分かった」は画面の下に貼り付いていつでも押せる。
// どちらの側も「はじめる」はスクロールせずに押せる
for (const vp of [{ width: 1280, height: 720 }, { width: 1280, height: 800 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 1024, height: 768 }]) {
  test(`ノートパソコン: ${vp.width}×${vp.height} でカードは 1 画面、ページは幅いっぱいで「分かった」がいつでも押せる`, async ({ page, request }) => {
    await page.setViewportSize(vp);
    const t = await crossTrial(request, [`v${vp.width}a`, `v${vp.width}b`]);
    await page.goto(`/#/t/practice/trial/${t.id}/self/v${vp.width}a`);
    const inView = async (id: string) => {
      const g = (await page.getByTestId(id).boundingBox())!;
      return g.y >= 0 && g.y + g.height <= vp.height;
    };
    for (let k = 0; k < 2; k++) {
      await expect(page.getByTestId("self-start")).toBeEnabled();
      expect(await inView("self-start")).toBe(true);
      await page.getByTestId("self-start").click();
      await expect(page.getByTestId("self-got")).toBeEnabled();
      const shown = (await page.getByTestId("material").getAttribute("data-shown"))!;
      expect(await inView("self-got")).toBe(true);
      if (shown === "card") {
        const b = (await page.getByTestId("material").boundingBox())!;
        expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
        // 絵は横 1 列の 4 コマで、文の下（11/6 作者「4 コマ漫画として」）。1 コマは 180 px より大きい
        const fr = (await page.locator(".read-frames").boundingBox())!;
        expect(fr.width).toBeGreaterThan(fr.height * 2);
        expect(fr.height).toBeGreaterThan(180);
        expect((await page.locator(".material .read-words").boundingBox())!.y).toBeLessThan(fr.y);
      } else {
        // ページは見せるものの幅いっぱい（縮めて 1 画面にしない）
        const m = (await page.getByTestId("material").boundingBox())!;
        const img = (await page.locator(".material-page").boundingBox())!;
        expect(img.width).toBeGreaterThan(m.width - 24);
        console.log(`page ${vp.width}x${vp.height} img ${Math.round(img.width)}x${Math.round(img.height)}`);
        // いちばん下までスクロールしても「分かった」は画面の中
        await page.mouse.wheel(0, 5000);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        expect(await inView("self-got")).toBe(true);
      }
      if (fitShots) await page.screenshot({ path: `${fitShots}/v2-${vp.width}x${vp.height}-${shown}${real ? "-real" : ""}.png` });
      await page.getByTestId("self-got").click();
      await page.getByTestId("self-text-ja").fill("x");
      await page.getByTestId("self-submit").click();
    }
  });
}
