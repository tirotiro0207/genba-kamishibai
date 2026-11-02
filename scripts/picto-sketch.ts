// 作者のスケッチ（docs/sketches）どおりに、部品だけで描けるかを確かめる（11/2 の見た目の直し）。
// 「迷ったら、ひとりで決めずに上の人に聞く」の 3 コマを、手で書いたキーフレームの JSON から切り出す。
// この JSON は確かめ用の手本で、絵の数字を決める AI のプロンプトには入れない。出力はリポジトリの外（RECORD_DIR/picto/sketch）。
//
//   npx tsx scripts/picto-sketch.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cutPngs } from "../src/node/motion-png";
import type { MotionJson } from "../src/shared/picto/motion";
import { POSES } from "../src/shared/picto/poses";

type Key = MotionJson["keyframes"][number];
type Fig = Key["figures"][number];
type Prop = Key["props"][number];

const RECORD_DIR = process.env.RECORD_DIR || join(tmpdir(), "genba-kamishibai-rec");
const H = 0.52;

const fig = (role: Fig["role"], x: number, facing: Fig["facing"], angles: Fig["angles"]): Fig => ({ role, x, height: H, facing, angles });
/** 上の人: 両手で手元のチェックリストを持つ */
const holding = { ...POSES.stand, arm_near_upper: 45, arm_near_lower: 75, arm_far_upper: 50, arm_far_lower: 65 };
/** 上の人: 手前の手で指し、奥の手でチェックリストを持つ */
const leadPoint = { ...POSES.point, arm_near_upper: 112, arm_far_upper: 40, arm_far_lower: 70 };
/** 新人: 手前の手を盤へのばす */
const reach = { ...POSES.stand, neck: -8, arm_near_upper: 82, arm_near_lower: 8 };

const at = (figure: number, dx: number, dy: number) => ({ figure, joint: "head" as const, dx, dy, x: 0, y: 0 });
/** 並びは全部のコマで同じ。出し入れは show で決める */
const props = (show: [boolean, boolean, boolean]): Prop[] => [
  { kind: "panel", show: true, figure: -1, joint: "hip", dx: 0, dy: 0, x: 0.17, y: 0.47, size: 0.15, inner: "none" },
  { kind: "checklist", show: true, figure: 1, joint: "hand_far", dx: 0.02, dy: 0, x: 0, y: 0, size: 0.075, inner: "none" },
  { kind: "think_question", show: show[0], ...at(0, -0.3, -0.42), size: 0.27, inner: "panel" },
  { kind: "bubble_question", show: show[1], ...at(0, 0.12, -0.42), size: 0.27, inner: "panel" },
  { kind: "bubble_check", show: show[2], ...at(1, 0.1, -0.42), size: 0.27, inner: "panel" },
];

export const MAYOTTARA: MotionJson = {
  keyframes: [
    // 1 盤の前で迷って考える（点線の吹き出しに盤と ?）。上の人は離れたところでチェックリストを見ている
    { t: 0, mark: true, figures: [fig("new", 0.3, "left", reach), fig("lead", 0.84, "left", holding)], props: props([true, false, false]) },
    { t: 1.2, mark: false, figures: [fig("new", 0.42, "right", POSES.walk), fig("lead", 0.84, "left", holding)], props: props([false, false, false]) },
    // 2 上の人のところへ行き、指さして聞く（話す吹き出しに盤と ?）
    { t: 2.5, mark: true, figures: [fig("new", 0.5, "right", POSES.point), fig("lead", 0.84, "left", holding)], props: props([false, true, false]) },
    // 3 上の人が盤の方を指さして答える（吹き出しに盤と ✓）
    { t: 4.5, mark: true, figures: [fig("new", 0.5, "right", POSES.stand), fig("lead", 0.8, "left", leadPoint)], props: props([false, false, true]) },
  ],
};

function main() {
  const out = join(RECORD_DIR, "picto", "sketch");
  mkdirSync(out, { recursive: true });
  const pngs = cutPngs(MAYOTTARA);
  pngs.forEach((c, i) => writeFileSync(join(out, `mayottara_${i + 1}.png`), c.png));
  writeFileSync(join(out, "mayottara.json"), JSON.stringify(MAYOTTARA, null, 1));
  console.log(`${pngs.length} コマを書いた: ${out}`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
