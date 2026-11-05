// 公開デモに出してよい「匿名でまとめた数」（094）。公開デモは会社のテナントを読めないので、まとめた数だけをここに置く。
// 1 人ずつの答えや ID は持たない。国籍ごとの数は、まとめても 2 人に満たないものを持たず出さない（summary.ts の crossSummary と同じ守り）。
// 差し替え方: 本物の集計が出たら、下の FAKE_PUBLIC を同じ形の本物の数に置き換え、fake を false にする（画面の「仮の数字」の表示は fake で消える）。
import { OTHER } from "./summary";
import { type NewhireResults, FAKE_NEWHIRE } from "./newhire-results";

export { OTHER };
export { pictureRate, placeTime } from "./newhire-results";

/** 国籍ごとの、絵だけで答えて合っていた人の数（まとめた数だけ） */
export interface GroupPicture {
  group: string;
  correct: number;
  n: number;
}

export interface PublicResults extends NewhireResults {
  /** 国籍ごとの数。どの国籍も 2 人以上（guardGroups を通した後の形） */
  groups: GroupPicture[];
}

/** 2 人に満たない国籍を「その他」にまとめ、まとめても 2 人に満たなければ出さない。hidden は出さなかった人数 */
export function guardGroups(groups: GroupPicture[]): { groups: GroupPicture[]; hidden: number } {
  const kept: GroupPicture[] = [];
  let other: GroupPicture = { group: OTHER, correct: 0, n: 0 };
  for (const g of groups) {
    if (g.group !== OTHER && g.n >= 2) kept.push({ ...g });
    else other = { group: OTHER, correct: other.correct + g.correct, n: other.n + g.n };
  }
  kept.sort((a, b) => a.group.localeCompare(b.group));
  if (other.n >= 2) return { groups: [...kept, other], hidden: 0 };
  return { groups: kept, hidden: other.n };
}

// 仮の数字（人数 10・①の中央値・②の正答 8）。国籍は守りを通した後の形
export const FAKE_PUBLIC: PublicResults = {
  ...FAKE_NEWHIRE,
  groups: guardGroups([
    { group: "ベトナム", correct: 5, n: 6 },
    { group: "インドネシア", correct: 2, n: 2 },
    { group: "ミャンマー", correct: 1, n: 1 },
    { group: "ネパール", correct: 0, n: 1 },
  ]).groups,
};
