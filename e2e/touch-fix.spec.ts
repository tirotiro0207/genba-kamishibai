import { type CDPSession, expect, type Locator, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";

// 直す画面を監修者がタブレット（横向き 1024×768）の指で使う（11/6）。本物のタッチの出来事（CDP の Input.dispatchTouchEvent）で、
// 部品をタップして選ぶ → 枠が出る → 1 本指で引いて動かす → 2 本指で小物を大きくする → 保存 → 1 つ前の版に戻す、を通す
test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, video: { mode: "on", size: { width: 1024, height: 768 } } });

type P = [number, number];
async function touch(cdp: CDPSession, face: Locator, frames: P[][]) {
  const r = (await face.boundingBox())!;
  const pts = (f: P[]) => f.map(([x, y], id) => ({ x: r.x + r.width * x, y: r.y + r.height * y, id }));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(frames[0]) });
  for (const f of frames.slice(1)) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(f) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
const line = (a: P, b: P, n = 8): P[] => Array.from({ length: n + 1 }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
const boxIn = async (face: Locator) => {
  const f = (await face.boundingBox())!;
  const b = (await face.getByTestId("touch-box").boundingBox())!;
  return { x: (b.x - f.x) / f.width, y: (b.y - f.y) / f.height, w: b.width / f.width, h: b.height / f.height };
};

test("タブレット: 部品をタップで選び、指で動かし、2 本指で大きくして保存し、1 つ前の版に戻す", async ({ page, request }) => {
  const res = await request.post("/api/t/practice/cards", { data: { card: sampleCard() } });
  const { id } = (await res.json()) as { id: string };
  // 静止画は流すたびに日時つきの新しい置き場に書き、前の回を上書きしない（e2e/clocks.spec.ts と同じ形）
  const shots = process.env.TOUCH_SHOTS && `${process.env.TOUCH_SHOTS}/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await page.goto(`/#/t/practice/fix/${id}`);
  await expect(page.getByTestId("fix-version")).toHaveText("今は版 1");
  await expect(page.getByTestId("fix-undo")).toBeDisabled();
  if (shots) await page.screenshot({ path: `${shots}/touch-0-before.png` });
  await page.getByTestId("fix-mode-touch").click();
  const face = page.getByTestId("touch-face");
  await expect(face).toBeVisible();
  const cdp = await page.context().newCDPSession(page);

  // 盤（1 コマ目の右下あたり）をタップすると、盤が選ばれて枠が出る
  await touch(cdp, face, [[[0.75, 0.6]]]);
  await expect(page.getByTestId("touch-box")).toBeVisible();
  await expect(page.getByTestId("touch-json")).toHaveAttribute("data-part", "p3");
  const b0 = await boxIn(face);
  // 1 本指で左へ 0.1・上へ 0.05 引く
  await touch(cdp, face, line([0.75, 0.6], [0.65, 0.55]).map((p) => [p]));
  const b1 = await boxIn(face);
  expect(b1.x + b1.w / 2 - (b0.x + b0.w / 2)).toBeCloseTo(-0.1, 1);
  expect(b1.y + b1.h / 2 - (b0.y + b0.h / 2)).toBeCloseTo(-0.05, 1);
  // 2 本指で広げると大きくなる
  const size0 = JSON.parse((await page.getByTestId("touch-json").getAttribute("data-value"))!).size;
  const c = [b1.x + b1.w / 2, b1.y + b1.h / 2];
  await touch(
    cdp,
    face,
    Array.from({ length: 9 }, (_, k): P[] => {
      const d = 0.04 + (0.04 * k) / 8;
      return [
        [c[0] - d, c[1]],
        [c[0] + d, c[1]],
      ];
    }),
  );
  const size1 = JSON.parse((await page.getByTestId("touch-json").getAttribute("data-value"))!).size;
  expect(size1 / size0).toBeCloseTo(2, 0);
  expect((await boxIn(face)).w).toBeGreaterThan(b1.w * 1.5);
  // 監修者に見えるのは言葉だけ（数字の列や JSON を出さない）
  await expect(page.getByTestId("touch-json")).toHaveText(/^大きさ \d+%（動かした）$/);
  expect(await page.getByTestId("fix").textContent()).not.toContain('"kind"');
  if (shots) await page.screenshot({ path: `${shots}/touch-1-moved.png` });

  // 人をタップして選び、向きを左右に入れかえる
  await touch(cdp, face, [[[0.2, 0.5]]]);
  await expect(page.getByTestId("touch-json")).toHaveAttribute("data-part", "p1");
  const f0 = JSON.parse((await page.getByTestId("touch-json").getAttribute("data-value"))!).facing;
  await expect(page.getByTestId("touch-json")).toHaveText(/^向き: (右|左)向き$/);
  await page.getByTestId("touch-flip").tap();
  expect(JSON.parse((await page.getByTestId("touch-json").getAttribute("data-value"))!).facing).not.toBe(f0);

  // 保存すると版が上がり、④ に前後が残る
  await page.getByTestId("touch-save").tap();
  await expect(page.getByTestId("fix-version")).toHaveText("今は版 2");
  const v2 = (await (await request.get(`/api/t/practice/cards/${id}`)).json()) as { body: { motion: { json: { keyframes: { props: { size: number }[]; figures: { facing: string }[] }[] } } } };
  expect(v2.body.motion.json.keyframes[0].props[1].size).toBeCloseTo(size1, 3);
  expect(v2.body.motion.json.keyframes[0].figures[0].facing).not.toBe(f0);
  if (shots) await page.screenshot({ path: `${shots}/touch-2-saved.png` });

  // 1 つ前の版に戻すと、中身は版 1 と同じになり、版は 3 になる（記録は消さない）
  await page.getByTestId("fix-undo").tap();
  await expect(page.getByTestId("fix-version")).toHaveText("今は版 3");
  await expect(page.getByTestId("fix-note")).toContainText("1 つ前の版の中身に戻し");
  const v3 = (await (await request.get(`/api/t/practice/cards/${id}`)).json()) as { body: unknown };
  expect(v3.body).toEqual(sampleCard());
  const audit = await (await request.get(`/api/t/practice/audit/cards/${id}`)).text();
  expect(audit).toContain("指で動かす");
  expect(audit).toContain("元に戻す（版 2 → 版 1 の中身）");
  if (shots) await page.screenshot({ path: `${shots}/touch-3-undone.png` });
});
