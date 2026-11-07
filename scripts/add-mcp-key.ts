// MCP の会社ごとの鍵を作る（092）。鍵は private/tenants/<テナント>-mcp.json にだけ置き、D1 にはハッシュだけを入れる。
// 鍵は画面にもログにも出さない。架空の会社（demo）は鍵なしで入れるので作らない。
//
//   npx tsx scripts/add-mcp-key.ts [テナント]             手元の D1 に入れる（既定は company）
//   npx tsx scripts/add-mcp-key.ts company --remote      本番の D1 に入れる（作者が流す）
//   npx tsx scripts/add-mcp-key.ts company --revoke      そのテナントの鍵を全部止める
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { privatePath } from "../src/node/private-dir";
import { hashKey, newKey } from "../src/worker/mcp";

export const keyPath = (tenant: string) => privatePath("tenants", `${tenant}-mcp.json`);
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;

export const addKeySql = (tenant: string, hash: string, label: string) => `INSERT INTO mcp_keys (key_hash, tenant_id, label) VALUES (${q(hash)}, ${q(tenant)}, ${q(label)});\n`;
export const revokeSql = (tenant: string) => `UPDATE mcp_keys SET revoked_at = datetime('now') WHERE tenant_id = ${q(tenant)} AND revoked_at IS NULL;\n`;

async function main() {
  const args = process.argv.slice(2);
  const tenant = args.find((a) => !a.startsWith("--")) ?? "company";
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(tenant)) throw new Error("テナントの名前は英小文字・数字・-");
  if (tenant === "demo") throw new Error("架空の会社は鍵なしで入れる");
  const remote = args.includes("--remote");
  // 本番の D1 は env.production にだけある。--env production が無いと最上位の手元用の DB に向かう
  const where = remote ? "--remote --env production" : "--local";
  let sql: string;
  if (args.includes("--revoke")) sql = revokeSql(tenant);
  else {
    const key = newKey();
    mkdirSync(privatePath("tenants"), { recursive: true });
    writeFileSync(keyPath(tenant), JSON.stringify({ tenant, key, url: `/mcp/${tenant}`, at: new Date().toISOString() }, null, 2) + "\n", "utf-8");
    sql = addKeySql(tenant, await hashKey(key), `${remote ? "remote" : "local"} ${new Date().toISOString().slice(0, 10)}`);
  }
  mkdirSync(privatePath("tmp"), { recursive: true });
  const file = privatePath("tmp", `mcp-key-${tenant}.sql`);
  writeFileSync(file, sql, "utf-8");
  execSync(`npx wrangler d1 execute DB ${where} --file "${file}"`, { stdio: "inherit" });
  console.log(args.includes("--revoke") ? `${tenant} の鍵を止めた` : `${tenant} の鍵を作った。鍵は ${keyPath(tenant)} にだけある`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
