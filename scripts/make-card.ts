// 正式な流れの作成（034a）を、デモの 8 項目の取り出しの結果（git の外の台本のフォルダ）から 1 枚だけ試す。
// コマの PNG は private/picto/make に書き、画面に出すのは数だけ。
//
//   npx tsx scripts/make-card.ts <項目の番号 1〜8> [決まりの番号 0〜] [台本のフォルダ]
//   CHECK=1 を付けると、確かめる AI（仮版）で採点し、赤なら作り直す（034b。上限は MAX_FIXES=<回数>、既定 1）
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeClient } from "../src/node/client";
import { FileCallLog } from "../src/node/file-log";
import { imageBlock, svgToPng } from "../src/node/png";
import { privatePath } from "../src/node/private-dir";
import { validateCard } from "../src/shared/card";
import { makeAndCheck } from "../src/shared/make/loop";
import { makeCard, type OkRule } from "../src/shared/make/maker";
import { cutFrames } from "../src/shared/picto/motion";
import { renderFrame } from "../src/shared/picto/scene";
import { checkStyle } from "../src/shared/picto/style";

const [no, k = "0", dir = join(import.meta.dirname, "..", "scratch", "measure8")] = process.argv.slice(2);
const all = JSON.parse(readFileSync(join(dir, "out_rules021.json"), "utf-8")) as { id: number; rules: (OkRule & { from: { page: number } })[] }[];
const rule = all.find((x) => x.id === Number(no))?.rules[Number(k)];
if (!rule) throw new Error("その項目か決まりが無い");
const log = new FileCallLog();
const t0 = Date.now();
const deps = { client: makeClient(), log };
const locate = (f: { line: number }) => ({ kind: "doc" as const, doc: "manual", page: (f as unknown as { page: number }).page ?? 1, line: f.line });
let card;
let calls = 0;
if (process.env.CHECK) {
  const checks = await makeAndCheck(deps, "measure", rule, locate, { render: (f) => imageBlock(svgToPng(renderFrame(f).svg)), maxFixes: Number(process.env.MAX_FIXES ?? 1) });
  card = checks.at(-1)!.card;
  calls = checks.length * 3;
  console.log(`試し ${checks.length} 回・点 ${checks.map((c) => `${c.match.score}${c.red ? "（赤）" : ""}`).join(" → ")}`);
} else {
  const made = await makeCard(deps, "measure", rule, locate);
  card = made.card;
  calls = made.messages.length;
}
const messages = { length: calls };
const out = privatePath("picto", "make", `item${no}-${k}`);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "card.json"), JSON.stringify(card, null, 1), "utf-8");
const frames = card.motion.kind === "keyframes" ? cutFrames(card.motion.json) : [];
const style = frames.flatMap(({ frame }, i) => {
  const svg = renderFrame(frame).svg;
  writeFileSync(join(out, `frame${i + 1}.png`), svgToPng(svg));
  return checkStyle(svg);
});
const usd = await log.sumUsd("measure", new Date(t0).toISOString());
console.log(`コマ ${frames.length}・部品 ${card.parts.length}（経路の無い部品 ${validateCard(card).filter((e) => e.includes("経路")).length}）・文 ${card.statements.length}（AI が書いた文 ${card.statements.filter((s) => s.ai).length}）・呼び出し ${messages.length} 回・絵柄の決まりの違反 ${style.length}・${usd.toFixed(4)} USD・${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
