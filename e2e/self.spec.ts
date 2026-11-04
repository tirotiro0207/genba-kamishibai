import { expect, type APIRequestContext, type Page, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";

// ① の交差の回（11/5 作者）: 見せるものを画面で結び、2 人が別の端末で同時に受ける。片方はカード、もう片方は元のページの画像
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function cards(request: APIRequestContext) {
  const ids: string[] = [];
  for (const rule of ["① 検電", "① 吊り荷"]) {
    const res = await request.post("/api/t/practice/cards", { data: { card: { ...sampleCard(), rule, words: { ja: "たしかめます。", vi: "kiểm tra" } } } });
    ids.push(((await res.json()) as { id: string }).id);
  }
  return ids;
}

/** API で交差の回を作り、見せるものを結ぶ（画面の通しは 1 本目で見る） */
async function crossTrial(request: APIRequestContext, people: string[]) {
  const ids = await cards(request);
  const t = (await (await request.post("/api/t/practice/trials", { data: { design: "cross", participants: people.map((id) => ({ id, group: "ベトナム" })) } })).json()) as { id: string; assignments: { participant: string; set: number }[] };
  for (const k of ["A", "B"]) expect((await request.put(`/api/t/practice/files/pages/${t.id}-${k}.png`, { headers: { "content-type": "image/png" }, data: png })).status()).toBe(201);
  const m = await request.put(`/api/t/practice/trials/${t.id}/material`, { data: { A: { card: ids[0], page: `pages/${t.id}-A.png` }, B: { card: ids[1], page: `pages/${t.id}-B.png` } } });
  expect(m.status()).toBe(201);
  return t;
}

const answerOne = async (pg: Page, text: string, wait = 300) => {
  await pg.getByTestId("self-start").click();
  await expect(pg.getByTestId("self-got")).toBeEnabled();
  await pg.waitForTimeout(wait);
  await pg.getByTestId("self-got").click();
  await pg.getByTestId("self-text-ja").fill(text);
  await pg.getByTestId("self-submit").click();
};

test("① 見せるものを結び、組のとおりにカードと元のページを 1 つずつ受ける", async ({ browser, page, request }) => {
  const ids = await cards(request);
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
      await pg.getByTestId("self-start").click();
      await expect(pg.getByTestId("self-got")).toBeEnabled();
      const m = pg.getByTestId("material");
      const shown = (await m.getAttribute("data-shown"))!;
      (seen[p] ??= []).push(shown);
      if (shown === "card") await expect(m).toContainText("たしかめます。");
      else await expect(m.locator("img.material-page")).toBeVisible();
      await expect(m).not.toContainText("kiểm tra");
      await pg.waitForTimeout(300);
      await pg.getByTestId("self-got").click();
      // 答えの欄は 2 つ。日本語の欄と、自分の言葉の欄（書かなくてもよい）
      await pg.getByTestId("self-text-ja").fill(`${p} の答え ${round}`);
      if (round === 1) await pg.getByTestId("self-text-own").fill("dừng lại");
      await pg.getByTestId("self-submit").click();
      await expect(pg.getByTestId(round === 0 ? "self-start" : "self-done")).toBeVisible();
    }));
  }
  for (const { ctx } of devices) await ctx.close();
  // 1 人がカードと文を 1 つずつ。2 人は組が違うので、項目 A で見たものが逆
  for (const p of ["v1", "v2"]) expect([...seen[p]].sort()).toEqual(["card", "text"]);
  expect(seen.v1[0]).not.toBe(seen.v2[0]);
  const rows = (await (await request.get(`/api/t/practice/trials/${id}/responses`)).json()).responses as { participant: string; item: string; ms: number; answer: string }[];
  expect(rows).toHaveLength(4);
  for (const r of rows) expect(r.ms).toBeGreaterThan(0);
  expect(JSON.parse(rows.find((r) => r.participant === "v1" && r.item === "B")!.answer)).toEqual({ ja: "v1 の答え 1", own: "dừng lại" });
});

test("① 画像の読み込みが遅くても、読み込み中は「はじめる」が押せず、その分は分かるまでの時間に入らない", async ({ page, request }) => {
  const t = await crossTrial(request, ["s1", "s2"]);
  // 文の側の画像を 2.5 秒遅らせる。読み込み終わるまで表紙の「はじめる」は押せない
  await page.route("**/api/t/practice/files/pages/**", async (r) => {
    await new Promise((ok) => setTimeout(ok, 2500));
    await r.continue();
  });
  await page.goto(`/#/t/practice/trial/${t.id}/self/s1`);
  await expect(page.getByTestId("self-start")).toBeDisabled();
  await expect(page.getByTestId("self-start")).toHaveText("じゅんびちゅう");
  await expect(page.getByTestId("self-start")).toBeEnabled({ timeout: 10_000 });
  await expect(page.getByTestId("self-start")).toHaveText("はじめる");
  for (const k of [0, 1]) {
    await answerOne(page, `答え ${k}`);
    await expect(page.getByTestId(k === 0 ? "self-start" : "self-done")).toBeVisible();
  }
  const rows = (await (await request.get(`/api/t/practice/trials/${t.id}/responses`)).json()).responses as { participant: string; shown: string; ms: number }[];
  const mine = rows.filter((r) => r.participant === "s1");
  expect(mine.map((r) => r.shown).sort()).toEqual(["card", "text"]);
  // 読み込みの 2.5 秒は入っていない（押すまで 0.3 秒待っただけ）
  for (const r of mine) expect(r.ms).toBeLessThan(1500);
});

