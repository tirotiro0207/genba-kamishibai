import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";
import { hashPin } from "../src/worker/tenant";
import { freshTenant, sql, toOk } from "./helpers/ok";

// 総点検（122）で見つかった不具合の直しの確かめ。会社のテナントで、記録アプリ（回を作る・時間を計る・時計 2 つ）を
// テナントの PIN → 役割の PIN の 2 段で開ける（2・3）、閲覧で PIN の画面の前に 401 が出ない（9）、
// 参加者の ID が空なら回を作れない（4）、答えが 0 件の時計は「もう一度」を押せない（7）、絵の上の重なった部品を 2 回押しで選べる（6）。
// PIN は使い捨てのテナントのためにここで作る値で、ほかの場所では使わない

async function companyTenant(request: APIRequestContext, prefix: string) {
  const T = freshTenant(prefix, "総点検の直しの確認（会社）");
  const id = ((await (await request.post(`/api/t/${T}/cards`, { data: { card: { ...sampleCard(), rule: "総点検の直し" } } })).json()) as { id: string }).id;
  await toOk(request, T, [id]);
  const base = Date.now() % 1_000_000;
  const pin = { tenant: String(10_000_000 + base), trainer: String(30_000_000 + base), newhire: String(50_000_000 + base) };
  sql(`UPDATE tenants SET kind = 'company', pin_hash = '${await hashPin(pin.tenant)}' WHERE id = '${T}'`);
  for (const [role, p] of [["trainer", pin.trainer], ["newhire", pin.newhire]])
    sql(`INSERT INTO people (tenant_id, role, slot, pin_hash) VALUES ('${T}', '${role}', 1, '${await hashPin(p)}')`);
  return { T, id, pin };
}

/** 入ったしるしを消して、その画面を開き、2 段で入る。PIN の画面が出るまでに 4xx が出ないことも見る */
async function enter(p: Page, T: string, path: string, role: string | null, tenantPin: string, rolePin: string) {
  await p.goto("/#/");
  await p.evaluate(() => sessionStorage.clear());
  const bad: string[] = [];
  const on = (r: { url(): string; status(): number }) => r.url().includes("/api/") && r.status() >= 400 && bad.push(`${r.status()} ${new URL(r.url()).pathname}`);
  p.on("response", on);
  await p.goto(`/#/t/${T}/${path}`);
  await expect(p.getByTestId("tenant-pin")).toHaveAttribute("data-step", "tenant");
  await p.waitForTimeout(400);
  p.off("response", on);
  expect(bad, "PIN の画面の前の 4xx").toEqual([]);
  await p.getByTestId("tenant-pin-input").fill(tenantPin);
  await p.getByTestId("tenant-pin-enter").click();
  // 閲覧の画面（新入社員）は、ID と PIN を入れる段になる（11/6）
  await expect(p.getByTestId("tenant-pin")).toHaveAttribute("data-step", path === "read" ? "student" : "role");
  if (path === "read") await p.getByTestId("tenant-pin-student").fill("student_J_1");
  if (role) {
    await p.getByTestId("tenant-pin-role").click();
    await p.getByTestId(`tenant-pin-role-${role}`).click();
  }
  await p.getByTestId("tenant-pin-input").fill(rolePin);
  await p.getByTestId("tenant-pin-enter").click();
}

test("会社のテナントで、記録アプリを 2 段の PIN で開いて回を作り、時計 2 つは 0 件と出る", async ({ page, request }) => {
  const { T, pin } = await companyTenant(request, "fx122t");
  await enter(page, T, "trial/new", "trainer.1", pin.tenant, pin.trainer);
  // 参加者の ID が空なら押せない
  await expect(page.getByTestId("new-submit")).toBeDisabled();
  await page.getByTestId("new-ids").fill("p1 p1");
  await expect(page.getByTestId("new-submit")).toBeDisabled();
  await page.getByTestId("new-ids").fill("p1 p2");
  await page.getByTestId("new-submit").click();
  await expect(page.getByTestId("new-made")).toBeVisible();
  await page.waitForTimeout(800);
  // 時間を計る画面も、入ったしるしのまま開ける
  await page.getByTestId("new-time-link").click();
  await expect(page.locator('[data-testid^="lane-"]').first()).toBeVisible();
  const trial = page.url().match(/trial\/([^/]+)\/time/)![1];
  await page.waitForTimeout(800);
  // 答えが 0 件の時計は、0 件と出て「もう一度」は押せない
  await page.goto(`/#/t/${T}/trial/${trial}/clocks`);
  await expect(page.getByTestId("clocks-empty")).toBeVisible();
  await expect(page.getByTestId("clocks-again")).toBeDisabled();
  await page.waitForTimeout(1200);
});

test("会社のテナントの閲覧は、PIN の画面の前に 401 を出さない", async ({ page, request }) => {
  const { T, pin } = await companyTenant(request, "fx122r");
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, T, "read", null, pin.tenant, pin.newhire);
  await expect(page.getByTestId("tenant-pin")).toHaveCount(0);
  await page.waitForTimeout(1200);
});

test("絵の上で小さい部品に重なった大きい部品は、同じ所を 2 回押すと選べる", async ({ page }) => {
  const body = sampleCard();
  await page.route("**/api/t/practice/cards/route-2tap", (r) => r.fulfill({ json: { id: "route-2tap", status: "pending", version: 1, body } }));
  await page.goto("/#/t/practice/route/route-2tap");
  await expect(page.getByTestId("route")).toBeVisible();
  // 人の箱の中に入っている小さい部品を探す
  const boxes = await page.locator('[data-testid^="hit-"]').evaluateAll((els) =>
    els.map((e) => ({ id: e.getAttribute("data-testid")!.slice(4), ...JSON.parse(JSON.stringify(e.getBoundingClientRect())) })),
  );
  const inside = (a: (typeof boxes)[0], b: (typeof boxes)[0]) => a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
  const pair = boxes.flatMap((s) => boxes.filter((b) => b.id !== s.id && b.width * b.height > s.width * s.height && inside(s, b)).map((b) => [s, b] as const))[0];
  expect(pair, "人の箱に重なる小さい部品").toBeTruthy();
  const [small, big] = pair;
  // 選ぶと説明の欄が伸びて絵が動くことがあるので、押すたびに小さい部品の真ん中を測り直す
  const press = async () => {
    const bb = (await page.getByTestId(`hit-${small.id}`).boundingBox())!;
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  };
  await press();
  await expect(page.getByTestId("route-detail")).toHaveAttribute("data-part", small.id);
  await page.waitForTimeout(500);
  await press();
  await expect(page.getByTestId("route-detail")).toHaveAttribute("data-part", big.id);
  await page.waitForTimeout(500);
  await press();
  await expect(page.getByTestId("route-detail")).toHaveAttribute("data-part", small.id);
  await page.waitForTimeout(800);
});
