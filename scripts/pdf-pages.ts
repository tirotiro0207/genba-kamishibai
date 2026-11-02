// 資料の PDF を、ページの画像と行番号付きの文字にするスクリプト（031b）。会社の資料は手元で処理し、
// 結果（ページの PNG・行の JSON・一覧）だけを、テナントの非公開の置き場か private/pdf に入れる。
//
//   npx tsx scripts/pdf-pages.ts <PDF> <資料の名前>                 # private/pdf/<資料の名前>/ に書く（文字の層が無いページは空のまま）
//   npx tsx scripts/pdf-pages.ts <PDF> <資料の名前> --ocr           # 文字の層が無いページを Opus で読む（費用は private/logs の記録に残る）
//   npx tsx scripts/pdf-pages.ts <PDF> <資料の名前> --upload <テナント>  # BASE_URL のテナントの置き場 pdf/<資料の名前>/ に入れる（PIN は UPLOAD_PIN）
// PDF を省くと環境変数 MANUAL_PDF を使う。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeClient } from "../src/node/client";
import { FileCallLog } from "../src/node/file-log";
import { pdfPages } from "../src/node/pdf";
import { privatePath } from "../src/node/private-dir";

const pad = (n: number) => String(n).padStart(3, "0");

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(name);
  const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const pos = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--upload"));
  const [pdf, name] = pos.length >= 2 ? pos : [process.env.MANUAL_PDF, pos[0]];
  if (!pdf || !name || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) throw new Error("使い方: pdf-pages.ts <PDF> <資料の名前（英数字）> [--ocr] [--upload <テナント>]");

  const t0 = Date.now();
  const log = new FileCallLog();
  const pages = await pdfPages(new Uint8Array(readFileSync(pdf)), flag("--ocr") ? { ocr: { deps: { client: makeClient(), log }, purpose: "night" } } : {});
  const index = {
    doc: name,
    pages: pages.map((p) => ({ page: p.page, width: p.width, height: p.height, source: p.source, lines: p.lines.length, chars: p.lines.reduce((s, l) => s + l.text.replace(/\s/g, "").length, 0) })),
  };
  const files: [string, Uint8Array | string, string][] = [];
  for (const p of pages) {
    files.push([`pdf/${name}/p${pad(p.page)}.png`, p.png, "image/png"]);
    files.push([`pdf/${name}/p${pad(p.page)}.json`, JSON.stringify({ page: p.page, source: p.source, lines: p.lines }), "application/json"]);
  }
  files.push([`pdf/${name}/index.json`, JSON.stringify(index), "application/json"]);

  const tenant = opt("--upload");
  if (tenant) {
    const base = process.env.BASE_URL ?? "http://127.0.0.1:8787";
    const headers: Record<string, string> = {};
    if (process.env.UPLOAD_PIN) {
      const s = await fetch(`${base}/api/t/${tenant}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: process.env.UPLOAD_PIN }) });
      if (!s.ok) throw new Error(`PIN で入れない: ${s.status}`);
      headers.authorization = `Bearer ${((await s.json()) as { token: string }).token}`;
    }
    for (const [path, body, type] of files) {
      const r = await fetch(`${base}/api/t/${tenant}/files/${path}`, { method: "PUT", headers: { ...headers, "content-type": type }, body });
      if (!r.ok) throw new Error(`${path} を入れられない: ${r.status}`);
    }
  } else {
    for (const [path, body] of files) {
      const out = privatePath(...path.split("/"));
      mkdirSync(join(out, ".."), { recursive: true });
      writeFileSync(out, body);
    }
  }
  const ocr = pages.filter((p) => p.source === "ocr").length;
  console.log(`${pages.length} ページ（文字の層あり ${pages.length - ocr}・無し ${ocr}）、${((Date.now() - t0) / 1000).toFixed(1)} 秒、${tenant ? `テナント ${tenant} の置き場` : "private/pdf"} に入れた`);
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exitCode = 1;
});
