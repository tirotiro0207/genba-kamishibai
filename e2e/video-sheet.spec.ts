import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { privatePath } from "../src/node/private-dir";

// 動画の台本 v3 のデモ（1:05〜1:45）を撮る: 事例シートの写真をチャットに添付 → 厳守事項を元の行の印つきで取り出す →
// 選んだ決まりをカードにする → 確かめる AI に見せる。手元の D1 の会社のテナントで、本物の API を呼ぶ（1 回 約 1〜2 USD）。
// VIDEO_SHEET に写真の場所（git の外）を渡したときだけ流す。撮るのは scripts/video-rec.ts と同じ形（VIDEO=1・E2E_RUNS・E2E_PORT）。
// 作ったカードの番号と、取り出した決まり・確かめる AI の結果は private/rec/video-sheet.json に書く（次の段の直しと署名で使う）
const TENANT = "company";
const IMG = process.env.VIDEO_SHEET ?? "";
const PINS = privatePath("tenants", `${TENANT}.json`);
const OUT = privatePath("rec", "video-sheet.json");
/** 厳守事項の見分け（どれかの言葉を含む決まりだけに印を残す） */
const KEEP = ["KY", "結線図", "検電", "リストアラーム", "アラーム"];

test.skip(!IMG, "本物の API を呼ぶので VIDEO_SHEET を渡したときだけ流す");
test.setTimeout(20 * 60_000);
test.use({ actionTimeout: 20_000 });

const local = <T>(q: string): T[] => {
  const out = execSync(`npx wrangler d1 execute DB --local --json --command "${q.replaceAll('"', '\\"')}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return (JSON.parse(out) as { results: T[] }[])[0].results;
};

test("事例シートの写真から、厳守事項のカードを作り、確かめる AI に見せる", async ({ page }) => {
  expect(existsSync(IMG) && existsSync(PINS), "VIDEO_SHEET の写真と private/tenants/company.json が要る").toBe(true);
  const pins = JSON.parse(readFileSync(PINS, "utf-8")) as { pin: string; people: Record<string, string> };
  // cards.created_at は SQLite の「YYYY-MM-DD HH:MM:SS」（UTC）
  const since = new Date().toISOString().slice(0, 19).replace("T", " ");
  const pause = (ms = 1500) => page.waitForTimeout(ms);

  // PIN で入り、作者として入る
  // 新しいカードの画面は PIN の前でも開くので、先に作る画面で入ってから移る（loops-company.spec.ts と同じ入り方）
  await page.goto(`/#/t/${TENANT}/make`);
  await expect(page.getByTestId("tenant-pin")).toBeVisible();
  await page.getByTestId("tenant-pin-input").fill(pins.pin);
  await page.getByTestId("tenant-pin-enter").click();
  await expect(page.getByTestId("tenant-pin")).toHaveAttribute("data-step", "role");
  await page.getByTestId("tenant-pin-input").fill(pins.people.author1);
  await page.getByTestId("tenant-pin-enter").click();
  await expect(page.getByTestId("make-input")).toBeVisible();
  await page.goto(`/#/t/${TENANT}/new`);
  await expect(page.getByTestId("chat")).toBeVisible();
  await pause();

  // 写真を添付して送る
  await page.getByTestId("chat-file").setInputFiles(IMG);
  await expect(page.getByTestId("chat-attached")).toHaveCount(1, { timeout: 3 * 60_000 });
  await expect(page.getByTestId("chat-err")).toHaveCount(0);
  await page.getByTestId("chat-text").pressSequentially("この事例シートの厳守事項をカードにして", { delay: 60 });
  await pause(800);
  await page.getByTestId("chat-send").click();
  const rules = page.locator(".chat-rule-text");
  await expect(rules.first()).toBeVisible({ timeout: 6 * 60_000 });
  await pause(2500);

  // 厳守事項だけに印を残す
  const texts = await rules.allTextContents();
  const keep = texts.map((t) => KEEP.some((k) => t.includes(k)));
  for (const [i, k] of keep.entries()) {
    if (!k) {
      await page.getByTestId(`chat-rule-${i}`).uncheck();
      await pause(300);
    }
  }
  await pause(1500);
  await page.getByTestId("chat-make").click();
  await expect(page.getByTestId("chat-made")).toBeVisible({ timeout: 12 * 60_000 });
  await pause(2000);

  // 作ったカード（この回より後に会社のテナントにできたもの）
  const cards = local<{ id: string; rule: string; status: string }>(`SELECT id, json_extract(body, '$.rule') AS rule, status FROM cards WHERE tenant_id = '${TENANT}' AND created_at >= '${since}' ORDER BY created_at`);
  expect(cards.length).toBeGreaterThan(0);
  // 検電の決まりのカードを見せる（無ければ最初のカード）
  const main = cards.find((c) => c.rule?.includes("検電")) ?? cards[0];
  await page.goto(`/#/t/${TENANT}/card/${main.id}`);
  await expect(page.getByTestId("card")).toBeVisible();
  await pause(2500);
  await page.getByTestId("card-verify").click();
  await expect(page.getByTestId("card-check")).toHaveAttribute("data-evidence", "1", { timeout: 5 * 60_000 });
  await pause(3000);
  const band = await page.getByTestId("card-band").getAttribute("data-status").catch(() => null);
  const rate = await page.getByTestId("card-rate").textContent().catch(() => null);
  await page.screenshot({ path: test.info().outputPath("verified.png"), fullPage: true });

  mkdirSync(privatePath("rec"), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ at: since, rules: texts, kept: texts.filter((_, i) => keep[i]), cards, main: main.id, band, rate }, null, 2));
});

