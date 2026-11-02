import { expect, type Page, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";

// 紙芝居の切り替え（076a）。画面・タブ・カード送り・コマ送りが 0.3〜0.4 秒で動き、「動きを減らす」設定では動かない。
// カードの読み込みは差し替える（録画の中身を毎回同じにする）
function mock(page: Page) {
  const read = ["一", "二", "三"].map((n, i) => {
    const b = sampleCard();
    return { id: `slide-${i}`, rule: `${n}枚目: ${b.rule}`, why: b.why, words: null, motion: b.motion, frames: b.frames };
  });
  return Promise.all([
    page.route("**/api/t/practice/read/cards", (r) => r.fulfill({ json: { cards: read } })),
    page.route("**/api/t/practice/cards/slide-card", (r) => r.fulfill({ json: { id: "slide-card", status: "signed", version: 1, body: sampleCard() } })),
  ]);
}

/** 動きの印（data-moving）が付いた・外れた時刻を、ページの中で記録する */
async function watch(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { moves: { v: string | null; at: number; el: string }[] };
    w.moves = [];
    new MutationObserver((ms) => {
      for (const m of ms) {
        const el = m.target as HTMLElement;
        w.moves.push({ v: el.getAttribute("data-moving"), at: performance.now(), el: el.dataset.testid ?? "" });
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-moving"] });
  });
}

/** 前の watch から、動きが何回あり、それぞれ何ミリ秒だったか（el ごと） */
async function moves(page: Page) {
  await page.waitForTimeout(700);
  const ms = await page.evaluate(() => {
    const w = window as unknown as { moves: { v: string | null; at: number; el: string }[] };
    const got = w.moves;
    w.moves = [];
    return got;
  });
  const out: { el: string; kind: string; ms: number }[] = [];
  const open = new Map<string, { kind: string; at: number }>();
  for (const m of ms) {
    const o = open.get(m.el);
    // 続けて押して動きが入れ替わったときは、前の動きをそこで閉じる
    if (o && m.v !== o.kind) {
      out.push({ el: m.el, kind: o.kind, ms: m.at - o.at });
      open.delete(m.el);
    }
    if (m.v) {
      if (!open.has(m.el)) open.set(m.el, { kind: m.v, at: m.at });
    } else if (open.has(m.el)) {
      const o = open.get(m.el)!;
      out.push({ el: m.el, kind: o.kind, ms: m.at - o.at });
      open.delete(m.el);
    }
  }
  return out;
}

/** 動く写しのアニメーションの長さ（秒の文字） */
const pieceDuration = (page: Page) => page.evaluate(() => getComputedStyle(document.querySelector(".slide-piece")!).animationDuration);

test("画面・タブ・カード送りが 0.3〜0.4 秒でスッと動き、コマ送りは同じ動きを再生する", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });

  // カード送り: つぎ は今のカードを抜く、まえ は前のカードを差し込む
  await page.goto("/#/t/practice/read");
  await expect(page.getByTestId("read-card")).toHaveAttribute("data-card", "slide-0");
  await watch(page);
  await page.getByTestId("read-next").click();
  expect(await pieceDuration(page)).toBe("0.35s");
  await expect(page.getByTestId("read-card")).toHaveAttribute("data-card", "slide-1");
  let m = await moves(page);
  expect(m.map((x) => x.kind)).toEqual(["out"]);
  expect(m[0].ms).toBeGreaterThanOrEqual(300);
  expect(m[0].ms).toBeLessThanOrEqual(520);
  // 動いている間も、下の本物はすぐ押せる（写しは押せない）
  await page.getByTestId("read-next").click();
  await page.getByTestId("read-prev").click();
  await expect(page.getByTestId("read-card")).toHaveAttribute("data-card", "slide-1");
  m = await moves(page);
  expect(m.map((x) => x.kind).sort()).toEqual(["in", "out"].sort());
  // 写しにテストの印は残らない（同じ印が 2 つにならない）
  await expect(page.getByTestId("read-card")).toHaveCount(1);

  // 画面の切り替え
  await page.evaluate(() => (location.hash = "#/t/practice/card/slide-card"));
  await expect(page.getByTestId("card")).toBeVisible();
  m = await moves(page);
  expect(m.filter((x) => x.kind === "out").length).toBe(1);

  // コマ送り: 印の付いたコマの間を、カードの動きの JSON のまま再生する
  const face = page.getByTestId("card-face");
  const before = await face.innerHTML();
  await page.getByTestId("card-next").click();
  await expect(face).toHaveAttribute("data-moving", "1");
  const mid = await face.innerHTML();
  await expect(face).not.toHaveAttribute("data-moving", "1");
  const after = await face.innerHTML();
  expect(mid).not.toBe(before);
  expect(mid).not.toBe(after);
  m = await moves(page);
  const play = m.find((x) => x.el === "card-face")!;
  expect(play.ms).toBeGreaterThanOrEqual(300);
  expect(play.ms).toBeLessThanOrEqual(520);
  await page.waitForTimeout(500);

  // タブの切り替え（入れる画面の「話す・書く」と「資料から」）
  await page.route("**/api/t/practice/files**", (r) => r.fulfill({ json: { docs: [] } }));
  await page.evaluate(() => (location.hash = "#/t/practice/make"));
  await expect(page.getByTestId("make-input")).toBeVisible();
  await moves(page);
  await page.getByTestId("mode-doc").click();
  await expect(page.getByTestId("pages")).toBeVisible();
  m = await moves(page);
  expect(m.map((x) => x.kind)).toEqual(["out"]);
  await page.getByTestId("mode-speech").click();
  m = await moves(page);
  expect(m.map((x) => x.kind)).toEqual(["in"]);
  await page.screenshot({ path: test.info().outputPath("slide-make.png") });
});

