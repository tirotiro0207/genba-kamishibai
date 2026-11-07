// 読み手パネルの「元の文を読ませた側」の 1 回分の指示を書き出す（057）。カードごとに、文の元の位置（資料のページと行）から
// 資料の文をそのまま取り出し、読み手ごとの指示と対応表を private/readers/<回>-text/ に書く。マニュアルの文はリポジトリに入れない。
// 回すのは絵の側と同じ Claude Code のサブエージェント。採点は readers-score.ts をそのまま使う（対応表の source は「<カードの ID>_text」）。
//
//   npx tsx scripts/readers-text-prompts.ts <種> <テナント> <カードの ID> [<カードの ID> …]
import { execSync } from "node:child_process";
import { parseJson } from "./demo-rows";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { privatePath } from "../src/node/private-dir";
import { rng } from "../src/shared/assign";
import type { CardBody } from "../src/shared/card";
import { PANEL_MODEL, PANEL_MODELS } from "../src/shared/readers/prompt";
import { READERS } from "../src/shared/readers/readers";
import { type PanelText, readerTextPrompt } from "../src/shared/readers/text-prompt";

type DocSource = { kind: "doc"; doc: string; page: number; line: number; line_end?: number };

/** カードの文の元の位置から、資料の行をページ・行の順に重ねずに取り出す */
export function sourceLines(body: CardBody, page: (doc: string, n: number) => string[]): string[] {
  const keys = new Set<string>();
  for (const s of body.statements)
    for (const src of s.sources as unknown as DocSource[]) {
      if (src.kind !== "doc") continue;
      for (let l = src.line; l <= (src.line_end ?? src.line); l++) keys.add(`${src.doc}\t${String(src.page).padStart(4, "0")}\t${String(l).padStart(4, "0")}`);
    }
  return [...keys].sort().map((k) => {
    const [doc, p, l] = k.split("\t");
    return page(doc, Number(p))[Number(l) - 1] ?? "";
  });
}

function main() {
  const [seed, tenant, ...ids] = process.argv.slice(2);
  if (!seed || !tenant || !ids.length || !/^[\w-]+$/.test(tenant) || !ids.every((x) => /^[\w-]+$/.test(x))) throw new Error("種・テナント・カードの ID を渡す");
  const q = `SELECT id, body FROM cards WHERE tenant_id = '${tenant}' AND id IN (${ids.map((x) => `'${x}'`).join(", ")})`;
  const rows = (parseJson(execSync(`npx wrangler d1 execute DB --local --json --command "${q}"`, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] })) as { results: { id: string; body: string }[] }[])[0].results;
  const page = (doc: string, n: number) => (JSON.parse(readFileSync(privatePath("pdf", doc, `p${String(n).padStart(3, "0")}.json`), "utf-8")) as { lines: { text: string }[] }).lines.map((x) => x.text);
  // 名前の付け方も乱数にして、渡した順番が読み手の答えに出ないようにする（絵の側と同じ）
  const r = rng(`labels:${seed}`);
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const texts: (PanelText & { source: string })[] = order.map((id, i) => {
    const row = rows.find((x) => x.id === id);
    if (!row) throw new Error(`${id}: カードが無い`);
    const lines = sourceLines(JSON.parse(row.body) as CardBody, page).filter((l) => l.trim());
    if (!lines.length) throw new Error(`${id}: 資料の元の位置が無い`);
    return { label: `文 ${i + 1}`, text: lines.join("\n"), source: `${id}_text` };
  });
  const runId = `${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${PANEL_MODEL}-text`;
  const out = privatePath("readers", runId);
  const answersDir = join(out, "answers");
  mkdirSync(join(out, "prompts"), { recursive: true });
  mkdirSync(answersDir, { recursive: true });
  mkdirSync(join(out, "pictures"), { recursive: true });
  const run = { runId, seed, model: PANEL_MODEL, answersDir };
  for (const reader of READERS) writeFileSync(join(out, "prompts", `${reader.id}.md`), readerTextPrompt(run, reader, texts), "utf-8");
  writeFileSync(
    join(out, "manifest.json"),
    JSON.stringify({ ...run, modelId: PANEL_MODELS[PANEL_MODEL].id, agentModel: PANEL_MODELS[PANEL_MODEL].agent, readers: READERS.map((x) => x.id), kind: "text", pictures: texts.map((t) => ({ label: t.label, file: "", source: t.source })) }, null, 2),
    "utf-8",
  );
  console.log(`${READERS.length} 人 × ${texts.length} 文の指示を ${out} に書いた（モデル ${PANEL_MODELS[PANEL_MODEL].id}）`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
