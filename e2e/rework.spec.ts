import { expect, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";
import { POSES } from "../src/shared/picto/poses";

// 言葉で直す（11/6）: 直す画面で範囲を選び、話すか書いて送ると、作り直した絵が出て版が上がり、1 つ前の版に戻せる。
// 作り直しの係の呼び出しは差し替える（その 1 枚を作り直す e2e と同じやり方）。差し替えた口は、作り直した中身を本物の直しの保存（PUT）で保存するので、版と戻すは本物が動く。
// 取り込み方（1 コマだけ・形の検査・5 回まで）は Worker と単体のテストで確かめる
test("言葉でカード全体を直すと、作り直した絵が出て版が上がり、1 つ前の版に戻せる", async ({ page, request }) => {
  const { id } = (await (await request.post("/api/t/practice/cards", { data: { card: sampleCard() } })).json()) as { id: string };
  let asked: { text: string; frame: number | null } | null = null;
  await page.route(`**/api/t/practice/cards/${id}/rework`, async (route) => {
    asked = route.request().postDataJSON();
    // 少し待たせて、待つ間の言葉が出るのを確かめる
    await new Promise((r) => setTimeout(r, 800));
    const card = sampleCard();
    if (card.motion.kind === "keyframes") for (const k of card.motion.json.keyframes) k.figures[0].angles = { ...POSES.hands };
    const res = await request.put(`/api/t/practice/cards/${id}`, { data: { card, reason: `言葉で直した: ${asked!.text}` } });
    await route.fulfill({ json: { ...(await res.json()), rework: { count: 1, left: 4 } } });
  });

  await page.goto(`/#/t/practice/fix/${id}`);
  await page.getByTestId("fix-mode-words").click();
  await expect(page.getByTestId("fix-draw")).toContainText("言葉で伝える");
  await expect(page.getByTestId("fix-version")).toHaveText("今は版 1");
  // カード全体のときは全部のコマが並ぶ。1 コマを選ぶとそのコマだけ
  await expect(page.getByTestId("words-faces").locator("figure")).toHaveCount(3);
  await page.getByTestId("words-scope-1").click();
  await expect(page.getByTestId("words-faces").locator("figure")).toHaveCount(1);
  await page.getByTestId("words-scope-all").click();
  await expect(page.getByTestId("words-send")).toBeDisabled();
  const before = await page.getByTestId("words-faces").innerHTML();

  const said = "人を全部、手を出す姿勢にして、真剣な顔にして";
  await page.getByTestId("words-text").fill(said);
  await page.waitForTimeout(400);
  await page.getByTestId("words-send").click();
  await expect(page.getByTestId("words-wait")).toContainText("作り直しています（30 秒〜1 分）");
  await expect(page.getByTestId("words-done")).toContainText("版 2");
  await expect(page.getByTestId("words-done")).toContainText("あと 4 回");
  expect(asked).toEqual({ text: said, frame: null });
  await expect(page.getByTestId("fix-version")).toHaveText("今は版 2");
  await expect(page.getByTestId("words-faces")).toHaveAttribute("data-version", "2");
  expect(await page.getByTestId("words-faces").innerHTML()).not.toBe(before);
  // 監修者の画面には数字の列や JSON を出さない
  await expect(page.getByTestId("words")).not.toContainText("keyframes");
  await page.waitForTimeout(600);
  await page.screenshot({ path: test.info().outputPath("rework-done.png"), fullPage: true });

  // 1 つ前の版に戻す（本物の戻す）
  await page.getByTestId("fix-undo").click();
  await expect(page.getByTestId("fix-version")).toHaveText("今は版 3");
  expect(await page.getByTestId("words-faces").innerHTML()).toBe(before);
  const log = (await (await request.get(`/api/t/practice/audit/cards/${id}`)).json()) as { entries: { kind: string; payload: { reason?: string; request?: string } }[] };
  expect(log.entries.some((e) => e.kind === "edit" && e.payload.reason === `言葉で直した: ${said}`)).toBe(true);
  expect(log.entries.some((e) => e.kind === "edit" && e.payload.request === "undo")).toBe(true);
  await page.waitForTimeout(600);
});

test("1 コマを選んで送ると、そのコマの番号が渡る。うまく作れなかったときは、細かい理由を出さずに言い直しを頼む", async ({ page, request }) => {
  const { id } = (await (await request.post("/api/t/practice/cards", { data: { card: sampleCard() } })).json()) as { id: string };
  let asked: { text: string; frame: number | null } | null = null;
  await page.route(`**/api/t/practice/cards/${id}/rework`, async (route) => {
    asked = route.request().postDataJSON();
    await route.fulfill({ status: 502, json: { error: "作り直した絵が 2 回とも形か経路が足りない: motion: keyframes[2].props[1] が範囲の外" } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/t/practice/fix/${id}`);
  await page.getByTestId("fix-mode-words").click();
  await page.getByTestId("words-scope-2").click();
  await page.getByTestId("words-text").fill("検電器を盤に当てているところにして");
  await page.getByTestId("words-send").click();
  await expect(page.getByTestId("words-err")).toContainText("言い方を変えて");
  await expect(page.getByTestId("words-err")).not.toContainText("keyframes");
  expect(asked).toEqual({ text: "検電器を盤に当てているところにして", frame: 2 });
  await expect(page.getByTestId("fix-version")).toHaveText("今は版 1");
  await expect(page.getByTestId("words-text")).toHaveValue("検電器を盤に当てているところにして");
  await page.screenshot({ path: test.info().outputPath("rework-phone.png"), fullPage: true });
});

test("コマを増やした版で増えたコマを選んだまま 1 つ前の版に戻しても、画面は落ちずにカード全体に戻る", async ({ page, request }) => {
  const { id } = (await (await request.post("/api/t/practice/cards", { data: { card: sampleCard() } })).json()) as { id: string };
  await page.route(`**/api/t/practice/cards/${id}/rework`, async (route) => {
    const asked = route.request().postDataJSON() as { text: string };
    const card = sampleCard();
    if (card.motion.kind === "keyframes") {
      const last = card.motion.json.keyframes[3];
      card.motion.json.keyframes.push({ ...structuredClone(last), t: 4, mark: true });
      card.frames.push({ t: 4 });
    }
    const res = await request.put(`/api/t/practice/cards/${id}`, { data: { card, reason: `言葉で直した: ${asked.text}` } });
    await route.fulfill({ json: { ...(await res.json()), rework: { count: 1, left: 4 } } });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/#/t/practice/fix/${id}`);
  await page.getByTestId("fix-mode-words").click();
  await page.getByTestId("words-text").fill("4 コマにして");
  await page.getByTestId("words-send").click();
  await expect(page.getByTestId("fix-version")).toHaveText("今は版 2");
  await expect(page.getByTestId("words-faces").locator("figure")).toHaveCount(4);
  await page.getByTestId("words-scope-3").click();
  await expect(page.getByTestId("words-faces").locator("figure")).toHaveCount(1);

  await page.getByTestId("fix-undo").click();
  await expect(page.getByTestId("fix-version")).toHaveText("今は版 3");
  await expect(page.getByTestId("words-faces").locator("figure")).toHaveCount(3);
  await expect(page.getByTestId("words-scope-all")).toHaveClass(/on/);
  await expect(page.getByTestId("words-scope-3")).toHaveCount(0);
  expect(errors).toEqual([]);
});
