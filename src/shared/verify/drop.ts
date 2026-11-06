// 新人役の試しの「1 コマ抜いた版」（11/5）。脚本で「場」の役を付けたコマ（いつもの作業）を抜いて、残りのコマだけを確かめる AI に読ませる。
// 絵の連なりの研究では、省いてよいのは場の説明と結果のほうで、きっかけと山場が欠けると意味が崩れる。場を抜いても伝われば、
// きっかけと山場のコマが意味を運んでいる。漫画に慣れていない新人は省いたコマを頭で補えないので、抜いた版でも伝わることを求める。
// 合格の目安は安全表示の理解度の試しの基準にならい、伝わる率 85 以上・危ない取り違え無し（1 枚ずつの代わりの目安。本来は多人数での正答率）。
import type { CardBody } from "../card";
import type { GuardedDeps, Purpose } from "../claude";
import { type Evidence, verifyCard } from "./formal";
import type { ImageBlock } from "./verify";

export const READ_PASS_RATE = 85;

/** 抜くコマの番号（0 から）。脚本の「場」のコマ。脚本が無い・場が無い・コマの数が脚本と合わないときは null */
export function droppableFrame(card: CardBody): number | null {
  const roles = card.script?.frames?.map((f) => f.role);
  if (!roles || roles.length !== card.frames.length) return null;
  const i = roles.indexOf("場");
  return i < 0 ? null : i;
}

export const passes = (e: Evidence) => e.rate >= READ_PASS_RATE && !e.dangerous;

export interface DropCheck {
  full: Evidence;
  /** 抜いたコマ（0 から）と、そのときの読み。抜けるコマが無ければ null */
  dropped: { index: number; evidence: Evidence } | null;
  pass: boolean;
}

/** 全部のコマと、場を抜いたコマの 2 回読ませる */
export async function verifyWithDrop(deps: GuardedDeps, purpose: Purpose, card: CardBody, images: ImageBlock[]): Promise<DropCheck> {
  const full = await verifyCard(deps, purpose, card, images);
  const index = droppableFrame(card);
  if (index === null || images.length < 3) return { full, dropped: null, pass: passes(full) };
  const evidence = await verifyCard(deps, purpose, card, images.filter((_, i) => i !== index));
  return { full, dropped: { index, evidence }, pass: passes(full) && passes(evidence) };
}
