import { expect, type Page, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";
import { hashPin } from "../src/worker/tenant";
import { freshTenant, sql } from "./helpers/ok";

// 新入社員の入り方と、押していってたどり着く経路（11/6 作者）。
// 会社のテナントで、教育担当が参加者 0 人の交差の回を作り、見せるものを結ぶ。新入社員は入口（ホーム）で「新入社員」を選んで
// 「次へ」を押し、ID（student_V_1 の形）と PIN で入る。ID は前もって作らず、入ったときにその場で決まる。
// 入ると新入社員だけの画面に来て、「テストを はじめる」でその回に加わり ① を受け、終わったら「もどる」で自分の画面に戻る。
// 作る側はホームの「ほかの画面」から試しの回の一覧へ行き、上の帯の「← ホーム」で戻る。
// PIN は使い捨てのテナントのためにここで作る値で、ほかの場所では使わない
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function tenantPin(page: Page, pin: string) {
  await expect(page.getByTestId("tenant-pin")).toHaveAttribute("data-step", "tenant");
  await page.getByTestId("tenant-pin-input").fill(pin);
  await page.waitForTimeout(400);
  await page.getByTestId("tenant-pin-enter").click();
  await expect(page.getByTestId("tenant-pin")).toHaveAttribute("data-step", "role");
}

test("新入社員は ID と PIN で入り、その場で回に加わって ① を受け、自分の画面に戻る。作る側はホームから押して回の一覧に行き、帯で戻る", async ({ browser, page, request }) => {
  test.setTimeout(150_000);
  const T = freshTenant("stu", "新入社員の入り方の確認（会社）");
  const api = `/api/t/${T}`;
  const ids: string[] = [];
  for (const rule of ["stu 検電", "stu 吊り荷"]) {
    const r = await request.post(`${api}/cards`, { data: { card: { ...sampleCard(), rule, words: { ja: "たしかめます。", vi: "kiểm tra" } } } });
    ids.push(((await r.json()) as { id: string }).id);
  }
  const base = Date.now() % 1_000_000;
  const pin = { tenant: String(10_000_000 + base), author: String(40_000_000 + base), trainer: String(30_000_000 + base), newhire: String(50_000_000 + base) };
  sql(`UPDATE tenants SET kind = 'company', pin_hash = '${await hashPin(pin.tenant)}' WHERE id = '${T}'`);
  for (const [role, p] of [["author", pin.author], ["trainer", pin.trainer], ["newhire", pin.newhire]])
    sql(`INSERT INTO people (tenant_id, role, slot, pin_hash) VALUES ('${T}', '${role}', 1, '${await hashPin(p)}')`);
  const tok = ((await (await request.post(`${api}/session`, { data: { pin: pin.tenant } })).json()) as { token: string }).token;
  const auth = { authorization: `Bearer ${tok}` };
  const as = async (role: "author" | "trainer") => ({ ...auth, "x-role": ((await (await request.post(`${api}/login`, { headers: auth, data: { role, slot: 1, pin: pin[role] } })).json()) as { token: string }).token });
  // 参加者 0 人の交差の回を作り、見せるものを結ぶ（作者）
  const au = await as("author");
  const made = await request.post(`${api}/trials`, { headers: au, data: { design: "cross", participants: [] } });
  expect(made.status()).toBe(201);
  const trial = (await made.json()) as { id: string };
  for (const k of ["A", "B"]) expect((await request.put(`${api}/files/pages/${trial.id}-${k}.png`, { headers: { ...au, "content-type": "image/png" }, data: png })).status()).toBe(201);
  expect((await request.put(`${api}/trials/${trial.id}/material`, { headers: au, data: { A: { card: ids[0], page: `pages/${trial.id}-A.png` }, B: { card: ids[1], page: `pages/${trial.id}-B.png` } } })).status()).toBe(201);

  // ── 新入社員（タブレット） ──
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, recordVideo: { dir: test.info().outputPath("student") } });
  const pg = await ctx.newPage();
  await pg.goto(`/#/t/${T}/home`);
  await tenantPin(pg, pin.tenant);
  await pg.getByTestId("tenant-pin-role").click();
  await pg.getByTestId("tenant-pin-role-newhire.1").click();
  // 新入社員を選ぶと、PIN の欄ではなく「次へ」が出る
  await expect(pg.getByTestId("tenant-pin-input")).toHaveCount(0);
  await pg.getByTestId("tenant-pin-next").click();
  await expect(pg.getByTestId("tenant-pin")).toHaveAttribute("data-step", "student");
  // 形の違う ID は入れない
  await pg.getByTestId("tenant-pin-student").fill("student_X_1");
  await pg.getByTestId("tenant-pin-input").fill(pin.newhire);
  await pg.getByTestId("tenant-pin-enter").click();
  await expect(pg.locator(".pin .err")).toContainText("student_V_1");
  await pg.screenshot({ path: test.info().outputPath("student-1-id.png") });
  await pg.getByTestId("tenant-pin-student").fill("student_c_3");
  await pg.getByTestId("tenant-pin-input").fill(pin.newhire);
  await pg.waitForTimeout(400);
  await pg.getByTestId("tenant-pin-enter").click();

  // 新入社員だけの画面（ID は揃えた形で出る）。作る側の画面へのリンクも、戻る帯も無い
  await expect(pg).toHaveURL(new RegExp(`#/t/${T}/student$`));
  await expect(pg.getByTestId("student-id")).toHaveText("student_C_3");
  await expect(pg.getByTestId("student")).toContainText("カンボジア");
  await expect(pg.getByTestId("back-bar")).toHaveCount(0);
  await expect(pg.locator(`a[href*="/home"], a[href*="/queue"], a[href*="/make"]`)).toHaveCount(0);
  await expect(pg.getByTestId("student-test")).toBeEnabled();
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: test.info().outputPath("student-2-home.png") });

  // テストを始めると、その場で回に加わって ① の画面へ
  await pg.getByTestId("student-test").click();
  await expect(pg).toHaveURL(new RegExp(`#/t/${T}/trial/${trial.id}/self/student_C_3$`));
  await expect(pg.getByTestId("back-bar")).toHaveCount(0);
  for (const round of [0, 1]) {
    await pg.getByTestId("self-start").click();
    await expect(pg.getByTestId("self-got")).toBeEnabled();
    await pg.waitForTimeout(300);
    await pg.getByTestId("self-got").click();
    await pg.getByTestId("self-text-ja").fill(`答え ${round}`);
    await pg.getByTestId("self-submit").click();
  }
  await expect(pg.getByTestId("self-done")).toBeVisible();
  await pg.screenshot({ path: test.info().outputPath("student-3-done.png") });
  await pg.getByTestId("self-back").click();
  await expect(pg.getByTestId("student-id")).toHaveText("student_C_3");

  // 「カードを みる」は置かない（11/6 朝 作者。テストの前に答えが分かってしまう）
  await expect(pg.getByTestId("student-read")).toHaveCount(0);

  // 加わった記録は、その回の参加者に組つきで出る（カンボジア・組 1 か 2）
  const tr = await as("trainer");
  const got = (await (await request.get(`${api}/trials/${trial.id}`, { headers: tr })).json()) as { participants: string[]; assignments: { participant: string; group: string; set: number }[] };
  expect(got.participants).toEqual(["student_C_3"]);
  expect(got.assignments[0]).toMatchObject({ participant: "student_C_3", group: "カンボジア" });
  const rows = (await (await request.get(`${api}/trials/${trial.id}/responses`, { headers: tr })).json()) as { responses: { participant: string }[] };
  expect(rows.responses.map((r) => r.participant)).toEqual(["student_C_3", "student_C_3"]);

  // 「おわり（つぎの ひとに わたす）」で、次の人が ID を入れ直す段に戻る
  await pg.getByTestId("student-leave").click();
  await expect(pg.getByTestId("tenant-pin")).toHaveAttribute("data-step", "student");
  await ctx.close();

  // ── 作る側（教育担当） ──
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto("/#/");
  await page.evaluate(([t]) => localStorage.setItem(`avatar:${t}:trainer`, JSON.stringify({ hair: "bob" })), [T]);
  await page.goto(`/#/t/${T}/home`);
  await tenantPin(page, pin.tenant);
  await page.getByTestId("tenant-pin-role").click();
  await page.getByTestId("tenant-pin-role-trainer.1").click();
  await page.getByTestId("tenant-pin-input").fill(pin.trainer);
  await page.waitForTimeout(400);
  await page.getByTestId("tenant-pin-enter").click();
  await expect(page.getByTestId("home")).toBeVisible();
  await expect(page.getByTestId("back-bar")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("student-4-staff-home.png") });
  await page.getByTestId("home-go-trials").click();
  await expect(page.getByTestId("trials")).toBeVisible();
  await expect(page.getByTestId(`trials-row-${trial.id}`)).toContainText("1 人");
  await page.getByTestId(`trials-row-${trial.id}`).click();
  await expect(page.getByTestId(`trials-links-${trial.id}`)).toContainText("見せるものを結ぶ");
  await page.waitForTimeout(800);
  await page.screenshot({ path: test.info().outputPath("student-5-trials.png") });
  // 新しい回: 交差なら 0 人でも作れる
  await page.getByTestId("trials-new").click();
  await page.getByTestId("new-cross").check();
  await expect(page.getByTestId("new-submit")).toBeEnabled();
  await expect(page.getByTestId("back-home")).toHaveText("← ホーム");
  await page.getByTestId("back-home").click();
  await expect(page.getByTestId("home")).toBeVisible();
  // ほかの画面も、押すと開き、帯で戻れる
  for (const k of ["queue", "issue", "make"]) {
    await page.getByTestId(`home-go-${k}`).click();
    await expect(page).toHaveURL(new RegExp(`#/t/${T}/${k}$`));
    await page.getByTestId("back-home").click();
    await expect(page.getByTestId("home")).toBeVisible();
  }
});
