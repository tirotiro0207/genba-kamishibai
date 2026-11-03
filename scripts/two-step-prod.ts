// 本番の公開 URL で、会社のテナントの 2 段（テナントの PIN → 役割の PIN）を確かめる（028b の確かめの続き）。書き込みはしない。
// API: 作る・カード・閲覧・発行・署名・監査の 6 つの口が、しるし無しは 401、テナントのしるしだけは 403、役割のしるしまであれば 200。
// 画面: 同じ 6 つの画面を、しるし無し → テナントのしるしだけ → 両方 の 3 つの状態で開き、PIN の欄がどの段で出るかを見る。
// PIN は private/tenants/company.production.json から読んで API に送るだけで、画面に打たない。画面にもログにも出さない。写しは private/rec/two-step-prod/ に置く。
//
//   npx tsx scripts/two-step-prod.ts [URL]
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { privatePath } from "../src/node/private-dir";
import { pinsPath, type Pins } from "./add-company";

const BASE = (process.argv[2] ?? process.env.PROD_URL ?? "https://genba-kamishibai.ikjshare.workers.dev").replace(/\/$/, "");
const T = "company";
let failed = 0;
function check(name: string, ok: boolean, got: unknown) {
  console.log(`${ok ? "OK " : "NG "} ${name}（${String(got)}）`);
  if (!ok) failed++;
}
const post = (body: unknown, headers: Record<string, string> = {}) => ({ method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

async function main() {
  const path = pinsPath(T, true);
  if (!existsSync(path)) throw new Error(`本番の PIN のファイルが無い（${path}）`);
  const pins = JSON.parse(readFileSync(path, "utf-8")) as Pins & { people: Record<string, string> };
  const s = await fetch(`${BASE}/api/t/${T}/session`, post({ pin: pins.pin }));
  const tenantToken = ((await s.json()) as { token?: string }).token;
  if (!tenantToken) throw new Error(`テナントの PIN で入れない（${s.status}）`);
  const auth = { authorization: `Bearer ${tenantToken}` };
  const roleToken = async (role: string, slot: number) => {
    const r = await fetch(`${BASE}/api/t/${T}/login`, post({ role, slot, pin: pins.people[`${role}${slot}`] }, auth));
    const tok = ((await r.json()) as { token?: string }).token;
    if (!tok) throw new Error(`${role}.${slot} の PIN で入れない（${r.status}）`);
    return tok;
  };
  const roles = { author: await roleToken("author", 1), supervisor: await roleToken("supervisor", 1), trainer: await roleToken("trainer", 1), newhire: await roleToken("newhire", 1) };
  const list = (await (await fetch(`${BASE}/api/t/${T}/cards`, { headers: { ...auth, "x-role": roles.author } })).json()) as { cards: { id: string }[] };
  const cardId = list.cards[0]?.id ?? "none";
  console.log(`-- 会社のテナントのカード ${list.cards.length} 枚（カード・署名・監査の画面は ${list.cards.length ? "1 枚目" : "無いカードの番号"}で開く）`);

  // 6 つの画面と、その画面が最初に呼ぶ口・入る役割
  const screens = [
    { name: "作る", hash: "make", api: "/files?prefix=pdf/", role: roles.author },
    { name: "カード", hash: `card/${cardId}`, api: "/cards", role: roles.author },
    { name: "閲覧", hash: "read", api: "/read/cards", role: roles.newhire },
    { name: "発行", hash: "issue", api: "/issue/cards", role: roles.supervisor },
    { name: "署名", hash: `sign/${cardId}`, api: "/cards", role: roles.supervisor },
    { name: "監査", hash: `audit/${cardId}`, api: "/audit/verify", role: roles.trainer },
  ];
  for (const sc of screens) {
    const at = (h: Record<string, string>) => fetch(`${BASE}/api/t/${T}${sc.api}`, { headers: h }).then((r) => r.status);
    const [none, onlyTenant, both] = [await at({}), await at(auth), await at({ ...auth, "x-role": sc.role })];
    check(`${sc.name}の口: しるし無し 401・テナントだけ 403・両方 200`, none === 401 && onlyTenant === 403 && both === 200, `${none}・${onlyTenant}・${both}`);
  }

  const dir = privatePath("rec", "two-step-prod");
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const sc of screens) {
      for (const [state, store] of [
        ["しるし無し", {}],
        ["テナントだけ", { [`token:${T}`]: tenantToken }],
        ["両方", { [`token:${T}`]: tenantToken, [`role:${T}`]: sc.role }],
      ] as const) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await ctx.addInitScript((kv: Record<string, string>) => {
          for (const [k, v] of Object.entries(kv)) sessionStorage.setItem(k, v);
        }, store as Record<string, string>);
        const page = await ctx.newPage();
        await page.goto(`${BASE}/?cb=${Date.now()}#/t/${T}/${sc.hash}`);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(800);
        const form = page.getByTestId("tenant-pin");
        // 発行・署名・監査は、テナントのしるしがあると、役を選ぶボタンと役割の PIN の欄（088 の続きの形）を出す。これも役割の PIN の段として数える
        const step = (await form.count()) ? await form.getAttribute("data-step") : (await page.getByText("PIN（会社のテナントだけ）").count()) ? "role" : null;
        const want = state === "しるし無し" ? "tenant" : state === "テナントだけ" ? "role" : null;
        await page.screenshot({ path: `${dir}/${sc.hash.split("/")[0]}-${state}.png` });
        check(`${sc.name}の画面・${state}: ${want === "tenant" ? "テナントの PIN の欄" : want === "role" ? "役割の PIN の欄" : "PIN の欄が出ずに開く"}`, step === want, step ?? "欄なし");
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(failed ? `${failed} 件が NG` : "全部 OK");
  console.log(`写し: ${dir}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
