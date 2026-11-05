// 読み手パネルの採点（027）。readers-prompts.ts で作った回のフォルダを使う。045 で使う。
//   npx tsx scripts/readers-score.ts judge <回のフォルダ> <cards.json>   # 判定役のサブエージェントへの指示 judge.md を書く
//   npx tsx scripts/readers-score.ts tally <回のフォルダ>                 # judge.json を数えて score.md を書く
// cards.json はカードの API（GET /api/t/<テナント>/cards）の返す { cards: [{ id, body }] }。
// 先に決めた正解（eval/rules30 の 30 個。本体は git の外）で照らすときは、cards.json の代わりにその { items: [{ card_id, answer, why }] } を渡す（照らす相手は answer）。
// 絵の元のファイル名は「<カードの ID>.png」か「<カードの ID>_<何か>.png」にしておく（その ID でカードと結ぶ）。
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CardBody } from "../src/shared/card";
import { type PanelModel, parseReaderResult } from "../src/shared/readers/prompt";
import { READERS } from "../src/shared/readers/readers";
import { aggregate, cardTable, judgePrompt, type KeyCard, parseJudgments } from "../src/shared/readers/score";

interface Manifest {
  runId: string;
  seed: string;
  model: PanelModel;
  modelId: string;
  answersDir: string;
  pictures: { label: string; file: string; source: string }[];
}

const cardIdOf = (source: string) => source.replace(/\.png$/i, "").split("_")[0];

function load(dir: string) {
  const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8")) as Manifest;
  const pictures = m.pictures.map((p) => ({ label: p.label, path: join(dir, "pictures", p.file) }));
  const run = { runId: m.runId, seed: m.seed, model: m.model, answersDir: m.answersDir };
  const answers = readdirSync(join(dir, "answers")).filter((f) => f.endsWith(".json"));
  const results = answers.map((f) => {
    const reader = READERS.find((r) => `${r.id}.json` === f);
    if (!reader) throw new Error(`知らない読み手の答え: ${f}`);
    return parseReaderResult(JSON.parse(readFileSync(join(dir, "answers", f), "utf-8")), run, reader, pictures);
  });
  return { m, results };
}

function main() {
  const [cmd, dir, cardsPath] = process.argv.slice(2);
  if (!dir || !existsSync(join(dir, "manifest.json"))) throw new Error("回のフォルダ（manifest.json のある所）を渡す");
  const { m, results } = load(dir);
  const keysPath = join(dir, "keys.json");
  if (cmd === "judge") {
    if (!cardsPath) throw new Error("cards.json を渡す");
    const src = JSON.parse(readFileSync(cardsPath, "utf-8")) as { cards?: { id: string; body: CardBody }[]; items?: { card_id: string; answer: string; why: string }[] };
    const cards = src.cards ?? (src.items ?? []).map((x) => ({ id: x.card_id, body: { rule: x.answer, why: x.why } as CardBody }));
    const keys: KeyCard[] = m.pictures.map((p) => {
      const c = cards.find((x) => x.id === cardIdOf(p.source));
      if (!c) throw new Error(`絵 ${p.source} のカードが無い`);
      return { label: p.label, cardId: c.id, rule: c.body.rule, why: c.body.why };
    });
    writeFileSync(keysPath, JSON.stringify(keys, null, 2), "utf-8");
    writeFileSync(join(dir, "judge.md"), judgePrompt(m.runId, m.model, keys, results, join(dir, "judge.json")), "utf-8");
    console.log(`読み手 ${results.length} 人・答え ${results.reduce((s, r) => s + r.answers.length, 0)} 件の判定の指示を書いた（${m.modelId}）`);
  } else if (cmd === "tally") {
    const keys = JSON.parse(readFileSync(keysPath, "utf-8")) as KeyCard[];
    const js = parseJudgments(JSON.parse(readFileSync(join(dir, "judge.json"), "utf-8")), m.runId, m.model, keys, results);
    const table = cardTable(aggregate(keys, js), m.modelId);
    writeFileSync(join(dir, "score.md"), `# 読み手パネル ${m.runId}\n\n${table}\n`, "utf-8");
    console.log(table);
  } else throw new Error("judge か tally");
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
