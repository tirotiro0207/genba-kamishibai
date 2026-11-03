// 読み手パネルに見せる絵を作る（045）。カード 1 枚 = 絵 1 枚で、3〜4 コマを左から順に横に並べる。文字は入れない
// （版や日付の帯も付けない）。カードは手元の D1 から読み、絵は「<カードの ID>.png」で書く（readers-score.ts がその ID で結ぶ）。
// 置き場は git の外（private/readers/pics/<名前>）。そのフォルダを readers-prompts.ts に渡す。
// 直した動き（058）を試すときは、環境変数 READERS_MOTIONS に「<カードの ID>.json」（キーフレームの JSON）の
// フォルダを渡す。そこにあるカードは、D1 の動きの代わりにその JSON で描く。
//
//   npx tsx scripts/readers-pictures.ts <名前> <テナント> <カードの ID> [<カードの ID> …]
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { svgToPng } from "../src/node/png";
import { privatePath } from "../src/node/private-dir";
import type { CardBody } from "../src/shared/card";
import { cutFrames, type MotionJson, validateMotion } from "../src/shared/picto/motion";
import { renderFrame } from "../src/shared/picto/scene";
import { SIZE } from "../src/shared/pose/svg";

const GAP = 24;

/** コマの SVG を横に並べた 1 枚の SVG。コマの間は白い隙間で分ける */
export function strip(frames: string[]): string {
  const w = frames.length * SIZE + (frames.length - 1) * GAP;
  const cells = frames.map((svg, i) => svg.replace(/^<svg\b/, `<svg x="${i * (SIZE + GAP)}" y="0"`));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${SIZE}" viewBox="0 0 ${w} ${SIZE}"><rect width="${w}" height="${SIZE}" fill="#fff"/>${cells.join("")}</svg>`;
}

function main() {
  const [name, tenant, ...ids] = process.argv.slice(2);
  if (!name || !tenant || !ids.length || !/^[\w-]+$/.test(tenant) || !ids.every((x) => /^[\w-]+$/.test(x))) throw new Error("名前・テナント・カードの ID を渡す");
  const q = `SELECT id, body FROM cards WHERE tenant_id = '${tenant}' AND id IN (${ids.map((x) => `'${x}'`).join(", ")})`;
  const out = execSync(`npx wrangler d1 execute DB --local --json --command "${q}"`, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  const rows = (JSON.parse(out) as { results: { id: string; body: string }[] }[])[0].results;
  const dir = privatePath("readers", "pics", name);
  mkdirSync(dir, { recursive: true });
  for (const id of ids) {
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error(`${id}: カードが無い`);
    const body = JSON.parse(row.body) as CardBody;
    if (body.motion.kind !== "keyframes") throw new Error(`${id}: キーフレームの動きではない`);
    const fixed = process.env.READERS_MOTIONS ? join(process.env.READERS_MOTIONS, `${id}.json`) : "";
    const motion = fixed && existsSync(fixed) ? (JSON.parse(readFileSync(fixed, "utf-8")) as MotionJson) : body.motion.json;
    const errs = validateMotion(motion);
    if (errs.length) throw new Error(`${id}: ${errs.slice(0, 3).join(" / ")}`);
    const frames = cutFrames(motion).map(({ frame }) => renderFrame(frame).svg);
    const svg = strip(frames);
    writeFileSync(join(dir, `${id}.png`), svgToPng(svg, frames.length * SIZE + (frames.length - 1) * GAP));
    console.log(`${id}: ${frames.length} コマ${motion === body.motion.json ? "" : "（直した動き）"}`);
  }
  console.log(`${ids.length} 枚を ${dir} に書いた`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
