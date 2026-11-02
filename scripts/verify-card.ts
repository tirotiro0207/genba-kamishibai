// 確かめる AI の正式版（047）を、手元のカード 1 枚に流す。コマを PNG にして絵だけを順に渡し、伝わる率と証拠を出す。
// 証拠はカードと同じフォルダの evidence.json に書く（git の外）。画面に出すのは数と理由だけ。
//
//   npx tsx scripts/verify-card.ts <card.json>
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeClient } from "../src/node/client";
import { FileCallLog } from "../src/node/file-log";
import { imageBlock, svgToPng } from "../src/node/png";
import type { CardBody } from "../src/shared/card";
import { cutFrames } from "../src/shared/picto/motion";
import { renderFrame } from "../src/shared/picto/scene";
import { verifyCard } from "../src/shared/verify/formal";

const file = process.argv[2];
if (!file) throw new Error("使い方: verify-card.ts <card.json>");
const card = JSON.parse(readFileSync(file, "utf-8")) as CardBody;
if (card.motion.kind !== "keyframes") throw new Error("キーフレームの動きのカードだけ");
const log = new FileCallLog();
const t0 = Date.now();
const images = cutFrames(card.motion.json).map(({ frame }) => imageBlock(svgToPng(renderFrame(frame).svg)));
const e = await verifyCard({ client: makeClient(), log }, "measure", card, images);
writeFileSync(join(dirname(file), "evidence.json"), JSON.stringify(e, null, 1), "utf-8");
const usd = await log.sumUsd("measure", new Date(t0).toISOString());
console.log(`コマ ${e.frames}・伝わる率 ${e.rate}%（${e.band}）・危ない読み違い ${e.dangerous ? "あり" : "なし"}・伝わったコマ ${e.cited.join(",") || "無し"}`);
console.log(`文ごと: ${e.points.map((p) => `${p.id}=${p.credit}${p.frame ? `@${p.frame}` : ""}`).join(" ")}`);
console.log(`呼び出し 2 回・${usd.toFixed(4)} USD・${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
