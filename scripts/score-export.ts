// 本番の採点を読み、匿名の CSV と集計を書き出す（071・072）。D1 は読むだけ。
//
//   npx tsx scripts/score-export.ts              # private/score/ に CSV と集計を書く（git の外）
//   npx tsx scripts/score-export.ts --public     # docs/answers.csv にも書く（答えの公開は参加者の同意のあと）
//   SCORE_TRIAL=<回の id> で回を決める。無ければ採点のいちばん多い回
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { privatePath } from "../src/node/private-dir";
import { type AnswerRow, answersCsv, latestScores, type PartSummary, type ScoreRow, summarize } from "../src/shared/score-report";
import { LATE_PARTICIPANTS, studentGroup, TEST_GROUP } from "../src/worker/people";

const ROOT = join(import.meta.dirname, "..");

function sql<T>(command: string): T[] {
  const out = execFileSync(process.execPath, [join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js"), "d1", "execute", "DB", "--remote", "--env", "production", "--json", "--command", command], { cwd: ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  return (JSON.parse(out) as { results: T[] }[])[0].results;
}

const esc = (s: string) => s.replaceAll("'", "''");

/** 回の参加者の国（交差の回は登録の国、ほかは ID から） */
function groupsOf(participants: string): Map<string, string> {
  const p = JSON.parse(participants) as string[] | { people: { id: string; group?: string }[] };
  const list = Array.isArray(p) ? p.map((id) => ({ id, group: undefined })) : p.people;
  return new Map(list.map((x) => [x.id, x.group ?? studentGroup(x.id)]));
}

export function summaryMd(s: ReturnType<typeof summarize>, trial: string, at: string) {
  const row = (name: string, x: PartSummary) =>
    `| ${name} | ${x.answers} | ${x.scored.author} | ${x.scored.supervisor} | ${x.mean.author ?? "—"} | ${x.mean.supervisor ?? "—"} | ${x.both} | ${x.meanDiff ?? "—"} | ${x.disagree} |`;
  return [
    `採点の集計（${at} に本番の D1 から読んだ。回 ${trial.slice(0, 8)}）`,
    "",
    "| 範囲 | 答え | 作者が付けた | 監修者が付けた | 作者の平均 | 監修者の平均 | 2 人とも | 差の平均 | 食い違い（差 3 以上） |",
    "|---|---|---|---|---|---|---|---|---|",
    row("全部", s.all),
    row("① 時間を計る", s.time),
    row("① のうちカード", s.timeCard),
    row("① のうち文", s.timeText),
    row("② 絵だけ", s.picture),
    "",
  ].join("\n");
}

function main() {
  const trial =
    process.env.SCORE_TRIAL ?? sql<{ trial_id: string }>("SELECT trial_id FROM scores GROUP BY trial_id ORDER BY COUNT(*) DESC LIMIT 1")[0]?.trial_id;
  if (!trial) throw new Error("採点の行がまだ無い");
  const t = esc(trial);
  const groups = groupsOf(sql<{ participants: string }>(`SELECT participants FROM trials WHERE id = '${t}'`)[0].participants);
  // 9 人: 試しの ID で受けた本物の参加者 2 人を入れる。7 人: 入れない（2 つを並べて出す決まり）
  const groupOf = (p: string) => LATE_PARTICIPANTS[p] ?? groups.get(p) ?? studentGroup(p);
  const keep = (p: string) => p in LATE_PARTICIPANTS || ((groups.get(p) ?? studentGroup(p)) !== TEST_GROUP && studentGroup(p) !== TEST_GROUP);
  const responses = sql<{ seq: number; participant: string; item: string; shown: string; ms: number | null; answer: string }>(
    `SELECT seq, participant, item, shown, ms, answer FROM responses WHERE trial_id = '${t}' AND erased = 0 AND answer IS NOT NULL ORDER BY participant, item`,
  );
  const pictures = sql<{ seq: number; participant: string; card_id: string; answer: string }>(
    `SELECT seq, participant, card_id, answer FROM picture_answers WHERE trial_id = '${t}' AND erased = 0 AND answer IS NOT NULL ORDER BY seq`,
  );
  const answers: AnswerRow[] = [
    ...responses.filter((r) => keep(r.participant)).map((r) => ({ target: `r:${r.seq}`, participant: r.participant, group: groupOf(r.participant), part: "time" as const, item: r.item, shown: r.shown, ms: r.ms, answer: r.answer })),
    ...pictures.filter((r) => keep(r.participant)).map((r) => ({ target: `p:${r.seq}`, participant: r.participant, group: groupOf(r.participant), part: "picture" as const, item: r.card_id, shown: "picture", ms: null, answer: r.answer })),
  ];
  const scores = latestScores(sql<ScoreRow>(`SELECT seq, target, grader, score, comment FROM scores WHERE trial_id = '${t}'`));
  const ja = Object.fromEntries(sql<{ target: string; ja: string }>(`SELECT target, ja FROM score_ja WHERE trial_id = '${t}'`).map((r) => [r.target, r.ja]));
  const at = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
  const dir = privatePath("score");
  mkdirSync(dir, { recursive: true });
  const seven = answers.filter((a) => !(a.participant in LATE_PARTICIPANTS));
  for (const [list, tail, label] of [[answers, "", "9 人"], [seven, "_7", "7 人（試しの ID で受けた 2 人を入れない）"]] as const) {
    const csv = answersCsv([...list], scores, ja);
    const md = summaryMd(summarize([...list], scores), trial, at).replace("採点の集計（", `採点の集計・${label}（`);
    writeFileSync(join(dir, `answers${tail}.csv`), "﻿" + csv, "utf-8");
    writeFileSync(join(dir, `summary${tail}.md`), md, "utf-8");
    if (!tail && process.argv.includes("--public")) writeFileSync(join(ROOT, "docs", "answers.csv"), "﻿" + csv, "utf-8");
    process.stdout.write(md);
    console.log(`CSV: ${join(dir, `answers${tail}.csv`)}（${list.length} 行）`);
  }
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
