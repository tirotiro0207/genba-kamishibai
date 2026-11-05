import { expect, type Page, test } from "@playwright/test";
import { hashPin } from "../src/worker/tenant";
import { freshTenant, sql } from "./helpers/ok";

// 入り直しとログアウト（11/6 作者「監修者を選ぶやつも何もなく」「ログアウトができるかどうか」）。
// テナントの PIN で入り直したら、前の人の役割のしるしが残っていても役割を選ぶ段を必ず出す。
// ホームとキャラクターを作る画面に「ログアウト」があり、押すとテナントの PIN からやり直す。
// PIN は使い捨てのテナントのためにここで作る値で、ほかの場所では使わない

async function tenantPin(page: Page, pin: string) {
  await expect(page.getByTestId("tenant-pin")).toHaveAttribute("data-step", "tenant");
  await page.getByTestId("tenant-pin-input").fill(pin);
  await page.waitForTimeout(400);
  await page.getByTestId("tenant-pin-enter").click();
  await expect(page.getByTestId("tenant-pin")).toHaveAttribute("data-step", "role");
}

async function asRole(page: Page, value: string, pin: string) {
  await page.getByTestId("tenant-pin-role").click();
  await page.getByTestId(`tenant-pin-role-${value}`).click();
  await page.getByTestId("tenant-pin-input").fill(pin);
  await page.waitForTimeout(400);
  await page.getByTestId("tenant-pin-enter").click();
}

test("テナントの PIN で入り直すと役割を必ず選び直し、ホームのログアウトで入口に戻る", async ({ page }) => {
  test.setTimeout(90_000);
  const T = freshTenant("out", "入り直しとログアウトの確認（会社）");
  const base = Date.now() % 1_000_000;
  const pin = { tenant: String(11_000_000 + base), author: String(41_000_000 + base), supervisor: String(21_000_000 + base) };
  sql(`UPDATE tenants SET kind = 'company', pin_hash = '${await hashPin(pin.tenant)}' WHERE id = '${T}'`);
  for (const [role, p] of [["author", pin.author], ["supervisor", pin.supervisor]])
    sql(`INSERT INTO people (tenant_id, role, slot, pin_hash) VALUES ('${T}', '${role}', 1, '${await hashPin(p)}')`);

  await page.goto(`/#/t/${T}/home`);
  await tenantPin(page, pin.tenant);
  await asRole(page, "author.1", pin.author);
  // キャラクターをまだ持っていないので作る画面。ここにもログアウトがある
  await expect(page.getByText("作者として入っています")).toBeVisible();
  await expect(page.getByTestId("home-logout")).toBeVisible();

  // テナントの入室だけが切れた形（役割のしるしは残る）。前は役割の段が飛ばされて作者のまま入っていた
  await page.evaluate((t) => sessionStorage.removeItem(`token:${t}`), T);
  await page.reload();
  await tenantPin(page, pin.tenant);
  expect(await page.evaluate((t) => sessionStorage.getItem(`role:${t}`), T)).toBeNull();
  await asRole(page, "supervisor.1", pin.supervisor);
  await expect(page.getByText("監修者として入っています")).toBeVisible();

  // ログアウト → テナントの PIN から
  await page.getByTestId("home-logout").click();
  await expect(page.getByTestId("tenant-pin")).toHaveAttribute("data-step", "tenant");
  expect(await page.evaluate((t) => [sessionStorage.getItem(`token:${t}`), sessionStorage.getItem(`role:${t}`)], T)).toEqual([null, null]);
});
