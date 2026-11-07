import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { privatePath } from "../src/node/private-dir";
import { hashPin } from "../src/worker/tenant";
import { sampleCard } from "../tests/fixtures/card";
import { MARK, sql, toOk } from "./helpers/ok";

// 総点検の下ごしらえ（122）: 練習用・架空の会社・会社のテナントの 3 つで画面を全部スマホ幅で開き、ボタンを全部押して、
// 「押しても何も起きない」「エラーが出る」「戻れない」「スマホ幅で崩れる」ものを private/audit/122-sweep.json に書く。直さない。
// AI を呼ぶ口（取り出し・作り直し・確かめ・公開デモの作成）は押しても通さない（止めて「押していない」と書く）。消す操作と確かめの窓は押さない。
// テナントはこの見回りのためにその場で作る使い捨て（PIN もここだけの値）。SWEEP=1 のときだけ流す。録画の絵は仮（※取り直し）
test.skip(!process.env.SWEEP, "見回りは SWEEP=1 のときだけ流す");
test.setTimeout(30 * 60_000);

// 作り直し（rework）とチャットの送信（chats/<id>/messages）も Claude を呼ぶ
const AI = /\/(extract(\/[^/]+\/make)?|cards\/[^/]+\/(verify|redo|rework)|chats\/[^/]+\/messages|demo\/make)$/;
const DANGER = /空にする|リセット|消す|削除/;
const W = { width: 390, height: 844 };

interface Finding {
  tenant: string;
  screen: string;
  action: string;
  kind: "nothing" | "error" | "no_way_back" | "overflow" | "skipped_ai" | "skipped_danger" | "dialog";
  detail: string;
}
const found: Finding[] = [];
const out = privatePath("audit");

type Kind = "practice" | "demo" | "company";

/** 使い捨てのテナントと、カード 2 枚（OK と署名済み）と回を作る。会社は 2 段の PIN も作る */
async function seed(request: APIRequestContext, kind: Kind) {
  const id = `sw-${kind}-${Date.now()}`;
  sql(`INSERT INTO tenants (id, kind, name) VALUES ('${id}', 'demo', '見回り ${kind}')`);
  const api = `/api/t/${id}`;
  const mk = async (rule: string) => ((await (await request.post(`${api}/cards`, { data: { card: { ...sampleCard(), rule } } })).json()) as { id: string }).id;
  const ok = await mk("見回りの OK のカード");
  const signed = await mk("見回りの署名済みのカード");
  await toOk(request, id, [ok]);
  await toOk(request, id, [signed]);
  const sup = ((await (await request.post(`${api}/login`, { data: { role: "supervisor", slot: 1 } })).json()) as { token: string }).token;
  expect((await request.post(`${api}/cards/${signed}/sign`, { headers: { "x-role": sup }, data: { version: 1, mark: MARK } })).status()).toBe(200);
  const trial = ((await (await request.post(`${api}/trials`, { data: { participants: ["p1", "p2"], seed: `sweep-${kind}` } })).json()) as { id: string }).id;
  await request.post(`${api}/trials/${trial}/cards`, { data: { cards: [ok, signed] } });
  const pin: Record<string, string> = {};
  if (kind !== "demo") {
    const k = kind === "company" ? "company" : "practice";
    if (kind === "company") {
      const base = Date.now() % 1_000_000;
      pin.tenant = String(10_000_000 + base);
      sql(`UPDATE tenants SET kind = '${k}', pin_hash = '${await hashPin(pin.tenant)}' WHERE id = '${id}'`);
      for (const [role, slot, p] of [["author", 1, 40], ["supervisor", 1, 20], ["trainer", 1, 30], ["newhire", 1, 50]] as const) {
        pin[role] = String(p * 1_000_000 + base);
        sql(`INSERT INTO people (tenant_id, role, slot, pin_hash) VALUES ('${id}', '${role}', ${slot}, '${await hashPin(pin[role])}')`);
      }
    } else sql(`UPDATE tenants SET kind = '${k}' WHERE id = '${id}'`);
  }
  return { id, ok, signed, trial, pin };
}

