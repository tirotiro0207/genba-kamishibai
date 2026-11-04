// ① の交差の回の結果（11/5 作者）。項目ごと・カードか文かごとに、人数・分かるまでの時間の中央値・判定の数を出す。
// 判定は全員まとめて 1 つの数。国籍ごとの数はまとめた数だけを添え、1 人しかいない国籍は「その他」にまとめる。
// まとめても 2 人に満たないまとまりは出さない（参加者が少ないので、国籍と答えが並ぶと誰の答えか分かってしまうため）
import { latestGrades, type ExportGrade, type ExportResponse } from "./answers-csv";
import { median, type Shown } from "./clocks";

export const OTHER = "その他";

export interface Cell {
  item: "A" | "B";
  shown: Shown;
  /** 答えた人数 */
  n: number;
  /** 「分かった」までの時間の中央値（ミリ秒） */
  median_ms: number | null;
  /** 採点者 2 人とも付けた答えの数 */
  graded: number;
  /** 2 人とも「正しい」 */
  correct: number;
  /** 2 人の判定が食い違った */
  disagree: number;
}

export interface Summary {
  all: Cell[];
  groups: { group: string; people: number; cells: Cell[] }[];
  /** まとめても 2 人に満たず、国籍ごとの数に出さなかった人数 */
  hidden: number;
}

const KEYS: { item: "A" | "B"; shown: Shown }[] = [
  { item: "A", shown: "card" },
  { item: "A", shown: "text" },
  { item: "B", shown: "card" },
  { item: "B", shown: "text" },
];

function cells(rows: ExportResponse[], g: ReturnType<typeof latestGrades>): Cell[] {
  return KEYS.map(({ item, shown }) => {
    const rs = rows.filter((r) => r.item === item && r.shown === shown);
    const both = rs.map((r) => g.get(r.seq)).filter((x) => x?.g1 && x?.g2);
    return {
      item,
      shown,
      n: rs.length,
      median_ms: median(rs.map((r) => r.ms).filter((ms): ms is number => typeof ms === "number" && ms > 0)),
      graded: both.length,
      correct: both.filter((x) => x!.g1 === "correct" && x!.g2 === "correct").length,
      disagree: both.filter((x) => x!.g1 !== x!.g2).length,
    };
  });
}

export function crossSummary(people: { id: string; group: string }[], responses: ExportResponse[], grades: ExportGrade[]): Summary {
  const g = latestGrades(grades);
  const size = new Map<string, number>();
  for (const p of people) size.set(p.group, (size.get(p.group) ?? 0) + 1);
  const groupOf = new Map(people.map((p) => [p.id, (size.get(p.group) ?? 0) < 2 ? OTHER : p.group]));
  const members = new Map<string, string[]>();
  for (const [id, grp] of groupOf) members.set(grp, [...(members.get(grp) ?? []), id]);
  let hidden = 0;
  const groups: Summary["groups"] = [];
  for (const [grp, ids] of [...members].sort(([a], [b]) => (a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b)))) {
    if (ids.length < 2) {
      hidden += ids.length;
      continue;
    }
    groups.push({ group: grp, people: ids.length, cells: cells(responses.filter((r) => ids.includes(r.participant)), g) });
  }
  return { all: cells(responses, g), groups, hidden };
}
