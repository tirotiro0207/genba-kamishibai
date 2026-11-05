import { expect, type Page, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";
import { hashPin } from "../src/worker/tenant";
import { freshTenant, sql, toOk } from "./helpers/ok";

// 会社のテナントの発行・監査・署名の画面（088 の続き）: 入ったしるしが無いと、テナントの PIN → 役割の PIN の 2 段で入る。
// 作る画面・閲覧画面と同じ部品。カードは架空の会社として OK まで進め、そのあと会社のテナントに切り替える。
// PIN は使い捨てのテナントのためにここで作る値で、ほかの場所では使わない

test("会社のテナントの発行・監査・署名の画面は、テナントの PIN と役割の PIN の 2 段で開ける", async ({ page, request }) => {
  const T = freshTenant("s088c", "発行・監査・署名の確認（会社）");
  const api = `/api/t/${T}`;
  const id = ((await (await request.post(`${api}/cards`, { data: { card: { ...sampleCard(), rule: "088e2e 会社の画面" } } })).json()) as { id: string }).id;
  await toOk(request, T, [id]);

  const base = Date.now() % 1_000_000;
  const pin = { tenant: String(10_000_000 + base), supervisor: String(20_000_000 + base), trainer: String(30_000_000 + base) };
  sql(`UPDATE tenants SET kind = 'company', pin_hash = '${await hashPin(pin.tenant)}' WHERE id = '${T}'`);
  for (const [role, p] of [["supervisor", pin.supervisor], ["trainer", pin.trainer]])
    sql(`INSERT INTO people (tenant_id, role, slot, pin_hash) VALUES ('${T}', '${role}', 1, '${await hashPin(p)}')`);

  /** 入ったしるしを消して、その画面を開き、2 段で入る */
  async function enter(p: Page, path: string, role: string | null, rolePin: string) {
    await p.goto("/#/");
    await p.evaluate(() => sessionStorage.clear());
    await p.goto(`/#/t/${T}/${path}`);
    await expect(p.getByTestId("tenant-pin")).toHaveAttribute("data-step", "tenant");
    await p.getByTestId("tenant-pin-input").fill(pin.tenant);
    await p.waitForTimeout(400);
    await p.getByTestId("tenant-pin-enter").click();
    await expect(p.getByTestId("tenant-pin")).toHaveAttribute("data-step", "role");
    if (role) {
      await p.getByTestId("tenant-pin-role").click();
      await p.getByTestId(`tenant-pin-role-${role}`).click();
    }
    await p.getByTestId("tenant-pin-input").fill(rolePin);
    await p.waitForTimeout(400);
    await p.getByTestId("tenant-pin-enter").click();
  }

  // 発行の画面: 監修者 1
  await enter(page, "issue", "supervisor.1", pin.supervisor);
  await expect(page.getByTestId("issue")).toBeVisible();
  await page.waitForTimeout(1200);

  // 監査の記録: 教育担当
  await enter(page, `audit/${id}`, "trainer.1", pin.trainer);
  await expect(page.getByTestId("audit-chain")).toContainText("書き換え・消した跡は無い");
  await page.waitForTimeout(1200);

  // 署名の画面: 監修者 1（違う役割の PIN では入れない）
  await enter(page, `sign/${id}`, "supervisor.1", pin.trainer);
  await expect(page.getByTestId("tenant-pin")).toContainText("PIN が違う");
  await page.getByTestId("tenant-pin-input").fill(pin.supervisor);
  await page.getByTestId("tenant-pin-enter").click();
  await expect(page.getByTestId("sign")).toHaveAttribute("data-status", "ok");
  await page.waitForTimeout(1200);
});