/** 画面ごとの役（その画面を使う人） */
const SCREENS = (s: { ok: string; signed: string; trial: string }) =>
  [
    ["home", "author"],
    ["new", "author"],
    ["make", "author"],
    [`card/${s.ok}`, "author"],
    [`route/${s.ok}`, "supervisor"],
    [`fix/${s.ok}`, "supervisor"],
    [`fix/${s.ok}/words`, "supervisor"],
    [`fold/${s.ok}`, "author"],
    [`pose/${s.ok}`, "supervisor"],
    [`sign/${s.ok}`, "supervisor"],
    [`audit/${s.signed}`, "trainer"],
    ["read", "newhire"],
    ["student", "newhire"],
    ["issue", "supervisor"],
    ["queue", "supervisor"],
    ["trials", "trainer"],
    ["trial/new", "trainer"],
    [`trial/${s.trial}/material`, "trainer"],
    [`trial/${s.trial}/self/p1`, "newhire"],
    [`trial/${s.trial}/time`, "trainer"],
    [`trial/${s.trial}/answer/p1`, "trainer"],
    [`trial/${s.trial}/grade/g1`, "trainer"],
    [`trial/${s.trial}/clocks`, "trainer"],
    [`trial/${s.trial}/forecast`, "trainer"],
    [`trial/${s.trial}/pictures/p1`, "trainer"],
  ] as const;

/** 入ったしるしを sessionStorage に入れる（会社は 2 段の PIN を API で通してから） */
async function signIn(page: Page, request: APIRequestContext, tenant: string, role: string, pin: Record<string, string>) {
  const api = `/api/t/${tenant}`;
  let tok = "";
  if (pin.tenant) tok = ((await (await request.post(`${api}/session`, { data: { pin: pin.tenant } })).json()) as { token: string }).token;
  const r = await request.post(`${api}/login`, { headers: tok ? { authorization: `Bearer ${tok}` } : {}, data: { role, slot: 1, pin: pin[role] } });
  const roleTok = ((await r.json()) as { token?: string }).token ?? "";
  await page.goto("/#/");
  await page.evaluate(([t, a, b]) => {
    sessionStorage.clear();
    if (a) sessionStorage.setItem(`token:${t}`, a);
    if (b) sessionStorage.setItem(`role:${t}`, b);
  }, [tenant, tok, roleTok]);
}

