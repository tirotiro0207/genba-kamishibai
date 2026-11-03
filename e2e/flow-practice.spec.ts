import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { canonical, entryHash } from "../src/shared/audit";
import { AGENT } from "../src/shared/verify/formal";
import { sampleCard } from "../tests/fixtures/card";
import { login, sqlFile } from "./helpers/ok";

// 練習用テナントで通しの録画（065a）: 取り出し → 人形 → 赤 → 直し → 緑 → 経路 → 署名 → 裏から配れない → 新入社員の画面 → 記録アプリ。
// 本物の Claude API は呼ばない。取り出しは差し替えの答え、人形は見本のカード、確かめる AI の赤と緑はテスト用の証拠を監査の連鎖に足す。
// 中身は架空の例。録画の絵は仮（※取り直し）
const T = "practice";
const api = `/api/t/${T}`;
const RULE = "盤に触る前に、検電器で電気が来ていないか確かめる";
const RULES = [
  { kind: "do", text: RULE, from: { quote: RULE, line: 1, line_end: 1, found: true }, where: { page: null, line: 1 }, reasons: [{ text: "感電する", from: { quote: "感電するから", line: 2, line_end: 2, found: true }, stated: true, where: { page: null, line: 2 } }], checklist: false, reworded: false },
];
const PAGE = ["第 3 章 盤の作業", "1. 作業の前", "", "", "", "", "", "", "", "", "", "盤に触る前に、検電器で", "電気が来ていないか確かめる。", "2. 作業の後", "", ""];

/** テスト用の確かめる AI の証拠（赤か緑）を、テナントの監査の連鎖の先頭に正しいハッシュで足す */
async function addEvidence(request: APIRequestContext, id: string, version: number, band: "red" | "green") {
  const log = (await (await request.get(`${api}/audit/cards/${id}`)).json()) as { entries: { chain: string; n: number; hash: string }[] };
  const tip = log.entries[log.entries.length - 1];
  const rate = band === "red" ? 40 : 95;
  const evidence = { agent: AGENT, model: "e2e", frames: 3, cited: [1, 2, 3], rate, band, dangerous: false, reason: "テスト用の証拠（本物の AI は呼んでいない）", points: [{ id: "s1", credit: band === "red" ? "none" : "full", frame: 1, reason: "r" }], reading: { frames: [], meaning: "", do: "", dont: null, why_guess: null, confidence: 50 } };
  const payload = { version, evidence, png_sha256: [] as string[] };
  const row = { tenant_id: T, chain: tip.chain, n: tip.n + 1, card_id: id, kind: "verify" as const, actor: AGENT, payload, created_at: new Date().toISOString(), prev_hash: tip.hash };
  const hash = await entryHash(row);
  sqlFile(`INSERT INTO audit_log (tenant_id, chain, n, card_id, kind, actor, payload, created_at, prev_hash, hash) VALUES ('${T}', '${tip.chain}', ${row.n}, '${id}', 'verify', '${AGENT}', '${canonical(payload).replaceAll("'", "''")}', '${row.created_at}', '${tip.hash}', '${hash}');`);
}

const pause = (page: Page, ms = 1200) => page.waitForTimeout(ms);

// 押せないものを長く待たない（1 本が長いので、どこで止まったかをすぐ出す）
test.use({ actionTimeout: 15_000 });

