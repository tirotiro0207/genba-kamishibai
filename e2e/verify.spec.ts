import { expect, test } from "@playwright/test";
import { sampleCard } from "../tests/fixtures/card";

// 確認待ちの関門（047）: 確かめる AI の証拠が無いカードは、画面でもサーバーでも OK を受け付けない

test("証拠が無いカードは確認待ちで、画面の OK は押せず、サーバーも断る", async ({ page, request }) => {
  const res = await request.post("/api/t/practice/cards", { data: { card: sampleCard() } });
  const { id } = (await res.json()) as { id: string };
  await page.goto(`/#/t/practice/card/${id}`);
  await expect(page.getByTestId("card-wait")).toContainText("確認待ち");
  await page.getByTestId("card-to-pending").click();
  await expect(page.getByTestId("card")).toHaveAttribute("data-status", "pending");
  await expect(page.getByTestId("card-ok")).toBeDisabled();
  await expect(page.getByTestId("card-ok")).toContainText("確認待ち");
  await page.waitForTimeout(800);
  await page.screenshot({ path: test.info().outputPath("verify-wait.png"), fullPage: true });
  // 画面を通さずに OK を送っても、サーバーが断る
  const ok = await request.post(`/api/t/practice/cards/${id}/status`, { data: { to: "ok" } });
  expect(ok.status()).toBe(409);
  expect(((await ok.json()) as { error: string }).error).toMatch(/確認待ち/);
});

test("確かめる AI に見せるとコマの PNG が順に送られ、証拠が出てから OK できる", async ({ page }) => {
  // 確かめる AI の呼び出しは差し替える（サーバーの判定と記録は Worker のテストで確かめる）
  const state = { status: "pending", verify: null as unknown };
  const sentFrames: string[] = [];
  await page.route("**/api/t/practice/cards/verify-card**", async (route) => {
    const r = route.request();
    if (r.method() === "POST" && r.url().endsWith("/verify")) {
      sentFrames.push(...((r.postDataJSON() as { frames: string[] }).frames ?? []));
      state.verify = {
        agent: "verifier",
        model: "claude-opus-5-5",
        frames: 3,
        cited: [2, 3],
        rate: 80,
        band: "green",
        dangerous: false,
        reason: "盤に道具を当ててから触ると受け取れた。理由の感電は一部だけ",
        points: [
          { id: "s1", credit: "full", frame: 2, reason: "2 コマ目で当てている" },
          { id: "s2", credit: "partial", frame: 3, reason: "危ないことは分かるが感電とまでは言えない" },
        ],
        reading: { frames: [], meaning: "盤に触る前に道具を当てる", do: "当てる", dont: null, why_guess: "危ない", confidence: 60 },
      };
      return route.fulfill({ json: { version: 1, evidence: state.verify } });
    }
    if (r.method() === "POST" && r.url().endsWith("/status")) {
      if (!state.verify) return route.fulfill({ status: 409, json: { error: "確認待ち" } });
      state.status = (r.postDataJSON() as { to: string }).to;
      return route.fulfill({ json: { id: "verify-card", status: state.status } });
    }
    return route.fulfill({ json: { id: "verify-card", status: state.status, version: 1, body: sampleCard(), verify: state.verify } });
  });

  await page.goto("/#/t/practice/card/verify-card");
  await expect(page.getByTestId("card-ok")).toBeDisabled();
  await page.getByTestId("card-verify").click();
  await expect(page.getByTestId("card-check")).toHaveAttribute("data-evidence", "1");

  // コマは 3 枚とも PNG で、順に送られた
  expect(sentFrames).toHaveLength(3);
  for (const f of sentFrames) {
    expect(f).toMatch(/^data:image\/png;base64,/);
    const head = Buffer.from(f.split(",")[1], "base64").subarray(0, 4);
    expect([...head]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  }
  expect(new Set(sentFrames).size).toBe(3);

  // どの絵を見て・何点で・なぜか
  await expect(page.getByTestId("card-rate")).toHaveText("80");
  await expect(page.getByTestId("card-evidence")).toContainText("3 コマを順に");
  await expect(page.getByTestId("card-evidence")).toContainText("2 コマ目・3 コマ目");
  await expect(page.getByTestId("card-evidence-reason")).toContainText("盤に道具を当ててから触る");
  await page.waitForTimeout(800);
  await page.screenshot({ path: test.info().outputPath("verify-evidence.png"), fullPage: true });

  await expect(page.getByTestId("card-ok")).toBeEnabled();
  await page.getByTestId("card-ok").click();
  await expect(page.getByTestId("card")).toHaveAttribute("data-status", "ok");
  await page.waitForTimeout(600);
});
