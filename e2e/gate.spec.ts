import { expect, type Page, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";
import { freshTenant, login as loginAs, MARK, sql, toOk } from "./helpers/ok";

// サーバー側の関門（052）: 1 人 1 日 20 枚を超える署名は断る。署名の無いカード・停止したカード・署名のあとに中身が変わったカードは、
// 新入社員の口のどこからも取れない。API を順に呼び、結果を画面の表に出して録画に残す（本物の Claude API は呼ばない）。
// 確かめる AI の証拠は本物の AI の答えではなく、この回だけの使い捨てテナントの監査の記録に、正しい連鎖で書いたテスト用のもの。
// 流すたびに新しいテナントを作る（署名の数は監修者ごと・日ごとなので、前の回の署名が数に入らないように）
const LIMIT = 20;

/** 録画に映す確認の表。1 行ずつ足す */
async function board(page: Page) {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{font:16px/1.5 system-ui,sans-serif;margin:24px;background:#fafaf7;color:#222}
    h1{font-size:22px;margin:0 0 12px} table{border-collapse:collapse;width:100%}
    td{border-bottom:1px solid #ddd;padding:6px 10px} td.s{width:70px;font-weight:700} .ok{color:#17753a} .ng{color:#b3261e}
    .sec td{background:#eee;font-weight:700}
  </style><h1>052 サーバー側の関門</h1><table id="t"></table>`);
}
async function row(page: Page, ok: boolean, text: string) {
  await page.evaluate(([o, t]) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="s ${o ? "ok" : "ng"}">${o ? "OK" : "NG"}</td><td></td>`;
    tr.children[1].textContent = t as string;
    document.getElementById("t")!.appendChild(tr);
    tr.scrollIntoView();
  }, [ok, text] as const);
  await page.waitForTimeout(350);
}
async function section(page: Page, text: string) {
  await page.evaluate((t) => {
    const tr = document.createElement("tr");
    tr.className = "sec";
    tr.innerHTML = `<td colspan="2"></td>`;
    tr.children[0].textContent = t;
    document.getElementById("t")!.appendChild(tr);
    tr.scrollIntoView();
  }, text);
  await page.waitForTimeout(500);
}

test("署名は 1 人 1 日 20 枚まで。署名の無い・停止した・署名のあとに変わったカードは、新入社員の口から取れない", async ({ page, request }) => {
  test.setTimeout(240_000);
  const T = freshTenant("g052", "関門の確認");
  const api = `/api/t/${T}`;
  const login = (role: string, slot = 1) => loginAs(request, T, role, slot);
  const sup = { "x-role": await login("supervisor", 1) };
  const nh = { "x-role": await login("newhire") };

  await board(page);

  // 21 枚を OK まで進める（確認待ちにする → 証拠を連鎖に足す → OK）
  const ids: string[] = [];
  for (let i = 0; i < LIMIT + 1; i++) {
    const res = await request.post(`${api}/cards`, { data: { card: { ...sampleCard(), rule: `052 ${T} ${i}` } } });
    expect(res.status()).toBe(201);
    ids.push(((await res.json()) as { id: string }).id);
  }
  const draft = ((await (await request.post(`${api}/cards`, { data: { card: { ...sampleCard(), rule: `052 ${T} 下書きのまま` } } })).json()) as { id: string }).id;
  await toOk(request, T, ids);

  // 1. 署名の上限
  await section(page, "1. 同じ監修者の署名は 1 日 20 枚まで");
  for (let i = 0; i < LIMIT; i++) {
    const res = await request.post(`${api}/cards/${ids[i]}/sign`, { headers: sup, data: { version: 1, mark: MARK } });
    expect(res.status(), `${i + 1} 枚目`).toBe(200);
    if (i === 0 || i === LIMIT - 1) await row(page, true, `${i + 1} 枚目の署名: 200（署名できた）`);
  }
  const over = await request.post(`${api}/cards/${ids[LIMIT]}/sign`, { headers: sup, data: { version: 1, mark: MARK } });
  const overBody = (await over.json()) as { error: string };
  expect(over.status()).toBe(429);
  expect(overBody.error).toContain(`${LIMIT} 枚まで`);
  await row(page, true, `${LIMIT + 1} 枚目の署名: ${over.status()}（断られた）「${overBody.error}」`);
  const overCard = (await (await request.get(`${api}/cards/${ids[LIMIT]}`)).json()) as { status: string };
  expect(overCard.status).toBe("ok");
  await row(page, true, `断られたカードは署名済みにならない（今は ${overCard.status}）`);

  // 署名のあとの状態を作る: 1 枚停止・1 枚は裏で中身を書き換える
  const stopped = ids[0];
  const tampered = ids[LIMIT - 1];
  expect((await request.post(`${api}/cards/${stopped}/status`, { headers: sup, data: { to: "stopped", reason: "録画で止める" } })).status()).toBe(200);
  sql(`UPDATE cards SET body = json_set(body, '$.why', '署名のあとに書き換えた') WHERE id = '${tampered}'`);

  // 2. 新入社員の口
  await section(page, "2. 新入社員の口から取れるのは、署名したまま変わっていないカードだけ");
  const list = (await (await request.get(`${api}/read/cards`, { headers: nh })).json()) as { cards: { id: string }[] };
  const seen = list.cards.map((c) => c.id);
  const intact = ids.slice(1, LIMIT - 1);
  expect(seen.sort()).toEqual([...intact].sort());
  await row(page, true, `一覧に出たのは署名したまま変わっていない ${seen.length} 枚だけ`);
  const hidden: [string, string][] = [
    [draft, "下書きのまま（未署名）"],
    [ids[LIMIT], "署名を断られた（OK のまま）"],
    [stopped, "停止したカード"],
    [tampered, "署名のあとに中身が変わったカード"],
  ];
  for (const [id, label] of hidden) {
    expect(seen).not.toContain(id);
    const one = await request.get(`${api}/read/cards/${id}`, { headers: nh });
    expect(one.status()).toBe(404);
    await row(page, true, `${label}: 一覧に無く、1 枚の取得も ${one.status()}`);
  }

  // 3. スタッフ向けの口は、新入社員のしるしでは全部閉じている
  await section(page, "3. スタッフ向けの口・監査・置き場は、新入社員のしるしでは 403");
  const closed = ["/cards", `/cards/${draft}`, `/cards/${stopped}`, `/cards/${tampered}/signature`, `/audit/cards/${draft}`, "/audit/verify", "/files", "/files/pdf/x/p001.json", "/pairs", "/trials/none/responses"];
  for (const path of closed) {
    const res = await request.get(`${api}${path}`, { headers: nh });
    expect(res.status(), path).toBe(403);
  }
  await row(page, true, `GET ${closed.length} 本（カード・署名・監査・置き場・組・回答）: すべて 403`);
  const posts = [`/cards/${draft}/sign`, `/cards/${draft}/status`, "/extract", "/reset"];
  for (const path of posts) expect((await request.post(`${api}${path}`, { headers: nh, data: { to: "signed", confirm: T } })).status(), path).toBe(403);
  await row(page, true, `POST 署名・状態の変更・取り出し・データを戻す: すべて 403`);
  const after = (await (await request.get(`${api}/cards`, { headers: sup })).json()) as { cards: unknown[] };
  expect(after.cards).toHaveLength(LIMIT + 2);
  await row(page, true, `データを戻す操作は断られ、カード ${after.cards.length} 枚は残っている`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: test.info().outputPath("gate-board.png"), fullPage: true });

  // 新入社員の画面でも、同じカードだけが並ぶ
  await page.goto(`/#/t/${T}/read`);
  await expect(page.getByTestId("read-card")).toBeVisible();
  await expect(page.getByTestId("read-pos")).toContainText(`/ ${intact.length}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: test.info().outputPath("gate-read.png"), fullPage: true });
});
