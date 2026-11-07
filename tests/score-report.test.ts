import { describe, expect, it } from "vitest";
import { type AnswerRow, answersCsv, latestScores, summarize } from "../src/shared/score-report";

const ans = (target: string, participant: string, part: "time" | "picture", shown = "card", answer = "わかった"): AnswerRow => ({
  target,
  participant,
  group: "ベトナム",
  part,
  item: part === "time" ? "A" : "card-1",
  shown,
  ms: part === "time" ? 3000 : null,
  answer,
});

describe("採点の書き出しと集計（071・072）", () => {
  const rows = [
    { seq: 1, target: "r:1", grader: "author", score: 3, comment: "前の点" },
    { seq: 5, target: "r:1", grader: "author", score: 8, comment: "あとで直した" },
    { seq: 2, target: "r:1", grader: "supervisor", score: 4, comment: "" },
    { seq: 3, target: "p:9", grader: "author", score: 10, comment: null },
    { seq: 4, target: "r:2", grader: "supervisor", score: null, comment: "点なし" },
  ];
  const answers = [ans("r:1", "student_V_1", "time"), ans("r:2", "student_V_2", "time", "text"), ans("p:9", "student_V_1", "picture", "picture", JSON.stringify({ ja: "", own: "Cấm" }))];

  it("追記だけの表から、人と答えごとにいちばん新しい点を使う", () => {
    const s = latestScores(rows);
    expect(s.author.get("r:1")).toEqual({ score: 8, comment: "あとで直した" });
    expect(s.supervisor.get("r:2")?.score).toBeNull();
  });

  it("CSV は参加者を番号にし、コメントを入れず、差 3 以上を食い違いにする", () => {
    const csv = answersCsv(answers, latestScores(rows), { "p:9": "禁止" });
    expect(csv).not.toContain("student_V_1");
    expect(csv).not.toContain("あとで直した");
    const [head, r1, , p9] = csv.trim().split("\n");
    expect(head.split(",")).toContain("disagree");
    expect(r1).toMatch(/^r:1,P01,ベトナム,time,A,card,3000,わかった,,,8,4,4,1$/);
    expect(p9).toMatch(/^p:9,P01,.*,Cấm,禁止,10,,,$/);
  });

  it("範囲ごとに、付けた数・平均・2 人とも付けた数・食い違いを出す", () => {
    const s = summarize(answers, latestScores(rows));
    expect(s.all.answers).toBe(3);
    expect(s.all.scored).toEqual({ author: 2, supervisor: 1 });
    expect(s.all.mean.author).toBe(9);
    expect(s.time.both).toBe(1);
    expect(s.time.disagree).toBe(1);
    expect(s.timeText.scored.supervisor).toBe(0);
    expect(s.picture.mean.supervisor).toBeNull();
  });
});
