// 絵の作り方を 8 枚で比べる（079b）。守ることは git の外の台本のフォルダ（out/card<n>.json）から読む。
// 11/2 の見た目の直しのあとは、PICTO_WAYS=motion PICTO_TAG=sketch で「動きから切り出し」だけを流し直す。
// 3 つの作り方: Sonnet の角度 / Opus 5.5 の角度 / Opus 5.5 の動きから切り出し。
// どれも作り直しはせず、確かめる AI（仮版）に絵だけを見せて点を出す。並べた PNG はリポジトリの外（RECORD_DIR/picto）。
//
//   npx tsx scripts/measure/picto8.ts [台本のフォルダ]   （既定は scratch/measure8）
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { makeClient } from "../../src/node/client";
import { FileCallLog } from "../../src/node/file-log";
import { imageBlock, svgToPng } from "../../src/node/png";
import { costUsd, guardedCall } from "../../src/shared/claude";
import { type DrawMode, drawCard } from "../../src/shared/picto/draw";
import { cutFrames, type FrameJson, keyToFrame, type MotionJson } from "../../src/shared/picto/motion";
import { type Frame, renderFrame } from "../../src/shared/picto/scene";
import { checkStyle } from "../../src/shared/picto/style";
import { isRed, type Match, matchParams, type Reading, readerParams } from "../../src/shared/verify/verify";

const dir = process.argv[2] ?? join(import.meta.dirname, "..", "..", "scratch", "measure8");
const RECORD_DIR = process.env.RECORD_DIR || join(tmpdir(), "genba-kamishibai-rec");
const TAG = process.env.PICTO_TAG || "079b";
const out = join(RECORD_DIR, "picto", `compare${TAG}`);
mkdirSync(out, { recursive: true });

const ALL_WAYS: { key: string; label: string; model: string; mode: DrawMode }[] = [
  { key: "sonnet", label: "Sonnet の角度", model: "claude-sonnet-5-5", mode: "angles" },
  { key: "opus", label: "Opus 5.5 の角度", model: "claude-opus-5-5", mode: "angles" },
  { key: "motion", label: "Opus 5.5 の動きから切り出し", model: "claude-opus-5-5", mode: "motion" },
];
const WAYS = process.env.PICTO_WAYS ? ALL_WAYS.filter((w) => process.env.PICTO_WAYS?.split(",").includes(w.key)) : ALL_WAYS;

const cards = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => {
  const c = JSON.parse(readFileSync(join(dir, "out", `card${id}.json`), "utf-8"));
  return { id, rule: c.rule.rule as string, why: (c.rule.why ?? undefined) as string | undefined };
});

