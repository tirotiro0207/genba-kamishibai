// 会社のテナントと役割（作者・監修者 2 名・教育担当・新入社員）を、手元の D1 に作る（038）。
// PIN は手元用に乱数で作り、private/tenants/<テナント>.json にだけ置く（画面にもログにも出さない）。
// 2 回目からは同じファイルの PIN を使い、ハッシュだけを入れ直す。データ（カード・置き場）は消さない。
//
//   npx tsx scripts/add-company.ts [テナント]      （既定は company。名前は「会社」）
//   npx tsx scripts/add-company.ts company --new  # PIN を作り直す
//   npx tsx scripts/add-company.ts company --remote  # 本番の D1 に入れる（028b）。PIN は手元と別で private/tenants/<テナント>.production.json
import { execSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { privatePath } from "../src/node/private-dir";
import { hashPin } from "../src/worker/tenant";

export const PEOPLE = [
  { role: "author", slot: 1 },
  { role: "supervisor", slot: 1 },
  { role: "supervisor", slot: 2 },
  { role: "trainer", slot: 1 },
  { role: "newhire", slot: 1 },
] as const;

export interface Pins {
  tenant: string;
  /** テナントに入る PIN（POST /api/t/<テナント>/session） */
  pin: string;
  /** 役割ごとの PIN。鍵は「役割番号」（supervisor2 など） */
  people: Record<string, string>;
}

const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join("");
export const pinsPath = (tenant: string, remote = false) => privatePath("tenants", `${tenant}${remote ? ".production" : ""}.json`);

export function newPins(tenant: string): Pins {
  return { tenant, pin: digits(8), people: Object.fromEntries(PEOPLE.map((p) => [`${p.role}${p.slot}`, digits(6)])) };
}

const q = (s: string) => `'${s.replaceAll("'", "''")}'`;

/** テナントと役割の行を入れる SQL。あれば PIN のハッシュだけを入れ直す */
export async function companySql(p: Pins, name: string): Promise<string> {
  const rows = [
    `INSERT INTO tenants (id, kind, name, pin_hash) VALUES (${q(p.tenant)}, 'company', ${q(name)}, ${q(await hashPin(p.pin))}) ON CONFLICT(id) DO UPDATE SET pin_hash = excluded.pin_hash;`,
  ];
  for (const x of PEOPLE)
    rows.push(
      `INSERT INTO people (tenant_id, role, slot, pin_hash) VALUES (${q(p.tenant)}, '${x.role}', ${x.slot}, ${q(await hashPin(p.people[`${x.role}${x.slot}`]))}) ON CONFLICT(tenant_id, role, slot) DO UPDATE SET pin_hash = excluded.pin_hash;`,
    );
  return rows.join("\n") + "\n";
}

async function main() {
  const args = process.argv.slice(2);
  const tenant = args.find((a) => !a.startsWith("--")) ?? "company";
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(tenant)) throw new Error("テナントの名前は英小文字・数字・-");
  const remote = args.includes("--remote");
  const path = pinsPath(tenant, remote);
  const pins = !args.includes("--new") && existsSync(path) ? (JSON.parse(readFileSync(path, "utf-8")) as Pins) : newPins(tenant);
  mkdirSync(privatePath("tenants"), { recursive: true });
  writeFileSync(path, JSON.stringify(pins, null, 2) + "\n", "utf-8");
  const sql = privatePath("tmp", `add-${tenant}.sql`);
  mkdirSync(privatePath("tmp"), { recursive: true });
  writeFileSync(sql, await companySql(pins, "会社"), "utf-8");
  const where = remote ? "--remote --env production" : "--local";
  execSync(`npx wrangler d1 execute DB ${where} --file "${sql}"`, { cwd: join(import.meta.dirname, ".."), stdio: "ignore" });
  console.log(`${remote ? "本番" : "手元"}の D1 に会社のテナント ${tenant} と役割 ${PEOPLE.length} つを入れた。PIN は ${path} にある`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
