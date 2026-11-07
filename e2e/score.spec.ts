import { expect, test } from "@playwright/test";
import { hashPin } from "../src/worker/tenant";
import { freshTenant, sql } from "./helpers/ok";

// 試しの答えの 10 段階の採点（11/7）: 入口は左に作者・右に監修者のタブ。押すとその役割の PIN で入り、答えに点とコメントを残す。
// もう 1 人のタブに移ると、その役割の PIN で入り直し、前の人の点は見えない。PIN はこの使い捨てのテナントのためだけの値
test("採点の入口から作者と監修者がそれぞれ点とコメントを残せる", async ({ page, request }) => {
  const T = freshTenant("score", "採点の確認");
  const api = `/api/t/${T}/trials`;
  const t = (await (await request.post(api, { data: { design: "cross", participants: [{ id: "student_V_1", group: "ベトナム" }, { id: "student_J_1", group: "日本" }] } })).json()) as { id: string };
  await request.post(`${api}/${t.id}/responses`, { data: { participant: "student_J_1", item: "A", ms: 12000, answer: JSON.stringify({ ja: "検電器で確かめてから触る", own: "" }) } });
  await request.post(`${api}/${t.id}/responses`, { data: { participant: "student_V_1", item: "B", ms: 30000, answer: JSON.stringify({ ja: "", own: "Không đứng dưới vật nặng" }) } });

  const base = Date.now() % 1_000_000;
  const pin = { tenant: String(10_000_000 + base), author: String(40_000_000 + base), supervisor: String(20_000_000 + base) };
  sql(`UPDATE tenants SET kind = 'company', pin_hash = '${await hashPin(pin.tenant)}' WHERE id = '${T}'`);
  for (const [role, p] of [["author", pin.author], ["supervisor", pin.supervisor]]) sql(`INSERT INTO people (tenant_id, role, slot, pin_hash) VALUES ('${T}', '${role}', 1, '${await hashPin(p)}')`);

  await page.goto("/#/");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`/#/t/${T}/score`);
  await expect(page.getByTestId("tenant-pin")).toHaveAttribute("data-step", "tenant");
  await page.getByTestId("tenant-pin-input").fill(pin.tenant);
  await page.getByTestId("tenant-pin-enter").click();
  // 入口: 左に作者、右に監修者
  await expect(page.getByTestId("score-tab-author")).toContainText("作者");
  await expect(page.getByTestId("score-tab-supervisor")).toContainText("監修者");

  // 作者のタブ → 作者の PIN → 採点
  await page.getByTestId("score-tab-author").click();
  await page.getByTestId("tenant-pin-input").fill(pin.author);
  await page.getByTestId("tenant-pin-enter").click();
  await expect(page.getByTestId("score-sheet")).toBeVisible();
  const box = page.getByTestId(/^score-r:/).first().getByTestId("score-box");
  await box.locator('[data-score="8"]').click();
  await expect(box).toContainText("残しました");
  await box.getByTestId("score-comment").fill("検電は伝わった");
  await box.getByTestId("score-save").click();
  await expect(box).toContainText("残しました");
  await expect(page.getByTestId("score-done")).toHaveText("1");

  // 監修者のタブ → 監修者の PIN → 作者の点は見えない
  await page.getByTestId("score-tab-supervisor").click();
  await page.getByTestId("tenant-pin-input").fill(pin.supervisor);
  await page.getByTestId("tenant-pin-enter").click();
  await expect(page.getByTestId("score-sheet")).toBeVisible();
  await expect(page.getByTestId("score-done")).toHaveText("0");
  const box2 = page.getByTestId(/^score-r:/).last().getByTestId("score-box");
  await box2.locator('[data-score="3"]').click();
  await expect(box2).toContainText("残しました");
  await expect(page.getByTestId("score-done")).toHaveText("1");
  await page.screenshot({ path: "test-results/score-supervisor.png", fullPage: true });
});
