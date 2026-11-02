// 直しのループ（034b・工程 5）。作った下書きのコマを、確かめる AI の正式版（047）に絵だけ順に見せて伝わる率を出し、
// 赤なら、どう読まれたかを渡して作り直す。作り直しの回数の上限は用途ごとに決め、呼ぶ側が変えられる。夜間は 0。
import type { CardBody } from "../card";
import type { GuardedDeps, Purpose } from "../claude";
import type { Frame } from "../picto/scene";
import { cutFrames } from "../picto/motion";
import { type Evidence, verifyCard } from "../verify/formal";
import type { ImageBlock } from "../verify/verify";
import { type Locate, makeCard, type OkRule } from "./maker";

/** 作り直しの回数の上限（用途ごと）。夜間は 0（作り直しは監修者の画面で） */
export const MAX_FIXES: Record<Purpose, number> = { night: 0, app: 2, demo: 1, mcp: 1, hook: 0, measure: 2 };

export interface Check {
  card: CardBody;
  evidence: Evidence;
  red: boolean;
}

export async function checkCard(deps: GuardedDeps, purpose: Purpose, card: CardBody, render: (f: Frame) => ImageBlock): Promise<Check> {
  if (card.motion.kind !== "keyframes") throw new Error("確かめるのはキーフレームの動きだけ（HTML の動きはコマの PNG を渡す形にする）");
  const evidence = await verifyCard(deps, purpose, card, cutFrames(card.motion.json).map(({ frame }) => render(frame)));
  return { card, evidence, red: evidence.band === "red" };
}

export interface LoopOptions {
  render: (f: Frame) => ImageBlock;
  /** 作り直しの回数の上限。無ければ MAX_FIXES[purpose] */
  maxFixes?: number;
}

/** 作る → 確かめる → 赤なら作り直す。全部の試し（最後が使う下書き）を返す */
export async function makeAndCheck(deps: GuardedDeps, purpose: Purpose, rule: OkRule, locate: Locate, opts: LoopOptions): Promise<Check[]> {
  const max = opts.maxFixes ?? MAX_FIXES[purpose];
  const checks: Check[] = [];
  let feedback: string | undefined;
  for (let i = 0; i <= max; i++) {
    const { card } = await makeCard(deps, purpose, rule, locate, feedback);
    const c = await checkCard(deps, purpose, card, opts.render);
    checks.push(c);
    if (!c.red) break;
    const missed = c.evidence.points.filter((p) => p.credit !== "full").map((p) => `${p.id}: ${p.reason}`);
    feedback = `絵だけを見た人は「${c.evidence.reading.meaning}」と受け取った（伝わる率 ${c.evidence.rate}%${c.evidence.dangerous ? "・危ない読み違い" : ""}）。${c.evidence.reason}${missed.length ? ` 伝わっていない文: ${missed.join(" / ")}` : ""}`;
  }
  return checks;
}
