// データを最初の状態に戻すスクリプト（030）。練習用は一度で戻る。ほかのテナントは番号を打って確かめる。
//
//   npx tsx scripts/reset.ts practice                 # 手元の開発サーバー（BASE_URL、無ければ http://127.0.0.1:8787）
//   npx tsx scripts/reset.ts <会社のテナント>          # 番号を聞かれ、打つと戻す。PIN は RESET_PIN から読む
//   会社のテナントは監修者だけが戻せる。監修者の PIN を ROLE_PIN、番号（1 か 2）を ROLE_SLOT（無ければ 1）で渡す
import { createInterface } from "node:readline/promises";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8787";

async function main() {
  const tenant = process.argv[2];
  if (!tenant) throw new Error("テナントの番号を渡してください（例: practice）");
  const headers: Record<string, string> = { "content-type": "application/json" };
  let confirm: string | undefined;
  if (tenant !== "practice") {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    confirm = (await rl.question(`${BASE} の ${tenant} を最初の状態に戻します。確かめのため番号をもう一度打ってください: `)).trim();
    rl.close();
    if (confirm !== tenant) throw new Error("番号が合わないので止めた");
    if (process.env.RESET_PIN) {
      const s = await fetch(`${BASE}/api/t/${tenant}/session`, { method: "POST", headers, body: JSON.stringify({ pin: process.env.RESET_PIN }) });
      if (!s.ok) throw new Error(`PIN で入れない: ${s.status}`);
      headers.authorization = `Bearer ${((await s.json()) as { token: string }).token}`;
      // 会社のテナントは監修者のしるしが要る（サーバーが監修者のほかを 403 で断る）。監修者の PIN を ROLE_PIN で渡す
      if (process.env.ROLE_PIN) {
        const slot = Number(process.env.ROLE_SLOT ?? 1);
        if (slot !== 1 && slot !== 2) throw new Error("ROLE_SLOT は 1 か 2");
        const r = await fetch(`${BASE}/api/t/${tenant}/login`, { method: "POST", headers, body: JSON.stringify({ role: "supervisor", slot, pin: process.env.ROLE_PIN }) });
        if (!r.ok) throw new Error(`監修者の PIN で入れない: ${r.status}`);
        headers["x-role"] = ((await r.json()) as { token: string }).token;
      }
    }
  }
  const res = await fetch(`${BASE}/api/t/${tenant}/reset`, { method: "POST", headers, body: JSON.stringify({ confirm }) });
  console.log(res.status, await res.text());
  if (!res.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exitCode = 1;
});
