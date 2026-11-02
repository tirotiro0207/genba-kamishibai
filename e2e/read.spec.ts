import { expect, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";
import { freshTenant, login, MARK, toOk } from "./helpers/ok";

// 新入社員の閲覧画面（028）: 署名済みのカードだけが出て、1 枚ずつ送れる。署名は署名の API でする（052 から、署名の記録の無い
// 署名済みは配らないため）。中身は自前の ID と固定の文だけ（外から来た文字は入れない）

test("署名済みのカードだけを 1 枚ずつ送って見る", async ({ page, request }) => {
  const T = freshTenant("r028", "閲覧の確認");
  const api = `/api/t/${T}`;
  const ids: Record<string, string> = {};
  for (const s of ["draft", "signed1", "signed2", "stopped"]) {
    const res = await request.post(`${api}/cards`, { data: { card: { ...sampleCard(), rule: `028e2e ${s}` } } });
    expect(res.status()).toBe(201);
    ids[s] = ((await res.json()) as { id: string }).id;
  }
  await toOk(request, T, [ids.signed1, ids.signed2, ids.stopped]);
  const sup = { "x-role": await login(request, T, "supervisor") };
  for (const id of [ids.signed1, ids.signed2, ids.stopped]) expect((await request.post(`${api}/cards/${id}/sign`, { headers: sup, data: { version: 1, mark: MARK } })).status()).toBe(200);
  expect((await request.post(`${api}/cards/${ids.stopped}/status`, { headers: sup, data: { to: "stopped" } })).status()).toBe(200);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/t/${T}/read`);
  const seen: string[] = [];
  await expect(page.getByTestId("read-card")).toBeVisible();
  const total = Number((await page.getByTestId("read-pos").innerText()).split("/")[1]);
  for (let i = 0; i < total; i++) {
    seen.push((await page.getByTestId("read-card").getAttribute("data-card"))!);
    await expect(page.getByTestId("read-frames")).toBeVisible();
    if (i < total - 1) await page.getByTestId("read-next").click();
  }
  await expect(page.getByTestId("read-next")).toBeDisabled();
  expect(seen).toContain(ids.signed1);
  expect(seen).toContain(ids.signed2);
  expect(seen).not.toContain(ids.draft);
  expect(seen).not.toContain(ids.stopped);
  await page.screenshot({ path: test.info().outputPath("read-last.png"), fullPage: true });
  await page.getByTestId("read-prev").click();
  await expect(page.getByTestId("read-pos")).toHaveText(`${total - 1} / ${total}`);
});