test("① 送るのに失敗しても答えと時間は消えず、回線が戻ると 1 回だけ届く", async ({ page, request }) => {
  const t = await crossTrial(request, ["f1", "f2"]);
  await page.goto(`/#/t/practice/trial/${t.id}/self/f1`);
  // 答えを送る口だけを落とす
  let down = true;
  await page.route(`**/api/t/practice/trials/${t.id}/responses`, (r) => (down && r.request().method() === "POST" ? r.abort() : r.continue()));
  await answerOne(page, "落ちても消えない");
  await expect(page.getByTestId("self-pending")).toContainText("まだ おくれて いません（1）");
  // 次の項目へは進める。読み直しても、送れていない答えは端末の中から戻る
  await expect(page.getByTestId("self-start")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("self-pending")).toContainText("（1）");
  await answerOne(page, "2 つ目");
  await expect(page.getByTestId("self-pending")).toContainText("（2）");
  await expect(page.getByTestId("self-done")).toBeVisible();
  expect(((await (await request.get(`/api/t/practice/trials/${t.id}/responses`)).json()).responses as unknown[]).length).toBe(0);
  // 回線が戻ったので、もう一度送る。2 回押しても同じ答えは 2 つ入らない
  down = false;
  await page.getByTestId("self-resend").click();
  await page.getByTestId("self-resend").click({ timeout: 1000 }).catch(() => {});
  await expect(page.getByTestId("self-pending")).toHaveCount(0);
  await page.waitForTimeout(500);
  const rows = (await (await request.get(`/api/t/practice/trials/${t.id}/responses`)).json()).responses as { participant: string; item: string; ms: number; answer: string }[];
  expect(rows.map((r) => r.item).sort()).toEqual(["A", "B"]);
  for (const r of rows) expect(r.ms).toBeGreaterThan(0);
  expect(JSON.parse(rows.find((r) => r.item === "A")!.answer).ja).toBe("落ちても消えない");
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("gk-out:")).length)).toBe(0);
});

test("① 時間は表紙が抜けきった時から数え、「分かった」のあとは中身が見えない", async ({ page, request }) => {
  const t = await crossTrial(request, ["c1", "c2"]);
  await page.goto(`/#/t/practice/trial/${t.id}/self/c1`);
  // 押した時刻は、ページの中の同じ時計で取る（試験の側の待ちを混ぜない）
  const press = (testid: string) =>
    page.evaluate((id) => {
      const t = performance.now();
      (document.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click();
      return t;
    }, testid);
  const want: number[] = [];
  for (const k of [0, 1]) {
    await expect(page.getByTestId("self-start")).toBeEnabled();
    // 表紙の下に中身はあるが、表紙で隠れていて、まだ数え始めていない
    await expect(page.getByTestId("stage")).toHaveAttribute("data-started", "false");
    await expect(page.getByTestId("self-got")).toBeDisabled();
    const clicked = await press("self-start");
    // 表紙が抜けるあいだ（0.35 秒）は「分かった」を押せない
    await expect(page.getByTestId("self-got")).toBeDisabled();
    await expect(page.getByTestId("stage")).toHaveAttribute("data-started", "true");
    await expect(page.getByTestId("self-cover")).toHaveCount(0);
    // 数え始めは、表紙が抜けきった時（押した時から 0.35 秒あと）
    const t0 = Number(await page.getByTestId("stage").getAttribute("data-t0"));
    expect(t0 - clicked).toBeGreaterThanOrEqual(330);
    await page.waitForTimeout(200);
    want.push((await press("self-got")) - t0);
    // 答えは中身を見ずに書く
    await expect(page.getByTestId("material")).toHaveCount(0);
    await expect(page.getByTestId("stage")).toHaveCount(0);
    await expect(page.locator("img.material-page")).toHaveCount(0);
    await page.getByTestId("self-text-ja").fill(`答え ${k}`);
    await page.getByTestId("self-submit").click();
  }
  await expect(page.getByTestId("self-done")).toBeVisible();
  const rows = (await (await request.get(`/api/t/practice/trials/${t.id}/responses`)).json()).responses as { participant: string; ms: number }[];
  // 記録された時間は、抜けきった時から「分かった」まで。表紙が抜ける 0.35 秒は入っていない
  const ms = rows.filter((x) => x.participant === "c1").map((r) => r.ms);
  expect(ms).toHaveLength(2);
  ms.forEach((m, i) => expect(Math.abs(m - want[i])).toBeLessThanOrEqual(5));
});
