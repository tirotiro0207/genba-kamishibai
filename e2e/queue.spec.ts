import { expect, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";
import { canonical, entryHash } from "../src/shared/audit";
import { AGENT } from "../src/shared/verify/formal";
import { freshTenant, login, sql, sqlFile } from "./helpers/ok";

// 確認待ちの列と仕分けの入れ替え（061）: 赤のカードが列の先頭に来る → 監修者が仕分けの一覧の「する／しない」を入れ替える → 読み直しても残っている。
// 本物の Claude API は呼ばない。帯はテスト用の確かめる AI の証拠、仕分けの一覧は手元の D1 に書いた 3 ページ（架空の文）。
// 録画の絵は仮（※取り直しの対象）

/** 帯を決めた証拠を、テナントの監査の連鎖に正しいハッシュで足す（最後のカードの最後の行が連鎖の先頭である前提） */
async function addBands(request: import("@playwright/test").APIRequestContext, tenant: string, cards: [string, "red" | "yellow" | "green"][]) {
  const last = (await (await request.get(`/api/t/${tenant}/audit/cards/${cards[cards.length - 1][0]}`)).json()) as { entries: { chain: string; n: number; hash: string }[] };
  const tip = last.entries[last.entries.length - 1];
  let prev = tip.hash;
  let n = tip.n;
  const lines: string[] = [];
  for (const [id, band] of cards) {
    const rate = band === "red" ? 40 : band === "yellow" ? 70 : 95;
    const evidence = { agent: AGENT, model: "e2e", frames: 3, cited: [1], rate, band, dangerous: false, reason: "テスト用の証拠（本物の AI は呼んでいない）", points: [{ id: "s1", credit: "full", frame: 1, reason: "r" }], reading: { frames: [], meaning: "", do: "", dont: null, why_guess: null, confidence: 50 } };
    const payload = { version: 1, evidence, png_sha256: [] as string[] };
    const row = { tenant_id: tenant, chain: tip.chain, n: ++n, card_id: id, kind: "verify" as const, actor: AGENT, payload, created_at: new Date().toISOString(), prev_hash: prev };
    const hash = await entryHash(row);
    lines.push(`INSERT INTO audit_log (tenant_id, chain, n, card_id, kind, actor, payload, created_at, prev_hash, hash) VALUES ('${tenant}', '${tip.chain}', ${row.n}, '${id}', 'verify', '${AGENT}', '${canonical(payload).replaceAll("'", "''")}', '${row.created_at}', '${prev}', '${hash}');`);
    prev = hash;
  }
  sqlFile(lines.join("\n"));
}

test("確認待ちの列は赤が先頭で、仕分けの一覧を入れ替えると保存される", async ({ page, request }) => {
  test.setTimeout(180_000);
  const T = freshTenant("q061", "確認待ちの確認");
  const ids: string[] = [];
  for (const rule of ["緑のカード（よく伝わる）", "黄のカード（半分伝わる）", "赤のカード（伝わらない）"]) {
    const res = await request.post(`/api/t/${T}/cards`, { data: { card: { ...sampleCard(), rule } } });
    expect(res.status()).toBe(201);
    ids.push(((await res.json()) as { id: string }).id);
  }
  await addBands(request, T, [[ids[0], "green"], [ids[1], "yellow"], [ids[2], "red"]]);
  sql(`INSERT INTO night_runs (id, tenant_id, doc, pages) VALUES ('${T}-n', '${T}', 'manual', 3)`);
  sql(
    `INSERT INTO night_pages (run_id, tenant_id, page, state, card, reason) VALUES ('${T}-n', '${T}', 1, 'done', 0, '目次だけで決まりが無い'), ('${T}-n', '${T}', 2, 'done', 1, '保護具を着ける決まりがある'), ('${T}-n', '${T}', 3, 'done', 0, '会社の方針の紹介だけ')`,
  );

  const token = await login(request, T, "supervisor", 1);
  await page.goto("/");
  await page.evaluate(([t, tok]) => sessionStorage.setItem(`role:${t}`, tok), [T, token]);
  await page.goto(`/#/t/${T}/queue`);

  // 1. 赤のカードが列の先頭、緑が最後
  const items = page.getByTestId("queue-item");
  await expect(items).toHaveCount(3);
  await expect(items.first()).toHaveAttribute("data-band", "red");
  await expect(items.last()).toHaveAttribute("data-band", "green");
  await page.waitForTimeout(1500);

  // 2. 3 ページ目を「する」に入れ替える（理由つき）
  const row3 = page.locator('[data-testid="sort-row"][data-page="3"]');
  await expect(row3).toHaveAttribute("data-card", "no");
  await page.getByTestId("swap-why").fill("安全の方針の 1 行は作業員の行動になる");
  await row3.getByTestId("sort-swap").click();
  await expect(row3).toHaveAttribute("data-card", "yes");
  await expect(row3).toContainText("入れ替えた");
  await page.waitForTimeout(1500);

  // 3. 読み直しても入れ替えたまま（保存されている）
  await page.reload();
  await expect(page.locator('[data-testid="sort-row"][data-page="3"]')).toHaveAttribute("data-card", "yes");
  await expect(page.locator('[data-testid="sort-row"][data-page="3"]')).toContainText("安全の方針の 1 行は作業員の行動になる");
  await page.waitForTimeout(1500);
});
