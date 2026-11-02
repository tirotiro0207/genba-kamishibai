import { expect, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";
import { freshTenant, login, MARK, toOk } from "./helpers/ok";

// 発行の管理（088）: 署名済みを新入社員が見る → 監修者が理由つきで止める → 新入社員の画面と API から消える
// → 見た人の一覧が出る → 教育担当に回収の知らせ（版と署名の日付）が出る → 今週の抜き取りの 2 枚と種と見直す人が出る。
// 本物の Claude API は呼ばない。確かめる AI の証拠は使い捨てテナントの監査の記録に書いたテスト用のもの。
// 録画の絵は仮（※取り直しの対象）

const jstDate = (d: Date) => d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });

test("署名済みを止めると新入社員から消え、見た人・回収の知らせ・週の抜き取りが出る", async ({ page, request }) => {
  test.setTimeout(180_000);
  const T = freshTenant("i088", "発行の確認");
  const api = `/api/t/${T}`;
  const sup1 = { "x-role": await login(request, T, "supervisor", 1) };
  const sup2 = { "x-role": await login(request, T, "supervisor", 2) };
  const nhToken = await login(request, T, "newhire");
  const nh = { "x-role": nhToken };

  // 4 枚を OK まで進め、監修者 1 が 3 枚・監修者 2 が 1 枚に署名する
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) {
    const res = await request.post(`${api}/cards`, { data: { card: { ...sampleCard(), rule: `088 ${T} ${i}` } } });
    expect(res.status()).toBe(201);
    ids.push(((await res.json()) as { id: string }).id);
  }
  await toOk(request, T, ids);
  for (const [i, id] of ids.entries()) expect((await request.post(`${api}/cards/${id}/sign`, { headers: i === 3 ? sup2 : sup1, data: { version: 1, mark: MARK } })).status()).toBe(200);
  const signedDate = jstDate(new Date());

  // 1. 新入社員が見る（役割のしるしで入り、1 枚目と 2 枚目を送って見る）
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(([t, tok]) => sessionStorage.setItem(`role:${t}`, tok), [T, nhToken]);
  await page.goto(`/#/t/${T}/read`);
  // 並びは作った順（同じ秒なら ID 順）なので、画面に最初に出た 1 枚を、あとで止める 1 枚にする
  await expect(page.getByTestId("read-card")).toBeVisible();
  const stopId = (await page.getByTestId("read-card").getAttribute("data-card"))!;
  expect(ids).toContain(stopId);
  await page.waitForTimeout(800);
  await page.getByTestId("read-next").click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: test.info().outputPath("issue-1-read.png") });
  await expect
    .poll(async () => ((await (await request.get(`${api}/issue/cards/${stopId}/views`, { headers: sup1 })).json()) as { views: unknown[] }).views.length)
    .toBe(1);

  // 2. 監修者 1 で発行の画面を開く。署名済みの 4 枚・今週の抜き取り・見た人が出る
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.evaluate((t) => sessionStorage.removeItem(`role:${t}`), T);
  await page.goto(`/#/t/${T}/issue`);
  await expect(page.getByTestId("issue-pick")).toBeVisible();
  await page.getByTestId("issue-as-supervisor-1").click();
  await expect(page.getByTestId("issue")).toBeVisible();
  await expect(page.getByTestId("issue-cards").locator("> li")).toHaveCount(4);
  await expect(page.getByTestId(`issue-card-${stopId}`)).toContainText("版 1");
  await expect(page.getByTestId(`issue-card-${stopId}`)).toContainText(signedDate);

  // 今週の抜き取り: 2 枚と種。見直す人は署名した人とは別の監修者
  const sample = (await (await request.post(`${api}/issue/sample`, { headers: sup1, data: {} })).json()) as { seed: string; picks: { card_id: string; signed_by: string; reviewer: string }[] };
  expect(sample.picks).toHaveLength(2);
  await expect(page.getByTestId("issue-seed")).toHaveText(sample.seed);
  const label = (a: string) => (a === "supervisor.1" ? "監修者 1" : "監修者 2");
  for (const p of sample.picks) {
    expect(p.reviewer).not.toBe(p.signed_by);
    await expect(page.getByTestId(`issue-pick-${p.card_id}`)).toBeVisible();
    await expect(page.getByTestId(`issue-reviewer-${p.card_id}`)).toContainText(`見直す人: ${label(p.reviewer)}`);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: test.info().outputPath("issue-2-board.png"), fullPage: true });

  await page.getByTestId(`issue-viewers-${stopId}`).click();
  await expect(page.getByTestId(`issue-views-${stopId}`)).toContainText("新入社員");
  await page.waitForTimeout(800);

  // 3. 理由をつけて止める
  await page.getByTestId(`issue-stop-${stopId}`).click();
  await expect(page.getByTestId(`issue-stop-go-${stopId}`)).toBeDisabled();
  await page.getByTestId(`issue-reason-${stopId}`).fill("手順が現場の盤と違っていた");
  await page.waitForTimeout(500);
  await page.getByTestId(`issue-stop-go-${stopId}`).click();
  await expect(page.getByTestId("issue-cards").locator("> li")).toHaveCount(3);
  await expect(page.getByTestId(`issue-card-${stopId}`)).toHaveCount(0);
  await expect(page.getByTestId(`issue-recall-${stopId}`)).toContainText("手順が現場の盤と違っていた");
  await page.waitForTimeout(800);

  // 新入社員の API と画面から消えた。見た人の記録は残っている
  expect((await request.get(`${api}/read/cards/${stopId}`, { headers: nh })).status()).toBe(404);
  const list = (await (await request.get(`${api}/read/cards`, { headers: nh })).json()) as { cards: { id: string }[] };
  expect(list.cards.map((c) => c.id)).not.toContain(stopId);
  expect(list.cards).toHaveLength(3);
  const views = (await (await request.get(`${api}/issue/cards/${stopId}/views`, { headers: sup1 })).json()) as { views: { actor: string; version: number }[] };
  expect(views.views.map((v) => [v.actor, v.version])).toEqual([["newhire.1", 1]]);
  await page.evaluate((t) => sessionStorage.setItem(`role:${t}`, ""), T);
  await page.goto(`/#/t/${T}/read`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("read-pos")).toContainText("/ 3");
  await page.screenshot({ path: test.info().outputPath("issue-3-newhire-after.png") });

  // 4. 教育担当に回収の知らせが出る（版と署名の日付）。読んだ印を付ける
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.evaluate((t) => sessionStorage.removeItem(`role:${t}`), T);
  await page.goto(`/#/t/${T}/issue`);
  await page.getByTestId("issue-as-trainer-1").click();
  await expect(page.getByTestId("issue-unread")).toHaveText("未読 1");
  await expect(page.getByTestId(`issue-recall-key-${stopId}`)).toContainText("版 1");
  await expect(page.getByTestId(`issue-recall-key-${stopId}`)).toContainText(signedDate);
  // 教育担当には止めるボタンが無い
  await expect(page.getByTestId(`issue-stop-${ids.find((x) => x !== stopId)}`)).toHaveCount(0);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: test.info().outputPath("issue-4-recall.png"), fullPage: true });
  await page.getByTestId(`issue-recall-read-${stopId}`).click();
  await expect(page.getByTestId(`issue-recall-done-${stopId}`)).toContainText("教育担当");
  await expect(page.getByTestId("issue-unread")).toHaveCount(0);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: test.info().outputPath("issue-5-read.png"), fullPage: true });
});
