import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";

// 新入社員の閲覧画面（028）: 署名済みのカードだけが出て、1 枚ずつ送れる。署名の API は 051a なので、ここでは手元の D1 で署名済みにする
// 中身は自前の ID と固定の文だけ（外から来た文字は入れない）
const sql = (q: string) => execSync(`npx wrangler d1 execute DB --local --command "${q}"`, { stdio: "pipe" });

test("署名済みのカードだけを 1 枚ずつ送って見る", async ({ page, request }) => {
  const tag = `028e2e-${Date.now()}`;
  const ids: Record<string, string> = {};
  for (const s of ["signed1", "draft", "signed2", "stopped"]) {
    const res = await request.post("/api/t/practice/cards", { data: { card: { ...sampleCard(), rule: `${tag} ${s}` } } });
    expect(res.status()).toBe(201);
    ids[s] = ((await res.json()) as { id: string }).id;
  }
  sql(`UPDATE cards SET status = 'signed' WHERE id IN ('${ids.signed1}', '${ids.signed2}'); UPDATE cards SET status = 'stopped' WHERE id = '${ids.stopped}'`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/t/practice/read");
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
