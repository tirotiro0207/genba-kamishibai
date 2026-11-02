import { expect, type Locator, type Page, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";

// 枠と指示の画面（044a）: 指やマウスで枠を描き、大きな欄の文字を確かめてから送る。送った依頼は監査の記録 ④ に残る
async function drawMouse(page: Page, face: Locator, a: [number, number], b: [number, number]) {
  const r = (await face.boundingBox())!;
  await page.mouse.move(r.x + r.width * a[0], r.y + r.height * a[1]);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * ((a[0] + b[0]) / 2), r.y + r.height * ((a[1] + b[1]) / 2), { steps: 5 });
  await page.mouse.move(r.x + r.width * b[0], r.y + r.height * b[1], { steps: 5 });
  await page.mouse.up();
}

/** 指でなぞる（タッチの pointer の出来事を送る） */
async function drawFinger(face: Locator, a: [number, number], b: [number, number]) {
  const r = (await face.boundingBox())!;
  const ev = (p: [number, number]) => ({ pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true, clientX: r.x + r.width * p[0], clientY: r.y + r.height * p[1] });
  await face.dispatchEvent("pointerdown", ev(a));
  for (let k = 1; k <= 6; k++) await face.dispatchEvent("pointermove", ev([a[0] + ((b[0] - a[0]) * k) / 6, a[1] + ((b[1] - a[1]) * k) / 6]));
  await face.dispatchEvent("pointerup", ev(b));
}

const boxOf = async (face: Locator) => {
  const f = (await face.boundingBox())!;
  const b = (await face.getByTestId("fix-box").boundingBox())!;
  return { x: (b.x - f.x) / f.width, y: (b.y - f.y) / f.height, w: b.width / f.width, h: b.height / f.height };
};

test("マウスで枠を描き、文字を確かめてから送ると、④ 人の直しに残る", async ({ page, request }) => {
  const res = await request.post("/api/t/practice/cards", { data: { card: sampleCard() } });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };

  await page.goto(`/#/t/practice/card/${id}`);
  await page.getByTestId("card-show").click();
  await page.getByTestId("card-fix").click();
  await expect(page.getByTestId("fix-draw")).toBeVisible();
  await expect(page.getByTestId("fix-to-confirm")).toBeDisabled();

  // 2 コマ目の盤のあたりを囲む
  await page.getByTestId("fix-frame-1").click();
  const face = page.getByTestId("fix-face");
  await drawMouse(page, face, [0.85, 0.75], [0.55, 0.4]);
  const got = await boxOf(face);
  expect(got.x).toBeCloseTo(0.55, 1);
  expect(got.y).toBeCloseTo(0.4, 1);
  expect(got.w).toBeCloseTo(0.3, 1);
  expect(got.h).toBeCloseTo(0.35, 1);
  // 触れただけでは枠は消えない
  await drawMouse(page, face, [0.2, 0.2], [0.205, 0.205]);
  expect((await boxOf(face)).x).toBeCloseTo(0.55, 1);
  await expect(page.getByTestId("fix-to-confirm")).toBeDisabled();

  // 大きな欄（端末の音声入力で入れたつもりの文）
  const said = "検電器をもっと盤に近づけて、当てているのが分かるようにしたい";
  await page.getByTestId("fix-text").fill(said);
  await page.waitForTimeout(500);
  await page.getByTestId("fix-to-confirm").click();
  await expect(page.getByTestId("fix-quote")).toHaveText(said);
  await expect(page.getByTestId("fix-confirm")).toContainText("2 コマ目");
  await page.waitForTimeout(800);

  // 戻って直してから送る
  await page.getByTestId("fix-back").click();
  await expect(page.getByTestId("fix-text")).toHaveValue(said);
  await page.getByTestId("fix-text").fill(`${said}。人はそのまま`);
  await page.getByTestId("fix-to-confirm").click();
  await expect(page.getByTestId("fix-quote")).toHaveText(`${said}。人はそのまま`);
  await page.getByTestId("fix-send").click();
  await expect(page.getByTestId("fix-sent")).toContainText("④ 人の直し");
  await page.screenshot({ path: test.info().outputPath("fix-sent.png") });

  // 記録に枠と文が残っている
  const log = (await (await request.get(`/api/t/practice/audit/cards/${id}`)).json()) as { entries: { kind: string; payload: { request?: string; frame?: number; text?: string; box?: { x: number } } }[] };
  const row = log.entries.find((e) => e.kind === "edit" && e.payload.request === "redo")!;
  expect(row.payload.frame).toBe(1);
  expect(row.payload.text).toBe(`${said}。人はそのまま`);
  expect(row.payload.box!.x).toBeCloseTo(0.55, 1);
  await page.getByTestId("fix-audit").click();
  await expect(page).toHaveURL(new RegExp(`audit/${id}`));
  await page.waitForTimeout(800);
});

test("スマホの幅で、指でなぞって枠を描ける", async ({ page, request }) => {
  const res = await request.post("/api/t/practice/cards", { data: { card: sampleCard() } });
  const { id } = (await res.json()) as { id: string };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/t/practice/fix/${id}`);
  const face = page.getByTestId("fix-face");
  await drawFinger(face, [0.1, 0.2], [0.5, 0.9]);
  const got = await boxOf(face);
  expect(got.x).toBeCloseTo(0.1, 1);
  expect(got.h).toBeCloseTo(0.7, 1);
  await page.getByTestId("fix-text").fill("人をもう少し大きく");
  await page.getByTestId("fix-to-confirm").click();
  await expect(page.getByTestId("fix-quote")).toHaveText("人をもう少し大きく");
  await page.screenshot({ path: test.info().outputPath("fix-phone.png"), fullPage: true });
});
