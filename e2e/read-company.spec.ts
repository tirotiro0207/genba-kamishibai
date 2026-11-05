import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";
import { hashPin } from "../src/worker/tenant";
import { freshTenant, login, MARK, sql, toOk } from "./helpers/ok";

// 会社のテナントの新入社員の閲覧画面（088 の残り）: テナントの PIN → 新入社員の役割の PIN で入り、署名済みのカードが出る。
// 見た印は役割と端末の番号の単位で残り、名前は残らない。署名までは架空の会社として進め、そのあと会社のテナントに切り替える。
// PIN は使い捨てのテナントのためにここで作る値で、ほかの場所では使わない

test("会社のテナントの閲覧画面は、テナントの PIN と新入社員の PIN で入り、見た印が端末の単位で残る", async ({ page, request }) => {
  const T = freshTenant("r088c", "閲覧の確認（会社）");
  const api = `/api/t/${T}`;
  const id = ((await (await request.post(`${api}/cards`, { data: { card: { ...sampleCard(), rule: "088e2e 会社の閲覧" } } })).json()) as { id: string }).id;
  await toOk(request, T, [id]);
  const sup = { "x-role": await login(request, T, "supervisor") };
  expect((await request.post(`${api}/cards/${id}/sign`, { headers: sup, data: { version: 1, mark: MARK } })).status()).toBe(200);

  const tenantPin = String(Date.now()).slice(-8);
  const newhirePin = tenantPin.split("").reverse().join("");
  sql(`UPDATE tenants SET kind = 'company', pin_hash = '${await hashPin(tenantPin)}' WHERE id = '${T}'`);
  sql(`INSERT INTO people (tenant_id, role, slot, pin_hash) VALUES ('${T}', 'newhire', 1, '${await hashPin(newhirePin)}')`);
  // しるしが無いと読めない
  expect((await request.get(`${api}/read/cards`)).status()).toBe(401);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/t/${T}/read`);
  await expect(page.getByTestId("tenant-pin")).toHaveAttribute("data-step", "tenant");
  await page.getByTestId("tenant-pin-input").fill(tenantPin);
  await page.waitForTimeout(500);
  await page.getByTestId("tenant-pin-enter").click();
  // 新入社員の画面では役割を選ぶ欄を出さず、ID と PIN を入れる段になる（11/6）
  await expect(page.getByTestId("tenant-pin")).toHaveAttribute("data-step", "student");
  await expect(page.getByTestId("tenant-pin-role")).toHaveCount(0);
  await page.getByTestId("tenant-pin-student").fill("student_V_1");
  await page.getByTestId("tenant-pin-input").fill(newhirePin);
  await page.waitForTimeout(500);
  await page.getByTestId("tenant-pin-enter").click();
  await expect(page.getByTestId("read-card")).toHaveAttribute("data-card", id);
  await page.waitForTimeout(1500);

  const device = await page.evaluate(() => localStorage.getItem("device"));
  expect(device).toMatch(/^[0-9a-f]{16}$/);
  const out = execSync(`npx wrangler d1 execute DB --local --json --command "SELECT actor, views FROM card_views WHERE tenant_id = '${T}'"`, { encoding: "utf-8" });
  const rows = (JSON.parse(out) as { results: { actor: string; views: number }[] }[])[0].results;
  expect(rows).toEqual([{ actor: `newhire.1#${device}`, views: 1 }]);
});
