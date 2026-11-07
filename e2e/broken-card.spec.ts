import { expect, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";
import { freshTenant, sql } from "./helpers/ok";

// 壊れた本文のカードで確認の画面を開いても、画面が白くならず、知らせが出る（#126）。
// 本文は検査を通らない形に D1 へ直接書き換える（保存の口は検査で断るので、口からは作れない）

async function broken(request: import("@playwright/test").APIRequestContext, T: string, patch: string) {
  const res = await request.post(`/api/t/${T}/cards`, { data: { card: sampleCard() } });
  const { id } = (await res.json()) as { id: string };
  sql(`UPDATE cards SET body = ${patch} WHERE id = '${id}'`);
  return id;
}

test("動きが消えた・形の違う本文は、画面の守りが一言と戻る道を出す（白くならない）", async ({ page, request }) => {
  const T = freshTenant("x126", "壊れたカードの確認");
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  const cases = [
    { name: "動きが無い", id: await broken(request, T, "json_remove(body, '$.motion')") },
    { name: "動きの中身が null", id: await broken(request, T, "json_set(body, '$.motion.json', json('null'))") },
    { name: "コマが配列でない", id: await broken(request, T, "json_set(body, '$.motion.json.keyframes', 'x')") },
  ];
  for (const c of cases) {
    await page.goto(`/#/t/${T}/card/${c.id}`);
    await expect(page.getByTestId("screen-error"), c.name).toBeVisible();
    await expect(page.getByTestId("screen-error")).toContainText("この画面を描けませんでした");
    await expect(page.getByTestId("screen-error").getByRole("link", { name: "ホームに戻る" })).toHaveAttribute("href", `#/t/${T}/home`);
  }
  expect(crashes, "守りの外へ例外が漏れていない").toEqual([]);
});

test("人形の数字が範囲の外のカードは、確認の画面は開き、絵だけ「描けない」の代わりの絵になる", async ({ page, request }) => {
  const T = freshTenant("x126b", "範囲の外のカードの確認");
  const id = await broken(request, T, "json_set(body, '$.motion.json.keyframes[0].figures[0].x', 99)");
  await page.goto(`/#/t/${T}/card/${id}`);
  await expect(page.getByTestId("card-check")).toBeVisible();
  await expect(page.locator("svg[data-broken='1']").first()).toBeVisible();
  await expect(page.getByTestId("screen-error")).toHaveCount(0);
});
