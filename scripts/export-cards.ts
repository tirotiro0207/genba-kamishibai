// 署名済みのカードを、版と日付入りの PNG・SVG に書き出す（077）。コマごとに 1 枚ずつ、絵の下に「版・署名の日付・何コマ目か」の帯。
// 置き場は EXPORT_DIR（無ければ private/export。git の外）。署名のあとに中身が書き換わったカードは書き出さない。
//
//   npx tsx scripts/export-cards.ts [テナント] [http://localhost:5179]
//   会社のテナントは、入ったしるしを AUTH（Bearer の中身）と ROLE（役割のしるし）で渡す
import { join } from "node:path";
import type { CardBody } from "../src/shared/card";
import { exportCard } from "../src/shared/export";
import { writeExports } from "../src/node/export";
import { privatePath } from "../src/node/private-dir";

const tenant = process.argv[2] ?? "practice";
const base = `${process.argv[3] ?? "http://localhost:5179"}/api/t/${encodeURIComponent(tenant)}/cards`;
const headers: Record<string, string> = {};
if (process.env.AUTH) headers.authorization = `Bearer ${process.env.AUTH}`;
if (process.env.ROLE) headers["x-role"] = process.env.ROLE;
const get = async <T>(path: string) => {
  const r = await fetch(`${base}${path}`, { headers });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
};

const dir = process.env.EXPORT_DIR || join(privatePath("export"), tenant);
const { cards } = await get<{ cards: { id: string; status: string; version: number; body: CardBody }[] }>("");
let n = 0;
for (const c of cards.filter((x) => x.status === "signed")) {
  const s = await get<{ signed: boolean; signed_at: string; version: number; matches: boolean }>(`/${encodeURIComponent(c.id)}/signature`);
  if (!s.matches || s.version !== c.version) {
    console.log(`${c.id}: 署名のあとに中身が変わっているので書き出さない`);
    continue;
  }
  const files = writeExports(exportCard(c.id, c.body, c.version, s.signed_at), dir);
  n++;
  console.log(`${c.id}: ${files.length / 2} コマ（版 ${c.version}）`);
}
console.log(`${n} 枚を ${dir} に書き出した`);
