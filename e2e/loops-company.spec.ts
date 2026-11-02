import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { privatePath } from "../src/node/private-dir";
import { routeOf, validateCard, type CardBody } from "../src/shared/card";

// 輪 1・2 を正式な流れで作る（038）。会社のテナントに PIN で入り、資料のページを選んで送り、取り出した決まりを OK して、
// 1 枚ずつ未承認の下書きにする。経路が全部の部品に付き、カードの画面から「枠で囲んで直す」に進めることを確かめる。
// 本物の API を呼ぶ（1 回 約 0.3 USD）ので、LOOPS=1 のときだけ流す。先に scripts/add-company.ts で会社のテナントを作る。
// どのページから・どの決まりを選ぶかは git の外（private/loops/<マス>.json）から読む。マニュアルの文はここに書かない。
const TENANT = "company";
const CONF = privatePath("loops", "038.json");
const PINS = privatePath("tenants", `${TENANT}.json`);

interface Conf {
  doc: string;
  loops: { loop: number; pages: number[]; pick: string[] }[];
}

test.skip(!process.env.LOOPS, "本物の API を呼ぶので LOOPS=1 のときだけ流す");
test.setTimeout(15 * 60_000);

async function draw(page: Page) {
  const face = page.getByTestId("fix-face");
  const r = (await face.boundingBox())!;
  await page.mouse.move(r.x + r.width * 0.3, r.y + r.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.5, r.y + r.height * 0.5, { steps: 5 });
  await page.mouse.move(r.x + r.width * 0.7, r.y + r.height * 0.7, { steps: 5 });
  await page.mouse.up();
}

