import { expect, type Page, test } from "@playwright/test";
import { canonical, entryHash } from "../src/shared/audit";
import { freshTenant, sqlFile } from "./helpers/ok";

// README の画面の写真（126）。架空の会社の種データ（demo/seed.sql）で、横長の 6 枚を docs/img に撮る。
// 入口・経路・閲覧は架空の会社の署名済みのカードをそのまま撮る。カード・確認待ち・署名は、署名済みのカードしか無いので、
// 使い捨ての架空のテナントに同じカードの中身と、そのカードの本物の確かめる AI の結果を写して撮る。API は呼ばない。
// ふだんの録画では流さない。撮る: SHOTS=1 npx playwright test e2e/readme-shots.spec.ts（絵が決まったら撮り直す。※取り直し）
const OUT = "docs/img";

interface Card {
  id: string;
  body: Record<string, unknown>;
  verify: Record<string, unknown> | null;
}

/** 縦に収まらない画面は、全体が横長の 1 枚に入るまで縮めてから撮る（写真のためだけ。画面そのものは変えない） */
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(800);
  // 縮めると折り返しが変わるので、収まるまで 3 回まで測り直す
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => {
      const root = document.documentElement;
      const zoom = Number(root.style.zoom || 1);
      const h = root.scrollHeight * zoom;
      if (h > innerHeight + 1) root.style.zoom = String((zoom * innerHeight) / h);
    });
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: `${OUT}/${name}.png` });
};

test.skip(!process.env.SHOTS, "README の写真を撮るときだけ（SHOTS=1）");
test.use({ viewport: { width: 1280, height: 720 } });

test("README の画面の写真を 6 枚撮る", async ({ page, request }) => {
  test.setTimeout(180_000);
  const list = (await (await request.get("/api/t/demo/cards")).json()) as { cards: { id: string; status: string }[] };
  const signed = list.cards.filter((c) => c.status === "signed").map((c) => c.id);
  expect(signed.length).toBe(10);
  const cards = await Promise.all(signed.map(async (id) => (await (await request.get(`/api/t/demo/cards/${id}`)).json()) as Card));
  const main = cards.find((c) => c.verify) ?? cards[0];

  // 1. 公開デモの入口
  await page.goto("/");
  await expect(page.getByTestId("demo")).toBeVisible();
  await shot(page, "1-entrance");

  // 3. 経路: 絵の部品を押すと、元の文の行が光る
  await page.goto(`/#/t/demo/route/${main.id}`);
  await page.getByTestId("hit-p2").click();
  await expect(page.getByTestId("route-detail")).toHaveAttribute("data-part", "p2");
  await shot(page, "3-route");

  // 使い捨ての架空のテナントに、3 枚の中身と確かめる AI の結果を写す
  const T = freshTenant("shots", "架空の会社（写真）");
  const api = `/api/t/${T}`;
  const picked = cards.filter((c) => c.verify).slice(0, 3);
  const ids: string[] = [];
  for (const c of picked) {
    const res = await request.post(`${api}/cards`, { data: { card: c.body } });
    expect(res.status()).toBe(201);
    const id = ((await res.json()) as { id: string }).id;
    expect((await request.post(`${api}/cards/${id}/status`, { data: { to: "pending" } })).status()).toBe(200);
    ids.push(id);
  }
  const log = (await (await request.get(`${api}/audit/cards/${ids[ids.length - 1]}`)).json()) as { entries: { chain: string; n: number; hash: string }[] };
  const tip = log.entries[log.entries.length - 1];
  let prev = tip.hash;
  let n = tip.n;
  const lines: string[] = [];
  for (const [k, id] of ids.entries()) {
    const payload = { version: 1, evidence: picked[k].verify, png_sha256: [] as string[] };
    const row = { tenant_id: T, chain: tip.chain, n: ++n, card_id: id, kind: "verify" as const, actor: String(picked[k].verify!.agent), payload, created_at: new Date().toISOString(), prev_hash: prev };
    const hash = await entryHash(row);
    lines.push(`INSERT INTO audit_log (tenant_id, chain, n, card_id, kind, actor, payload, created_at, prev_hash, hash) VALUES ('${T}', '${tip.chain}', ${row.n}, '${id}', 'verify', '${row.actor}', '${canonical(payload).replaceAll("'", "''")}', '${row.created_at}', '${prev}', '${hash}');`);
    prev = hash;
  }
  sqlFile(lines.join("\n"));
  // 2. カード（絵と帯）: 確認待ちの 1 枚。未承認の下書きの帯と、確かめる AI の帯が出る
  await page.goto(`/#/t/${T}/card/${ids[0]}`);
  await expect(page.getByTestId("card-rate-band")).toBeVisible();
  await shot(page, "2-card");

  // 4. 確認待ち
  await page.goto(`/#/t/${T}/queue`);
  await expect(page.getByTestId("queue")).toBeVisible();
  await shot(page, "4-queue");

  // 5. 署名: OK にした 1 枚に、監修者が電子印鑑を押したところ（送らない）
  expect((await request.post(`${api}/cards/${ids[0]}/status`, { data: { to: "ok" } })).status()).toBe(200);
  await page.goto(`/#/t/${T}/sign/${ids[0]}`);
  await page.getByTestId("sign-as-1").click();
  await page.getByTestId("sign-press").click();
  await expect(page.getByTestId("sign-submit")).toBeEnabled();
  await shot(page, "5-sign");

  // 6. 閲覧: 新入社員に届く、署名済みのカード
  await page.goto(`/#/t/demo/read`);
  await expect(page.getByTestId("read-card")).toBeVisible();
  await shot(page, "6-read");
});