// 2 段目: 1 段目のカードを、監修者が枠で囲んで直す → 枠の所だけ作り直す → 確かめる AI に見せ直す → 確認に回して OK → 署名 →
// 新入社員の画面で見る。本物の API を呼ぶ（作り直しと確かめ直しで 約 0.2〜0.4 USD）。VIDEO_SHEET_FIX に直しの言葉を渡したときだけ流す
const FIX = process.env.VIDEO_SHEET_FIX ?? "";
/** 枠を描くコマ（0 から）と、枠の場所（絵の幅・高さに対する割合） */
const FIX_FRAME = Number(process.env.VIDEO_SHEET_FRAME ?? 3);
const FIX_BOX = { x0: 0.12, y0: 0.25, x1: 0.55, y1: 0.75 };

test("1 段目のカードを監修者が直して署名し、新入社員の画面に届く", async ({ page, browser }) => {
  test.skip(!FIX || !existsSync(OUT), "VIDEO_SHEET_FIX と、1 段目の private/rec/video-sheet.json が要る");
  const pins = JSON.parse(readFileSync(PINS, "utf-8")) as { pin: string; people: Record<string, string> };
  const first = JSON.parse(readFileSync(OUT, "utf-8")) as { main: string };
  const id = first.main;
  const pause = (ms = 1500) => page.waitForTimeout(ms);

  // 監修者として入る
  await page.goto(`/#/t/${TENANT}/make`);
  await page.getByTestId("tenant-pin-input").fill(pins.pin);
  await page.getByTestId("tenant-pin-enter").click();
  await expect(page.getByTestId("tenant-pin")).toHaveAttribute("data-step", "role");
  await page.getByTestId("tenant-pin-role").click();
  await page.getByTestId("tenant-pin-role-supervisor.1").click();
  await page.getByTestId("tenant-pin-input").fill(pins.people.supervisor1);
  await page.getByTestId("tenant-pin-enter").click();
  await expect(page.getByTestId("make-input")).toBeVisible();

  // 確かめる AI の結果を見せる
  await page.goto(`/#/t/${TENANT}/card/${id}`);
  await expect(page.getByTestId("card-check")).toHaveAttribute("data-evidence", "1");
  await page.getByTestId("card-evidence-reason").scrollIntoViewIfNeeded();
  await pause(3500);

  // 枠で囲んで直す
  await page.goto(`/#/t/${TENANT}/fix/${id}`);
  await expect(page.getByTestId("fix-draw")).toBeVisible();
  await page.getByTestId(`fix-frame-${FIX_FRAME}`).click();
  await pause(800);
  const face = page.getByTestId("fix-face");
  const r = (await face.boundingBox())!;
  await page.mouse.move(r.x + r.width * FIX_BOX.x0, r.y + r.height * FIX_BOX.y0);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * ((FIX_BOX.x0 + FIX_BOX.x1) / 2), r.y + r.height * ((FIX_BOX.y0 + FIX_BOX.y1) / 2), { steps: 8 });
  await page.mouse.move(r.x + r.width * FIX_BOX.x1, r.y + r.height * FIX_BOX.y1, { steps: 8 });
  await page.mouse.up();
  await pause(800);
  await page.getByTestId("fix-text").pressSequentially(FIX, { delay: 50 });
  await pause(800);
  await page.getByTestId("fix-to-confirm").click();
  await pause(1200);
  await page.getByTestId("fix-send").click();
  await expect(page.getByTestId("fix-sent")).toBeVisible();
  await pause(1200);
  await page.getByTestId("fix-redo").click();
  await expect(page.getByTestId("fix-redone")).toBeVisible({ timeout: 5 * 60_000 });
  await pause(3000);
  await page.getByTestId("fix-to-card").click();

  // 確かめる AI に見せ直す → 確認に回す → OK
  await expect(page.getByTestId("card")).toBeVisible();
  await page.getByTestId("card-verify").click();
  await expect(page.getByTestId("card-check")).toHaveAttribute("data-evidence", "1", { timeout: 5 * 60_000 });
  await pause(3000);
  const band2 = await page.getByTestId("card-rate-band").getAttribute("data-band").catch(() => null);
  const rate2 = await page.getByTestId("card-rate").textContent().catch(() => null);
  await page.screenshot({ path: test.info().outputPath("reverified.png"), fullPage: true });
  const result = { ...first, band2, rate2, fix: FIX, frame: FIX_FRAME };
  writeFileSync(OUT.replace(".json", "-2.json"), JSON.stringify(result, null, 2));
  if (await page.getByTestId("card-to-pending").isVisible()) {
    await page.getByTestId("card-to-pending").click();
    await pause(1000);
  }
  await expect(page.getByTestId("card-ok")).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId("card-ok").click();
  await pause(1500);

  // 署名（電子印鑑）
  await page.getByTestId("card-to-sign").click();
  await expect(page.getByTestId("sign")).toBeVisible();
  if (await page.getByTestId("sign-kind-stamp").isVisible().catch(() => false)) await page.getByTestId("sign-kind-stamp").click();
  await pause(1000);
  await page.getByTestId("sign-press").click();
  await pause(1000);
  await page.getByTestId("sign-submit").click();
  await expect(page.getByTestId("sign-done")).toBeVisible();
  await pause(2500);

  // 新入社員の画面（別の端末として、新しい窓で入る）
  const ctx = await browser.newContext({ viewport: { width: 1152, height: 648 }, recordVideo: { dir: test.info().outputPath("read"), size: { width: 1152, height: 648 } }, baseURL: test.info().project.use.baseURL });
  const reader = await ctx.newPage();
  await reader.goto(`/#/t/${TENANT}/read`);
  await reader.getByTestId("tenant-pin-input").fill(pins.pin);
  await reader.getByTestId("tenant-pin-enter").click();
  await expect(reader.getByTestId("tenant-pin")).toHaveAttribute("data-step", "student");
  await reader.getByTestId("tenant-pin-input").fill(pins.people.newhire1);
  await reader.getByTestId("tenant-pin-enter").click();
  await expect(reader.getByTestId("read-card").first()).toBeVisible();
  await reader.waitForTimeout(5000);
  await ctx.close();
});