/** 画面を開いて、落ち着くまで待つ。開いたあとのエラー（画面の文・コンソール・4xx/5xx）を集める */
async function open(page: Page, hash: string, errs: string[]) {
  await page.goto(`/${hash}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(500);
  const alert = await page.locator(".err, [role=alert]").allInnerTexts();
  for (const a of alert) if (a.trim()) errs.push(`画面のエラー: ${a.trim().slice(0, 120)}`);
}

function watch(page: Page) {
  const errs: string[] = [];
  let calls = 0;
  page.on("console", (m) => m.type() === "error" && errs.push(`コンソール: ${m.text().slice(0, 160)}`));
  page.on("pageerror", (e) => errs.push(`例外: ${e.message.slice(0, 160)}`));
  page.on("response", (r) => {
    if (!r.url().includes("/api/")) return;
    if (r.request().method() !== "GET") calls++;
    if (r.status() >= 400) errs.push(`${r.request().method()} ${new URL(r.url()).pathname} → ${r.status()}`);
  });
  return { errs, calls: () => calls };
}

async function sweepScreen(page: Page, label: string, hash: string) {
  const w = watch(page);
  const blocked: string[] = [];
  await page.route("**/api/**", (route) => {
    const u = new URL(route.request().url());
    if (route.request().method() !== "GET" && AI.test(u.pathname)) {
      blocked.push(u.pathname);
      return route.fulfill({ status: 599, json: { error: "見回りでは AI を呼ばない" } });
    }
    return route.continue();
  });
  const add = (action: string, kind: Finding["kind"], detail: string) => found.push({ tenant: label, screen: hash, action, kind, detail });
  const first: string[] = [];
  await open(page, hash, first);
  for (const e of first) add("開く", "error", e);
  // スマホ幅で横にはみ出す
  const over = await page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= W + 1) return null;
    const wide = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((e) => e.getBoundingClientRect().right > W + 1).slice(0, 3);
    return `${document.documentElement.scrollWidth}px（幅 ${W}px）: ${wide.map((e) => `${e.tagName.toLowerCase()}${e.className ? "." + String(e.className).split(" ")[0] : ""}${e.dataset.testid ? `[${e.dataset.testid}]` : ""}`).join(", ")}`;
  });
  if (over) add("開く", "overflow", over);
  // 戻る道: ほかの画面への a か、戻るボタン
  const back = await page.locator('a[href^="#/"], a[href="#"], button:has-text("戻る")').count();
  if (!back) add("開く", "no_way_back", "ほかの画面へのリンクも「戻る」も無い");

  const sel = 'button:visible, a[href]:visible, input[type="submit"]:visible, [role="button"]:visible';
  const n = Math.min(await page.locator(sel).count(), 25);
  for (let i = 0; i < n; i++) {
    await open(page, hash, []);
    const b = page.locator(sel).nth(i);
    if (!(await b.count())) continue;
    const name = ((await b.innerText().catch(() => "")) || (await b.getAttribute("aria-label")) || (await b.getAttribute("data-testid")) || `#${i}`).trim().replace(/\s+/g, " ").slice(0, 40);
    if (await b.isDisabled().catch(() => false)) continue;
    if (DANGER.test(name)) {
      add(name, "skipped_danger", "消す操作なので押していない");
      continue;
    }
    const before = { url: page.url(), html: await page.locator("body").innerHTML(), calls: w.calls(), errs: w.errs.length, blocked: blocked.length };
    let dialog = "";
    page.once("dialog", (d) => {
      dialog = d.message();
      d.dismiss().catch(() => {});
    });
    const tgt = await b.getAttribute("target");
    await b.click({ timeout: 3000 }).catch((e: Error) => add(name, "error", `押せない: ${e.message.split("\n")[0].slice(0, 120)}`));
    await page.waitForTimeout(900);
    if (blocked.length > before.blocked) {
      add(name, "skipped_ai", `AI を呼ぶ口なので止めた: ${blocked.at(-1)}`);
      continue;
    }
    if (dialog) add(name, "dialog", `確かめの窓（キャンセルした）: ${dialog.slice(0, 80)}`);
    for (const e of w.errs.slice(before.errs)) add(name, "error", e);
    const after = { url: page.url(), html: await page.locator("body").innerHTML().catch(() => "") };
    if (!dialog && !tgt && after.url === before.url && after.html === before.html && w.calls() === before.calls && w.errs.length === before.errs)
      add(name, "nothing", "押しても画面も URL も変わらず、送る呼び出しも無い");
  }
  await page.unroute("**/api/**");
}

function save() {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "122-sweep.json"), JSON.stringify(found, null, 1));
}

test.use({ viewport: W });

// #/ は入口（会社の名前を入れるか、ゲストで公開デモへ）。公開デモの入口は #/demo
test("見回り: 入口と公開デモと絵の部品の一覧（入らずに見る画面）", async ({ page }) => {
  for (const hash of ["#/", "#/demo", "#/demo/time", "#/demo/picture", "#/picto/poses"]) await sweepScreen(page, "公開デモ（架空の会社・local）", hash);
  save();
});

for (const kind of ["practice", "demo", "company"] as const) {
  test(`見回り: ${kind}`, async ({ page, request }) => {
    const s = await seed(request, kind);
    const label = { practice: "練習用", demo: "架空の会社", company: "会社のテナント" }[kind];
    for (const [path, role] of SCREENS(s)) {
      await signIn(page, request, s.id, role, s.pin);
      await sweepScreen(page, label, `#/t/${s.id}/${path}`);
    }
    save();
    expect(found.length).toBeGreaterThanOrEqual(0);
  });
}
