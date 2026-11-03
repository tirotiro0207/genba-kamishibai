import { expect, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";
import { freshTenant, sql } from "./helpers/ok";

// 「前回の修正を手本にしました」の表示（087・§5 L7）。下書きの横に、手本にした同じ会社の前の修正の日付と誰（役割）が出る。
// 手本の記録は、作るときに AI を呼ばずに済むよう D1 に直接足す（作るときに残す流れは単体のテスト）。録画の絵は仮（※取り直し）
test("手本にした下書きには「前回の修正（日付・役割）を手本にしました」が出て、手本の無い下書きには出ない", async ({ page, request }) => {
  const T = freshTenant("x087", "手本の表示の確認");
  const api = `/api/t/${T}/cards`;
  const mk = async (rule: string) => ((await (await request.post(api, { data: { card: { ...sampleCard(), rule } } })).json()) as { id: string }).id;
  const src = await mk("ブレーカーを切ってから盤に触る");
  const id = await mk("分電盤を開ける前に検電する");
  const plain = await mk("盤に触る前に検電する");
  sql(`INSERT INTO card_exemplars (tenant_id, card_id, kind, src_card_id, by, at) VALUES ('${T}', '${id}', 'edit', '${src}', 'supervisor.1', '2026-11-03T03:00:00.000Z')`);

  await page.goto(`/#/t/${T}/card/${id}`);
  await expect(page.getByTestId("card-band")).toBeVisible();
  await expect(page.getByTestId("card-used")).toHaveText("前回の修正（11月3日・監修者 1）を手本にしました");
  await page.waitForTimeout(1500);

  await page.goto(`/#/t/${T}/card/${plain}`);
  await expect(page.getByTestId("card-band")).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByTestId("card-used")).toHaveCount(0);
});
