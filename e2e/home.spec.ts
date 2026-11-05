import { deflateRawSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";
import { freshTenant, login, MARK, toOk } from "./helpers/ok";

// ホーム（11/5 作者）: 役で入る → キャラクターを作る（初めはデフォルト、カスタムで部品を選ぶ）→ ホームの 2 つのタブ。
// カードの管理: 今までのカードのまとめ（作った日・決まり・状態）を押して開き、承認に出す・止める。新しいカードはチャットの画面へ。
// チャット: 文字のファイルと Word（.docx）を添付すると、名前が欄の上に並ぶ。送ると Claude を呼ぶので、ここでは送らない（Worker の試験で見る）。
// キャラクターの管理: 今のキャラクターから直して保存する

/** 1 つだけ入った .docx（word/document.xml を deflate でしまう）を作る */
function docx(paragraphs: string[]): Buffer {
  const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`;
  const name = Buffer.from("word/document.xml");
  const raw = Buffer.from(xml);
  const data = deflateRawSync(raw);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const cdStart = local.length + name.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(cdStart, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}

test("ホーム: キャラクターを作ってから、カードの管理とキャラクターの管理を使う", async ({ page, request }) => {
  test.setTimeout(120_000);
  const T = freshTenant("home", "ホームの確認");
  const res = await request.post(`/api/t/${T}/cards`, { data: { card: { ...sampleCard(), rule: `ホーム ${T} の決まり` } } });
  expect(res.status()).toBe(201);
  const id = ((await res.json()) as { id: string }).id;
  // 署名済みのカードを 1 枚（監修者 1 が署名）。まとめで、状態の札の下に署名した人が出る
  const signedRes = await request.post(`/api/t/${T}/cards`, { data: { card: { ...sampleCard(), rule: `署名 ${T} の決まり` } } });
  const sid = ((await signedRes.json()) as { id: string }).id;
  await toOk(request, T, [sid]);
  const sup1 = { "x-role": await login(request, T, "supervisor", 1) };
  expect((await request.post(`/api/t/${T}/cards/${sid}/sign`, { headers: sup1, data: { version: 1, mark: MARK } })).status()).toBe(200);

  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto(`/#/t/${T}/home`);
  await page.getByTestId("home-as-supervisor-1").click();

  // キャラクターを作る画面（初めはデフォルト。カスタムで目を選び、大きさを変えて進む）
  await expect(page.getByTestId("avatar-setup")).toBeVisible();
  await expect(page.getByTestId("avatar-mode-default")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("avatar-panel")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("home-1-avatar-default.png") });
  await page.getByTestId("avatar-mode-custom").click();
  await page.getByTestId("avatar-tab-eyeShape").click();
  await page.getByTestId("avatar-opt-up").click();
  await page.getByTestId("avatar-size").fill("2");
  await page.getByTestId("avatar-tab-face").click();
  await expect(page.getByTestId("avatar-size")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("home-2-avatar-custom.png") });
  await page.getByTestId("avatar-go").click();

  // カードの管理: まとめを押して開き、承認に出すと確認待ちになる
  await expect(page.getByTestId("home")).toBeVisible();
  await expect(page.getByTestId("home-tab-cards")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId(`home-card-${id}`)).toContainText(`ホーム ${T} の決まり`);
  await page.getByTestId(`home-card-${id}`).click();
  await expect(page.getByTestId(`home-detail-${id}`)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("home-3-cards.png") });
  await expect(page.getByTestId("home-edit")).toHaveAttribute("href", `#/t/${T}/card/${id}`);
  await page.getByTestId("home-request").click();
  await expect(page.getByTestId(`home-status-${id}`)).toHaveText("確認待ち");
  // 止める: 画面の中の確認の窓が出る。「やめる」なら止まらない
  await page.getByTestId("home-stop").click();
  await expect(page.getByTestId("home-stop-dialog")).toContainText("本当に止めますか？");
  await page.getByTestId("home-stop-cancel").click();
  await expect(page.getByTestId("home-stop-dialog")).toHaveCount(0);
  await expect(page.getByTestId(`home-status-${id}`)).toHaveText("確認待ち");
  // もう一度押して、理由を書いて止める
  await page.getByTestId("home-stop").click();
  await page.getByTestId("home-stop-reason").fill("手順が古い");
  await page.screenshot({ path: test.info().outputPath("home-3b-stop-dialog.png") });
  await page.getByTestId("home-stop-go").click();
  await expect(page.getByTestId(`home-status-${id}`)).toHaveText("停止");
  await expect(page.getByTestId("home-stop-dialog")).toHaveCount(0);
  // 止めたカードも、絵のカードは見られる
  await expect(page.getByTestId("home-edit")).toHaveText("絵のカードを見る");

  // 署名済みのカード: 札の下に署名した人。開くと署名の行と、絵のカードを見る・止める（監修者）
  await expect(page.getByTestId(`home-status-${sid}`)).toHaveText("署名済み");
  await expect(page.getByTestId(`home-signer-${sid}`)).not.toBeEmpty();
  await page.getByTestId(`home-card-${sid}`).click();
  await expect(page.getByTestId("home-signed-by")).toContainText("署名:");
  await expect(page.getByTestId(`home-detail-${sid}`).getByTestId("home-edit")).toHaveAttribute("href", `#/t/${T}/card/${sid}`);
  await expect(page.getByTestId(`home-detail-${sid}`).getByTestId("home-stop")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("home-3c-signed.png") });
  // 署名済みを止めるときは、理由を書くまで「止める」を押せない。ここではやめる
  await page.getByTestId(`home-detail-${sid}`).getByTestId("home-stop").click();
  await expect(page.getByTestId("home-stop-go")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("home-stop-dialog")).toHaveCount(0);
  // 絵のカードの画面へ行けること
  await page.getByTestId(`home-detail-${sid}`).getByTestId("home-edit").click();
  await expect(page).toHaveURL(new RegExp(`/card/${sid}$`));
  await page.goto(`/#/t/${T}/home`);
  await expect(page.getByTestId("home")).toBeVisible();

  // 新しいカード: チャットの画面で、文字のファイルと Word を添付する
  await page.getByTestId("home-new").click();
  await expect(page.getByTestId("chat")).toBeVisible();
  await page.getByTestId("chat-file").setInputFiles([
    { name: "手順.txt", mimeType: "text/plain", buffer: Buffer.from("盤に触る前に検電する\n感電のおそれ") },
    { name: "規程.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docx(["第 1 条 脚立の天板に乗らない", "第 2 条 開き止めを掛ける"]) },
  ]);
  await expect(page.getByTestId("chat-attached")).toHaveCount(2);
  await expect(page.getByTestId("chat-err")).toHaveCount(0);
  await page.getByTestId("chat-text").fill("脚立の決まりだけカードにして");
  await expect(page.getByTestId("chat-send")).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath("home-4-chat.png") });
  await page.getByTestId("chat-back").click();

  // キャラクターの管理: 今のキャラクター（カスタム）から開き、保存する
  await page.getByTestId("home-tab-character").click();
  await expect(page.getByTestId("avatar-mode-custom")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("avatar-tab-hair").click();
  await page.getByTestId("avatar-opt-bun").click();
  await page.getByTestId("avatar-go").click();
  await expect(page.getByTestId("home-saved")).toBeVisible();
  expect(await page.evaluate((t) => JSON.parse(localStorage.getItem(`avatar:${t}:supervisor`) ?? "{}").hair, T)).toBe("bun");
  await page.screenshot({ path: test.info().outputPath("home-5-character.png") });
});
