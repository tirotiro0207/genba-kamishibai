// 署名済みのカードを、版と日付入りの PNG・SVG に書き出す（077）。コマごとに 1 枚ずつ、絵の下に「版・署名の日付・何コマ目か」の帯。
// 置き場は EXPORT_DIR（無ければ private/export。git の外）。署名のあとに中身が書き換わったカードは書き出さない。
//
//   npx tsx scripts/export-cards.ts [テナント] [http://localhost:5179] [--sheet] [--principles]
//   --sheet       コマごとの絵に加えて、1 枚ごとに掲示の版（A4 横の 1 枚）も書き出す
//   --principles  原則の 1 コマのカードを横 1 列に並べた 1 枚（貼り紙の下に付ける列）も書き出す
//   会社のテナントは、入ったしるしを AUTH（Bearer の中身）と ROLE（役割のしるし）で渡す
import { join } from "node:path";
import type { CardBody } from "../src/shared/card";
import { dayOf, exportCard, exportPrinciples, exportSheet, type PrincipleItem } from "../src/shared/export";
import { writeExports } from "../src/node/export";
import { privatePath } from "../src/node/private-dir";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
for (const f of flags) if (f !== "--sheet" && f !== "--principles") throw new Error(`知らない印: ${f}（--sheet・--principles）`);
const tenant = args[0] ?? "practice";
const base = `${args[1] ?? "http://localhost:5179"}/api/t/${encodeURIComponent(tenant)}/cards`;
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
const principles: PrincipleItem[] = [];
for (const c of cards.filter((x) => x.status === "signed")) {
  const s = await get<{ signed: boolean; signed_at: string; version: number; matches: boolean }>(`/${encodeURIComponent(c.id)}/signature`);
  if (!s.matches || s.version !== c.version) {
    console.log(`${c.id}: 署名のあとに中身が変わっているので書き出さない`);
    continue;
  }
  const files = writeExports(exportCard(c.id, c.body, c.version, s.signed_at), dir);
  if (flags.has("--sheet")) writeExports([exportSheet(c.id, c.body, c.version, s.signed_at)], dir);
  principles.push({ id: c.id, body: c.body, version: c.version, signedAt: s.signed_at });
  n++;
  console.log(`${c.id}: ${files.length / 2} コマ（版 ${c.version}）${flags.has("--sheet") ? "・掲示の版" : ""}`);
}
console.log(`${n} 枚を ${dir} に書き出した`);
if (flags.has("--principles")) {
  // 前の回の列を上書きしないよう、名前に書き出した日を付ける
  const strip = exportPrinciples(principles, `principles_${dayOf(new Date().toISOString())}`);
  if (strip) {
    writeExports([strip], dir);
    console.log(`原則の列（${principles.filter((x) => x.body.shape === "principle").length} 枚）を ${strip.name} に書き出した`);
  } else console.log("原則の 1 コマのカードが無いので、原則の列は書き出さない");
}