test("練習用テナントで、取り出しから記録アプリまでを 1 本で通す", async ({ page, request }) => {
  test.setTimeout(240_000);
  // 取り出しの呼び出しは差し替え。経路の画面の元の文（資料のページと話した言葉）も差し替える
  await page.route(`**${api}/extract`, (r) => r.fulfill({ status: 201, json: { id: "flow-065a", rules: RULES } }));
  await page.route(`**${api}/extract/flow-065a/ok`, (r) => r.fulfill({ status: 201, json: { ok: [0] } }));
  await page.route(`**${api}/files/pdf/sample/p003.json`, (r) => r.fulfill({ json: { lines: PAGE.map((text) => ({ text })) } }));
  await page.route(`**${api}/extract/in-1`, (r) => r.fulfill({ json: { id: "in-1", input: { text: "電気が来ていると感電するから、必ず確かめてください。" } } }));

  // 1. 取り出し: 話した言葉を入れ、取り出した決まりを OK する
  await page.goto(`/#/t/${T}/make`);
  await page.getByTestId("speech").fill(`${RULE}。\n感電するから。`);
  await page.getByTestId("to-confirm").click();
  await page.getByTestId("send").click();
  await expect(page.getByTestId("make-review")).toBeVisible();
  await page.getByTestId("from-0").click();
  await pause(page);
  await page.getByTestId("ok-0").check();
  await page.getByTestId("save-ok").click();
  await expect(page.getByTestId("make-done")).toContainText("1 項目");
  await pause(page);

  // 2. 人形: OK した決まりのカード（作成の AI の代わりに見本のカード）
  const { id } = (await (await request.post(`${api}/cards`, { data: { card: { ...sampleCard(), rule: RULE } } })).json()) as { id: string };
  const other = ((await (await request.post(`${api}/cards`, { data: { card: { ...sampleCard(), rule: "065a 署名していないカード" } } })).json()) as { id: string }).id;
  await page.goto(`/#/t/${T}/card/${id}`);
  await expect(page.getByTestId("card-band")).toHaveAttribute("data-status", "draft");
  for (let k = 0; k < 2; k++) {
    await page.getByTestId("card-next").click();
    await pause(page, 700);
  }

  // 3. 赤: 確かめる AI が伝わる率 40%（テスト用の証拠）
  expect((await request.post(`${api}/cards/${id}/status`, { data: { to: "pending" } })).status()).toBe(200);
  await addEvidence(request, id, 1, "red");
  await page.reload();
  await expect(page.getByTestId("card-rate-band")).toHaveAttribute("data-band", "red");
  await pause(page);

  // 4. 直し: 枠を描いて「ここをこうしたい」を送り、人の腕を手で動かして保存する（版 2）
  await page.goto(`/#/t/${T}/fix/${id}`);
  await page.getByTestId("fix-frame-1").click();
  const face = page.getByTestId("fix-face");
  const fb = (await face.boundingBox())!;
  await page.mouse.move(fb.x + fb.width * 0.55, fb.y + fb.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(fb.x + fb.width * 0.85, fb.y + fb.height * 0.75, { steps: 8 });
  await page.mouse.up();
  await page.getByTestId("fix-text").fill("検電器を盤に当てているのが分かるようにしたい");
  await page.getByTestId("fix-to-confirm").click();
  await page.getByTestId("fix-send").click();
  await expect(page.getByTestId("fix-sent")).toBeVisible();
  await pause(page);
  // 同じアドレスへの移動では画面が作り直されないので、部品を動かす画面を直に開く
  await page.goto(`/#/t/${T}/pose/${id}`);
  const pf = (await page.getByTestId("pose-face").boundingBox())!;
  await page.mouse.click(pf.x + pf.width * 0.2, pf.y + pf.height * 0.45);
  await page.getByTestId("pose-arm_near_upper").fill("100");
  await pause(page, 600);
  await page.getByTestId("pose-save").click();
  await expect(page.getByTestId("pose-saved")).toContainText("版 2");
  await pause(page);

  // 5. 緑: 直した版を確かめ直す（テスト用の証拠）→ OK
  expect((await request.post(`${api}/cards/${id}/status`, { data: { to: "pending" } })).status()).toBe(200);
  await addEvidence(request, id, 2, "green");
  await page.goto(`/#/t/${T}/card/${id}`);
  await expect(page.getByTestId("card-rate-band")).toHaveAttribute("data-band", "green");
  await page.getByTestId("card-ok").click();
  await expect(page.getByTestId("card")).toHaveAttribute("data-status", "ok");
  await pause(page);

  // 6. 経路: 絵の部品を押すと、元の文の行が光る
  await page.goto(`/#/t/${T}/route/${id}`);
  await page.getByTestId("hit-p2").click();
  await expect(page.getByTestId("route-detail")).toHaveAttribute("data-part", "p2");
  await pause(page, 900);
  await page.getByTestId("route-next-part").click();
  await expect(page.getByTestId("route-detail")).toHaveAttribute("data-part", "p3");
  await pause(page);

  // 7. 署名: 監修者 1 が電子印鑑で署名する
  await page.goto(`/#/t/${T}/sign/${id}`);
  await page.getByTestId("sign-as-1").click();
  await page.getByTestId("sign-press").click();
  await pause(page, 600);
  await page.getByTestId("sign-submit").click();
  await expect(page.getByTestId("sign-done")).toContainText("署名しました");
  await pause(page);

  // 8. 裏から配れない: 署名していないカードは、新入社員の口から取れない
  const nh = { "x-role": await login(request, T, "newhire") };
  expect((await request.get(`${api}/read/cards/${other}`, { headers: nh })).status()).not.toBe(200);
  expect((await request.get(`${api}/read/cards/${id}`, { headers: nh })).status()).toBe(200);

  // 9. 新入社員の画面: 署名済みのカードだけが 1 枚ずつ出る
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/");
  await page.evaluate(([t, tok]) => sessionStorage.setItem(`role:${t}`, tok), [T, nh["x-role"]]);
  await page.goto(`/#/t/${T}/read`);
  await expect(page.getByTestId("read-card")).toBeVisible();
  const shown = new Set<string>();
  const total = Number((await page.getByTestId("read-pos").innerText()).split("/")[1]);
  for (let k = 0; k < total; k++) {
    shown.add((await page.getByTestId("read-card").getAttribute("data-card"))!);
    if (shown.has(id)) break;
    await page.getByTestId("read-next").click();
  }
  expect(shown.has(id)).toBe(true);
  expect(shown.has(other)).toBe(false);
  await pause(page);

  // 10. 記録アプリ: 回を作り、① の時間を計る
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`/#/t/${T}/trial/new`);
  await page.getByTestId("new-ids").fill("p1 p2");
  await page.getByTestId("new-submit").click();
  await expect(page.getByTestId("new-made")).toBeVisible();
  await pause(page, 800);
  await page.getByTestId("new-time-link").click();
  await page.getByTestId("lane-0-start").click();
  await pause(page, 900);
  await page.getByTestId("lane-0-got").click();
  await expect(page.getByTestId("lane-0-saved")).toBeVisible();
  await pause(page);
});