test("凝った部分: 抜く紙が持ち上がって影が付き、引っかかってから速く抜ける。続けて押すと紙が重なる（076b）", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/t/practice/read");
  await expect(page.getByTestId("read-card")).toHaveAttribute("data-card", "slide-0");

  // 動きを止めて、途中の形を時刻ごとに読む
  await page.getByTestId("read-next").click();
  const at = (ms: number) =>
    page.evaluate((t) => {
      const piece = document.querySelector<HTMLElement>(".slide-out")!;
      for (const a of piece.getAnimations()) {
        a.pause();
        a.currentTime = t;
      }
      const cs = getComputedStyle(piece);
      const m = new DOMMatrix(cs.transform);
      const dim = document.querySelector<HTMLElement>(".dim-out")!;
      for (const a of dim.getAnimations()) {
        a.pause();
        a.currentTime = t;
      }
      return { x: m.m41 / piece.offsetWidth, angle: (Math.atan2(m.m12, m.m11) * 180) / Math.PI, shadow: cs.boxShadow, dim: Number(getComputedStyle(dim).opacity) };
    }, ms);
  const early = await at(70);
  const mid = await at(175);
  const late = await at(280);
  // 影が付き、少し傾く
  expect(early.shadow).not.toBe("none");
  expect(mid.angle).toBeLessThan(-0.3);
  // 速さの緩急: 最初の 2 割はゆっくり（3% ほど）、後半で速く抜ける
  expect(Math.abs(early.x)).toBeLessThan(0.04);
  expect(Math.abs(late.x) - Math.abs(mid.x)).toBeGreaterThan(Math.abs(mid.x) - Math.abs(early.x));
  // 下の画面は影から明るくなる
  expect(early.dim).toBeGreaterThan(late.dim);
  await page.evaluate(() => document.querySelectorAll(".slide-layer *").forEach((e) => e.getAnimations().forEach((a) => a.finish())));
  await expect(page.locator(".slide-run")).toHaveCount(0);

  // 続けて押すと、前の紙が抜けきる前に次の紙が重なる
  await page.getByTestId("read-prev").click();
  await expect(page.locator(".slide-run")).toHaveCount(0, { timeout: 2000 });
  await page.getByTestId("read-next").click();
  await page.getByTestId("read-next").click();
  expect(await page.locator(".slide-run").count()).toBe(2);
  await page.screenshot({ path: test.info().outputPath("slide-overlap.png") });
  await expect(page.locator(".slide-run")).toHaveCount(0, { timeout: 2000 });
  await expect(page.getByTestId("slide-layer").first()).not.toHaveAttribute("data-moving", /./);
  await expect(page.getByTestId("read-card")).toHaveAttribute("data-card", "slide-2");
});

test.describe("動きを減らす設定", () => {
  test.use({ reducedMotion: "reduce" });

  test("動かさずに切り替える", async ({ page }) => {
    await mock(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#/t/practice/read");
    await expect(page.getByTestId("read-card")).toHaveAttribute("data-card", "slide-0");
    await watch(page);
    await page.getByTestId("read-next").click();
    await expect(page.getByTestId("read-card")).toHaveAttribute("data-card", "slide-1");
    await page.getByTestId("read-prev").click();
    await page.evaluate(() => (location.hash = "#/t/practice/card/slide-card"));
    await expect(page.getByTestId("card")).toBeVisible();
    const face = page.getByTestId("card-face");
    await page.getByTestId("card-next").click();
    await expect(face).toHaveAttribute("data-frame", "1");
    expect(await moves(page)).toEqual([]);
    await expect(page.locator(".slide-piece")).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("slide-reduce.png") });
  });
});
