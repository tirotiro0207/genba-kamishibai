// 読み手パネルの 1 回分の指示を書き出す（027）。回すのは Claude Code のサブエージェント（045 で使う）。
// 絵の PNG のフォルダを渡すと、絵に「絵 1」などの名前を乱数で付けて private/readers/<回>/pictures/ に番号の名前で写し、
// 読み手ごとの指示と、名前と元のファイルの対応表を書く。読み手に元のファイル名（カードが分かる名前）は見せない。
// 対応表（manifest.json）は読み手に渡さない。
//
//   npx tsx scripts/readers-prompts.ts <絵の PNG のフォルダ> [種]
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { privatePath } from "../src/node/private-dir";
import { rng } from "../src/shared/assign";
import { PANEL_MODEL, PANEL_MODELS, type PanelPicture, readerPrompt } from "../src/shared/readers/prompt";
import { READERS } from "../src/shared/readers/readers";

function main() {
  const [dirArg, seedArg] = process.argv.slice(2);
  if (!dirArg) throw new Error("絵の PNG のフォルダを渡す");
  const files = readdirSync(dirArg).filter((f) => f.endsWith(".png")).sort();
  if (files.length === 0) throw new Error("PNG が無い");
  const seed = seedArg || Date.now().toString(16);
  const runId = `${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${PANEL_MODEL}`;
  // 名前の付け方も乱数にして、ファイル名の順番が読み手の答えに出ないようにする
  const r = rng(`labels:${seed}`);
  const shuffled = [...files];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const out = privatePath("readers", runId);
  mkdirSync(join(out, "pictures"), { recursive: true });
  const pictures: PanelPicture[] = shuffled.map((f, i) => {
    const path = join(out, "pictures", `${String(i + 1).padStart(2, "0")}.png`);
    copyFileSync(resolve(dirArg, f), path);
    return { label: `絵 ${i + 1}`, path };
  });
  const answersDir = join(out, "answers");
  mkdirSync(join(out, "prompts"), { recursive: true });
  mkdirSync(answersDir, { recursive: true });
  const run = { runId, seed, model: PANEL_MODEL, answersDir };
  for (const reader of READERS) writeFileSync(join(out, "prompts", `${reader.id}.md`), readerPrompt(run, reader, pictures), "utf-8");
  writeFileSync(
    join(out, "manifest.json"),
    JSON.stringify({ ...run, modelId: PANEL_MODELS[PANEL_MODEL].id, agentModel: PANEL_MODELS[PANEL_MODEL].agent, readers: READERS.map((x) => x.id), pictures: pictures.map((p, i) => ({ label: p.label, file: basename(p.path), source: shuffled[i] })) }, null, 2),
    "utf-8",
  );
  console.log(`${READERS.length} 人 × ${pictures.length} 枚の指示を書いた（モデル ${PANEL_MODELS[PANEL_MODEL].id}）`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
