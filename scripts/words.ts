// 言葉の欄（036）を、作ったカード 1 枚で試す。カードは make-card.ts の書き出し（private の下の card.json）。
//   npx tsx scripts/words.ts <card.json の場所>
// 言葉の欄と用語の組を card.json の隣の words.json に書く（private の下なので git に入らない）
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeClient } from "../src/node/client";
import { FileCallLog } from "../src/node/file-log";
import type { CardBody } from "../src/shared/card";
import { makeWords } from "../src/shared/make/words";

const [file] = process.argv.slice(2);
if (!file) throw new Error("card.json の場所を渡す");
const card = JSON.parse(readFileSync(file, "utf-8")) as CardBody;
const log = new FileCallLog();
const t0 = Date.now();
const out = await makeWords({ client: makeClient(), log }, "measure", card);
writeFileSync(join(dirname(file), "words.json"), JSON.stringify({ words: out.words, terms: out.terms }, null, 1), "utf-8");
const usd = await log.sumUsd("measure", new Date(t0).toISOString());
console.log(`呼び出し ${out.messages.length} 回・用語 ${out.terms.length}・${usd.toFixed(4)} USD・${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
