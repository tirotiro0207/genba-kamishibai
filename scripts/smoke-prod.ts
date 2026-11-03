// 本番の公開 URL に軽い動作確認をする（028b）。書き込みはしない（PIN で入るだけ）。
// 練習用と架空の会社は PIN 無しで開き、会社のテナントは PIN が無いと入れない。PIN は private/tenants/<テナント>.production.json から読み、画面にもログにも出さない。
//
//   npx tsx scripts/smoke-prod.ts [URL]   （既定は PROD_URL、無ければ下の URL）
import { existsSync, readFileSync } from "node:fs";
import { pinsPath, type Pins } from "./add-company";

const BASE = (process.argv[2] ?? process.env.PROD_URL ?? "https://genba-kamishibai.ikjshare.workers.dev").replace(/\/$/, "");
let failed = 0;
function check(name: string, ok: boolean, got: unknown) {
  console.log(`${ok ? "OK " : "NG "} ${name}（${String(got)}）`);
  if (!ok) failed++;
}
const status = async (path: string, init?: RequestInit) => (await fetch(BASE + path, init)).status;
const post = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function main() {
  const page = await fetch(`${BASE}/?cb=${Date.now()}`, { headers: { "cache-control": "no-cache" } });
  check("画面が開く", page.status === 200 && (page.headers.get("content-type") ?? "").includes("text/html"), page.status);
  const health = (await (await fetch(`${BASE}/api/health`)).json()) as { ok: boolean; tenants: number };
  check("API が動く", health.ok && health.tenants >= 3, `テナント ${health.tenants}`);
  for (const t of ["practice", "demo"]) check(`${t} は PIN 無しで開く`, (await status(`/api/t/${t}/cards`)) === 200, await status(`/api/t/${t}/cards`));
  check("company は PIN 無しで入れない", (await status("/api/t/company/cards")) === 401, await status("/api/t/company/cards"));
  check("違う PIN は断る", (await status("/api/t/company/session", post({ pin: "x" }))) === 401, "");
  const bad = { headers: { authorization: "Bearer company.9999999999.00" } };
  check("偽のしるしは断る", (await status("/api/t/company/cards", bad)) === 401, "");

  const path = pinsPath("company", true);
  if (!existsSync(path)) {
    console.log(`-- 本番の PIN のファイルが無いので、正しい PIN の確認は飛ばす（${path}）`);
  } else {
    const pins = JSON.parse(readFileSync(path, "utf-8")) as Pins;
    const res = await fetch(`${BASE}/api/t/company/session`, post({ pin: pins.pin }));
    const { token } = (await res.json().catch(() => ({}))) as { token?: string };
    check("正しい PIN で入れる", res.status === 200 && !!token, res.status);
    if (token) {
      // 役割の PIN（personGuard）が要るかどうかは問わず、テナントの関所を越えたこと（401 の「PIN で入ってください」でない）を見る
      const r = await fetch(`${BASE}/api/t/company/cards`, { headers: { authorization: `Bearer ${token}` } });
      const body = await r.text();
      check("しるしでテナントの関所を越える", !body.includes("PIN で入ってください"), r.status);
      check("しるしは別のテナントで使えない", (await status("/api/t/other/cards", { headers: { authorization: `Bearer ${token}` } })) === 404, "");
    }
  }
  console.log(failed ? `${failed} 件が NG` : "全部 OK");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