// 3 段目: 2 段目で確かめる AI が「危ない読み違い」の印を付けたときの続き。監修者が言葉でカード全体を直す → 確かめ直す（緑で危険の印が無くなるまで、
// VIDEO_SHEET_WORDS を「||」で区切った順に最大その数だけ）→ 確認に回して OK → 署名 → 新入社員の画面。本物の API を呼ぶ（1 回 約 0.1 USD）
const WORDS = (process.env.VIDEO_SHEET_WORDS ?? "").split("||").map((x) => x.trim()).filter(Boolean);

test("監修者が言葉で直して確かめ直し、署名して新入社員の画面に届く", async ({ page, browser }) => {
  test.skip(!WORDS.length || !existsSync(OUT), "VIDEO_SHEET_WORDS と、1 段目の private/rec/video-sheet.json が要る");
  const pins = JSON.parse(readFileSync(PINS, "utf-8")) as { pin: string; people: Record<string, string> };
  const id = (JSON.parse(readFileSync(OUT, "utf-8")) as { main: string }).main;
  const pause = (ms = 1500) => page.waitForTimeout(ms);
  await page.goto(`/#/t/${TENANT}/make`);
  await page.getByTestId("tenant-pin-input").fill(pins.pin);
  await page.getByTestId("tenant-pin-enter").click();
  await expect(page.getByTestId("tenant-pin")).toHaveAttribute("data-step", "role");
  await page.getByTestId("tenant-pin-role").click();
  await page.getByTestId("tenant-pin-role-supervisor.1").click();
  await page.getByTestId("tenant-pin-input").fill(pins.people.supervisor1);
  await page.getByTestId("tenant-pin-enter").click();
  await expect(page.getByTestId("make-input")).toBeVisible();

  // 危ない読み違いの印が付いたカード
  await page.goto(`/#/t/${TENANT}/card/${id}`);
  await expect(page.getByTestId("card-check")).toHaveAttribute("data-evidence", "1");
  await page.getByTestId("card-evidence-reason").scrollIntoViewIfNeeded();
  await pause(4000);

  const tries: { words: string; band: string | null; rate: string | null; dangerous: boolean }[] = [];
  for (const words of WORDS) {
    await page.goto(`/#/t/${TENANT}/fix/${id}`);
    await page.getByTestId("fix-mode-words").click();
    await page.getByTestId("words-scope-all").click();
    await page.getByTestId("words-text").pressSequentially(words, { delay: 35 });
    await pause(800);
    await page.getByTestId("words-send").click();
    await expect(page.getByTestId("words-done")).toBeVisible({ timeout: 5 * 60_000 });
    await pause(3000);
    await page.goto(`/#/t/${TENANT}/card/${id}`);
    await expect(page.getByTestId("card")).toBeVisible();
    await page.getByTestId("card-verify").click();
    await expect(page.getByTestId("card-check")).toHaveAttribute("data-evidence", "1", { timeout: 5 * 60_000 });
    await pause(3000);
    const band = await page.getByTestId("card-rate-band").getAttribute("data-band").catch(() => null);
    const rate = await page.getByTestId("card-rate").textContent().catch(() => null);
    const dangerous = ((await page.getByTestId("card-ok").getAttribute("title")) ?? "").includes("危険");
    tries.push({ words, band, rate, dangerous });
    writeFileSync(OUT.replace(".json", "-3.json"), JSON.stringify({ id, tries }, null, 2));
    if (band === "green" && !dangerous) break;
  }
  await page.screenshot({ path: test.info().outputPath("after-words.png"), fullPage: true });
  const last = tries[tries.length - 1];
  expect(last.band === "green" && !last.dangerous, `言葉の直しのあとも緑にならない: ${JSON.stringify(tries)}`).toBe(true);

  if (await page.getByTestId("card-to-pending").isVisible()) {
    await page.getByTestId("card-to-pending").click();
    await pause(1000);
  }
  await expect(page.getByTestId("card-ok")).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId("card-ok").click();
  await pause(1500);
  await page.getByTestId("card-to-sign").click();
  await expect(page.getByTestId("sign")).toBeVisible();
  if (await page.getByTestId("sign-kind-stamp").isVisible().catch(() => false)) await page.getByTestId("sign-kind-stamp").click();
  await pause(1000);
  await page.getByTestId("sign-press").click();
  await pause(1000);
  await page.getByTestId("sign-submit").click();
  await expect(page.getByTestId("sign-done")).toBeVisible();
  await pause(2500);

  const ctx = await browser.newContext({ viewport: { width: 1152, height: 648 }, recordVideo: { dir: test.info().outputPath("read"), size: { width: 1152, height: 648 } }, baseURL: test.info().project.use.baseURL });
  const reader = await ctx.newPage();
  await reader.goto(`/#/t/${TENANT}/read`);
  await reader.getByTestId("tenant-pin-input").fill(pins.pin);
  await reader.getByTestId("tenant-pin-enter").click();
  await expect(reader.getByTestId("tenant-pin")).toHaveAttribute("data-step", "student");
  await reader.getByTestId("tenant-pin-input").fill(pins.people.newhire1);
  await reader.getByTestId("tenant-pin-enter").click();
  await expect(reader.getByTestId("read-card").first()).toBeVisible();
  await reader.waitForTimeout(5000);
  await ctx.close();
});