test("輪 1・2 を会社のテナントで未承認の下書きにし、経路が付き、画面で直せる", async ({ page, request }) => {
  expect(existsSync(CONF) && existsSync(PINS), "private/loops/038.json と private/tenants/company.json が要る").toBe(true);
  const conf = JSON.parse(readFileSync(CONF, "utf-8")) as Conf;
  const pins = JSON.parse(readFileSync(PINS, "utf-8")) as { pin: string };

  // 資料のページ（031b で文字にしたもの）を、会社のテナントの非公開の置き場に入れる
  const s = await request.post(`/api/t/${TENANT}/session`, { data: { pin: pins.pin } });
  expect(s.status()).toBe(200);
  const auth = { authorization: `Bearer ${((await s.json()) as { token: string }).token}` };
  const dir = privatePath("pdf", conf.doc);
  await request.put(`/api/t/${TENANT}/files/pdf/${conf.doc}/index.json`, { headers: auth, data: JSON.parse(readFileSync(`${dir}/index.json`, "utf-8")) });
  for (const p of conf.loops.flatMap((l) => l.pages)) {
    const name = `p${String(p).padStart(3, "0")}.json`;
    const put = await request.put(`/api/t/${TENANT}/files/pdf/${conf.doc}/${name}`, { headers: auth, data: JSON.parse(readFileSync(`${dir}/${name}`, "utf-8")) });
    expect(put.ok()).toBe(true);
  }
  // 入ったしるしが無いと、ほかのテナントの置き場と同じく読めない
  expect((await request.get(`/api/t/${TENANT}/files?prefix=pdf/`)).status()).toBe(401);

  // 画面: PIN で入る
  await page.goto(`/#/t/${TENANT}/make`);
  await expect(page.getByTestId("tenant-pin")).toBeVisible();
  await page.getByTestId("tenant-pin-input").fill(pins.pin);
  await page.getByTestId("tenant-pin-enter").click();
  await expect(page.getByTestId("make-input")).toBeVisible();

  const made: { loop: number; card: string; status: string; parts: number; rules: number; ms: number }[] = [];
  // LOOP_ONLY=2 のように番号を渡すと、その輪だけ流す（流し直しで同じ輪のカードを増やさない）
  const only = process.env.LOOP_ONLY?.split(",").map(Number);
  for (const l of conf.loops.filter((x) => !only || only.includes(x.loop))) {
    const t0 = Date.now();
    await page.goto(`/#/t/${TENANT}/make`);
    await page.reload();
    await page.getByTestId("mode-doc").click();
    await page.getByTestId("doc").selectOption(conf.doc);
    await page.getByTestId("pages").fill(l.pages.join(","));
    await page.getByTestId("to-confirm").click();
    await expect(page.getByTestId("confirm-text").locator("li").first()).toBeVisible();
    await page.waitForTimeout(600);
    await page.getByTestId("send").click();
    await expect(page.getByTestId("make-review")).toBeVisible({ timeout: 5 * 60_000 });

    // 手がかりの言葉を含む最初の決まりを選ぶ。どこからを押して元の行が光ることも見せる
    const texts = await page.getByTestId("rules").locator(".make-text").allTextContents();
    const i = texts.findIndex((t) => l.pick.some((k) => t.includes(k)));
    expect(i, `輪 ${l.loop}: 手がかりの言葉を含む決まりが無い（決まり ${texts.length}）`).toBeGreaterThanOrEqual(0);
    await page.getByTestId(`from-${i}`).click();
    await expect(page.getByTestId("source").locator("li[data-lit]").first()).toBeVisible();
    await page.waitForTimeout(800);
    await page.getByTestId(`ok-${i}`).check();
    await page.getByTestId("save-ok").click();
    await expect(page.getByTestId("make-done")).toBeVisible();

    // 作成（034a）: 未承認の下書きが 1 枚できる
    await page.getByTestId(`make-${i}`).click();
    await expect(page.getByTestId(`card-link-${i}`)).toBeVisible({ timeout: 6 * 60_000 });
    await page.getByTestId(`card-link-${i}`).click();
    const card = page.getByTestId("card");
    await expect(card).toBeVisible();
    const id = (await card.getAttribute("data-card"))!;
    const status = (await card.getAttribute("data-status"))!;
    expect(["draft", "ai_draft"]).toContain(status);
    await expect(card).toContainText(status === "draft" ? "未承認の下書き" : "AI 下書き");
    await page.waitForTimeout(800);
    await page.getByTestId("card-next").click();
    await page.waitForTimeout(800);

    // 経路: 全部の部品に、文と元の位置がある
    const body = ((await (await request.get(`/api/t/${TENANT}/cards/${id}`, { headers: auth })).json()) as { body: CardBody }).body;
    expect(validateCard(body)).toEqual([]);
    for (const p of body.parts) expect(routeOf(body, p.id)?.sources.length ?? 0, `部品 ${p.id} の経路`).toBeGreaterThan(0);
    await page.getByTestId("card-show").click();
    await page.getByTestId("card-route").click();
    await page.getByTestId(`part-${body.parts[0].id}`).click();
    await expect(page.getByTestId("route-sources")).not.toBeEmpty();
    await page.waitForTimeout(1200);

    // 画面で直せる: 枠で囲んで指示を送ると ④ 人の直しに残る
    await page.goto(`/#/t/${TENANT}/fix/${id}`);
    await expect(page.getByTestId("fix-draw")).toBeVisible();
    await draw(page);
    await page.getByTestId("fix-text").fill("この部分をもっと大きく、はっきり見えるようにしたい");
    await page.getByTestId("fix-to-confirm").click();
    await page.getByTestId("fix-send").click();
    await expect(page.getByTestId("fix-sent")).toContainText("④ 人の直し");
    await page.waitForTimeout(800);

    made.push({ loop: l.loop, card: id, status, parts: body.parts.length, rules: texts.length, ms: Date.now() - t0 });
  }

  // 結果は数だけ（中身は手元の D1 にある）
  mkdirSync(privatePath("loops"), { recursive: true });
  writeFileSync(privatePath("loops", `038-result-${Date.now()}.json`), JSON.stringify({ at: new Date().toISOString(), made }, null, 2), "utf-8");
  console.log(made.map((m) => `輪 ${m.loop}: ${m.status}・部品 ${m.parts}・決まり ${m.rules} から 1 つ・${(m.ms / 1000).toFixed(0)} 秒`).join("\n"));
});
