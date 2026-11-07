import { expect, test } from "@playwright/test";
import type { CardBody } from "../src/shared/card";
import { sampleCard } from "../tests/fixtures/card";

// 絵の部品を 1 つずつ動かす（091）: 人・時計・小物を 1 つずつ動かすと JSON に出て、保存すると版が上がり、経路は保たれる
// JSON は画面に出さず data-value に置くので、値はその属性から読む

/** 見本のカードに、壁の時計を足す（どのキーフレームにも同じ位置に置く） */
function withClock(): CardBody {
  const c = sampleCard();
  if (c.motion.kind !== "keyframes") throw new Error("キーフレームのカードだけ");
  for (const k of c.motion.json.keyframes) k.props.push({ kind: "clock", show: true, figure: -1, joint: "hip", dx: 0, dy: 0, x: 0.85, y: 0.25, size: 0.12, inner: "none" });
  c.parts.push({ id: "p4", target: { type: "prop", index: 2 }, statement: "s1", reason: "壁の時計" });
  return c;
}

test("人・時計・小物を 1 つずつ動かすと JSON に出て、保存すると版が上がって経路は保たれる", async ({ page, request }) => {
  const res = await request.post("/api/t/practice/cards", { data: { card: withClock() } });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  const before = ((await (await request.get(`/api/t/practice/cards/${id}`)).json()) as { body: CardBody }).body;

  await page.goto(`/#/t/practice/fix/${id}`);
  await page.getByTestId("fix-to-pose").click();
  await expect(page.getByTestId("pose")).toHaveAttribute("data-version", "1");
  await expect(page.getByTestId("pose-save")).toBeDisabled();

  // 人: 絵をタップして選び、手前の腕を上げる
  const face = page.getByTestId("pose-face");
  const box = (await face.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.45);
  await expect(page.getByTestId("pose-controls")).toHaveAttribute("data-part", "p1");
  const svg0 = await face.innerHTML();
  await page.getByTestId("pose-arm_near_upper").fill("150");
  await expect(page.getByTestId("pose-json")).toHaveAttribute("data-value", /"arm_near_upper":150[,}]/);
  expect(await face.innerHTML()).not.toBe(svg0);

  // 時計: 一覧から選んで左へ
  await page.getByTestId("pose-part-p4").click();
  await page.getByTestId("pose-x").fill("0.6");
  await expect(page.getByTestId("pose-json")).toHaveAttribute("data-value", /"kind":"clock","x":0\.6[,}]/);

  // 小物（手に持った検電器）: 手元からのずれ
  await page.getByTestId("pose-part-p2").click();
  await page.getByTestId("pose-dx").fill("0.3");
  await expect(page.getByTestId("pose-json")).toHaveAttribute("data-value", /"dx":0\.3[,}]/);
  await page.waitForTimeout(500);
  await page.screenshot({ path: test.info().outputPath("pose.png"), fullPage: true });

  await page.getByTestId("pose-save").click();
  await expect(page.getByTestId("pose-saved")).toContainText("版 2");
  await expect(page.getByTestId("pose")).toHaveAttribute("data-version", "2");

  // サーバーの JSON に反映され、1 コマ目のキーフレームだけが変わり、経路はそのまま
  const after = ((await (await request.get(`/api/t/practice/cards/${id}`)).json()) as { body: CardBody }).body;
  const ks = (b: CardBody) => (b.motion.kind === "keyframes" ? b.motion.json.keyframes : []);
  expect(ks(after)[0].figures[0].angles.arm_near_upper).toBe(150);
  expect(ks(after)[0].props[2]).toMatchObject({ kind: "clock", x: 0.6 });
  expect(ks(after)[0].props[0]).toMatchObject({ kind: "tester", figure: 0, dx: 0.3 });
  for (const i of [1, 2, 3]) expect(ks(after)[i]).toEqual(ks(before)[i]);
  expect(after.parts).toEqual(before.parts);
  expect(after.statements).toEqual(before.statements);
  // 直しの記録 ④ に 1 件
  const log = (await (await request.get(`/api/t/practice/audit/cards/${id}`)).json()) as { entries: { kind: string; payload: { fields?: string[]; reason?: string } }[] };
  const edits = log.entries.filter((e) => e.kind === "edit");
  expect(edits).toHaveLength(1);
  expect(edits[0].payload).toMatchObject({ fields: ["motion"] });
  expect(edits[0].payload.reason).toMatch(/部品を動かす: p1・p4・p2/);
});