// 4 段目: 3 段目で言葉の直しは入ったが、確かめ直しが 503 で落ちたときの続き。確かめ直す（503 なら 3 回まで押し直す）→ 緑で危険の印が無ければ
// 確認に回して OK → 署名 → 新入社員の画面。VIDEO_SHEET_SIGN=1 のときだけ流す（本物の API。1 回 約 0.08 USD）
test("確かめ直して署名し、新入社員の画面に届く", async ({ page, browser }) => {
  test.skip(process.env.VIDEO_SHEET_SIGN !== "1" || !existsSync(OUT), "VIDEO_SHEET_SIGN=1 と 1 段目の private/rec/video-sheet.json が要る");
  const pins = JSON.parse(readFileSync(PINS, "utf-8")) as { pin: string; people: Record<string, string> };
  const id = (JSON.parse(readFileSync(OUT, "utf-8")) as { main: string }).main;
  const pause = (ms = 1500) => page.waitForTimeout(ms);
  await page.goto(`/#/t/${TENANT}/make`);
  await page.getByTestId("tenant-pin-input").fill(pins.pin);
  await page.getByTestId("tenant-pin-enter").click();
  await expect(page.getByTestId("tenant-pin")).toHaveAttribute("data-step", "role");
  await page.getByTestId("tenant-pin-role").click();
  await page.getByTestId("tenant-pin-role-supervisor.1").click();
  await page.getByTestId("tenant-pin-input").fill(pins.people.supervisor1);
  await page.getByTestId("tenant-pin-enter").click();
  await expect(page.getByTestId("make-input")).toBeVisible();

  await page.goto(`/#/t/${TENANT}/card/${id}`);
  await expect(page.getByTestId("card")).toBeVisible();
  await pause(2500);
  // 今の版の証拠がもうあれば、確かめ直さない（前の回で確かめた録画がある。もう一度 API を呼ばない）
  let got = (await page.getByTestId("card-check").getAttribute("data-evidence")) === "1";
  for (let k = 0; k < 3 && !got; k++) {
    await page.getByTestId("card-verify").click();
    got = await page.getByTestId("card-check").and(page.locator("[data-evidence='1']")).waitFor({ timeout: 4 * 60_000 }).then(() => true, () => false);
    if (!got) await pause(20_000);
  }
  expect(got, "確かめる AI の証拠が 3 回とも出ない").toBe(true);
  await pause(3000);
  const band = await page.getByTestId("card-rate-band").getAttribute("data-band").catch(() => null);
  const rate = await page.getByTestId("card-rate").textContent().catch(() => null);
  await page.screenshot({ path: test.info().outputPath("reverified.png"), fullPage: true });
  // OK の押し所は確認に回したあとに出る。危険の印はその押し所の title で見る
  if (await page.getByTestId("card-to-pending").isVisible()) {
    await page.getByTestId("card-to-pending").click();
    await pause(1000);
  }
  const dangerous = ((await page.getByTestId("card-ok").getAttribute("title")) ?? "").includes("危険");
  writeFileSync(OUT.replace(".json", "-4.json"), JSON.stringify({ id, band, rate, dangerous }, null, 2));
  expect(band === "green" && !dangerous, `緑にならない: ${band} ${rate} 危険 ${dangerous}`).toBe(true);
  await expect(page.getByTestId("card-ok")).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId("card-ok").click();
  await pause(1500);
  await page.getByTestId("card-to-sign").click();
  await expect(page.getByTestId("sign")).toBeVisible();
  if (await page.getByTestId("sign-kind-stamp").isVisible().catch(() => false)) await page.getByTestId("sign-kind-stamp").click();
  await pause(1000);
  await page.getByTestId("sign-press").click();
  await pause(1000);
  await page.getByTestId("sign-submit").click();
  await expect(page.getByTestId("sign-done")).toBeVisible();
  await pause(2500);

  const ctx = await browser.newContext({ viewport: { width: 1152, height: 648 }, recordVideo: { dir: test.info().outputPath("read"), size: { width: 1152, height: 648 } }, baseURL: test.info().project.use.baseURL });
  const reader = await ctx.newPage();
  await reader.goto(`/#/t/${TENANT}/read`);
  await reader.getByTestId("tenant-pin-input").fill(pins.pin);
  await reader.getByTestId("tenant-pin-enter").click();
  await expect(reader.getByTestId("tenant-pin")).toHaveAttribute("data-step", "student");
  await reader.getByTestId("tenant-pin-input").fill(pins.people.newhire1);
  await reader.getByTestId("tenant-pin-enter").click();
  await expect(reader.getByTestId("read-card").first()).toBeVisible();
  await reader.waitForTimeout(5000);
  await ctx.close();
});