/** コマを横に並べた 1 枚の SVG（1 コマなら 1 枚の絵そのもの） */
function strip(frames: Frame[], cell = 768): string {
  if (frames.length === 1) return renderFrame(frames[0], cell).svg;
  const parts = frames.map((f, i) => {
    const inner = renderFrame(f, cell).svg.replace(/^<svg[^>]*>|<\/svg>$/g, "");
    return `<g transform="translate(${i * cell} 0)">${inner}<rect width="${cell}" height="${cell}" fill="none" stroke="#000" stroke-width="6"/></g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cell * frames.length}" height="${cell}" viewBox="0 0 ${cell * frames.length} ${cell}">${parts.join("")}</svg>`;
}

const parse = <T>(m: Anthropic.Message) => JSON.parse(m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as T;
const usd = (ms: Anthropic.Message[]) => ms.reduce((s, m) => s + costUsd(m.model, m.usage), 0);

const deps = { client: makeClient(), log: new FileCallLog() };

async function one(card: (typeof cards)[number], way: (typeof WAYS)[number]) {
  const t0 = Date.now();
  try {
    const d = await drawCard(deps, "measure", way.model, way.mode, card.rule, card.why);
    const drawSec = (Date.now() - t0) / 1000;
    const svg = strip(d.frames);
    const style = d.frames.flatMap((f) => checkStyle(renderFrame(f).svg));
    const png = svgToPng(svg, 768 * d.frames.length);
    writeFileSync(join(out, `card${card.id}_${way.key}.png`), png);
    const r = await guardedCall(deps, { purpose: "measure", label: "確かめる AI", params: readerParams(imageBlock(png)) });
    const reading = parse<Reading>(r);
    const m = await guardedCall(deps, { purpose: "measure", label: "照合", params: matchParams(card.rule, card.why, reading) });
    const match = parse<Match>(m);
    return {
      card: card.id, way: way.key, ok: true, frames: d.frames.length, drawUsd: usd(d.messages), drawCalls: d.messages.length, drawSec,
      verifyUsd: usd([r, m]), score: match.score, dangerous: match.dangerous, red: isRed(match), style: style.length,
      meaning: reading.meaning, reason: match.reason, json: d.json,
    };
  } catch (e) {
    return { card: card.id, way: way.key, ok: false, error: String(e).slice(0, 300), drawSec: (Date.now() - t0) / 1000 };
  }
}

const T0 = Date.now();
const results = await Promise.all(cards.flatMap((c) => WAYS.map((w) => one(c, w))));
writeFileSync(join(dir, `out_picto${TAG}.json`), JSON.stringify(results, null, 1), "utf-8");

// 3 つを並べた PNG（行が 1 枚、列が作り方。動きはコマを縮めて並べる）
const cell = 300;
const rows = cards.map((c, ri) =>
  WAYS.map((w, ci) => {
    const r = results.find((x) => x.card === c.id && x.way === w.key);
    const x0 = ci * cell * 2;
    if (!r?.ok || !("json" in r)) return `<rect x="${x0}" y="${ri * cell}" width="${cell * 2}" height="${cell}" fill="#ddd"/>`;
    const frames = w.mode === "angles" ? [keyToFrame(r.json as FrameJson)] : cutFrames(r.json as MotionJson).map((c) => c.frame);
    const svg = strip(frames);
    const n = frames.length;
    const scale = Math.min((cell * 2) / (768 * n), cell / 768);
    const inner = svg.replace(/^<svg[^>]*>|<\/svg>$/g, "");
    return `<g transform="translate(${x0} ${ri * cell}) scale(${scale})">${inner}</g><rect x="${x0}" y="${ri * cell}" width="${cell * 2}" height="${cell}" fill="none" stroke="#888" stroke-width="2"/>`;
  }).join(""),
);
const W = cell * 2 * WAYS.length;
writeFileSync(join(out, "compare.png"), svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${cell * cards.length}"><rect width="100%" height="100%" fill="#fff"/>${rows.join("")}</svg>`, W));


for (const w of WAYS) {
  const rs = results.filter((r) => r.way === w.key);
  const ok = rs.filter((r) => r.ok) as Extract<(typeof results)[number], { ok: true }>[];
  const avg = (f: (r: (typeof ok)[number]) => number) => (ok.length ? ok.reduce((s, r) => s + f(r), 0) / ok.length : 0);
  console.log(
    `${w.label}: 通った ${ok.length}/8 ・ 絵の数字 ${ok.reduce((s, r) => s + r.drawUsd, 0).toFixed(4)} USD（1 枚 ${avg((r) => r.drawUsd).toFixed(4)}）` +
      ` ・ 時間 1 枚 ${avg((r) => r.drawSec).toFixed(0)} 秒 ・ 点の平均 ${avg((r) => r.score).toFixed(1)} ・ 赤 ${ok.filter((r) => r.red).length} ・ 危ない ${ok.filter((r) => r.dangerous).length}` +
      ` ・ 確かめる費用 ${ok.reduce((s, r) => s + r.verifyUsd, 0).toFixed(4)} USD ・ 絵柄の違反 ${ok.reduce((s, r) => s + r.style, 0)}`,
  );
  for (const r of rs) if (!r.ok) console.log(`  枚 ${r.card} 失敗: ${"error" in r ? r.error : ""}`);
}
console.log(`全体 ${((Date.now() - T0) / 1000).toFixed(0)} 秒`);
