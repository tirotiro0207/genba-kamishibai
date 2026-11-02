import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendRepairs, historyRow } from "../scripts/eval-hook";
import { privatePath } from "../src/node/private-dir";
import { type Claim, type Judgement, repairJudgement, score, scoreBefore } from "../src/shared/eval/score";

// 114 で残した判定の記録の写し（項目 18）。崩れた組と番号は、テストのために足したもの（note を見る）
const record = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "judge-record-18.json"), "utf-8")) as {
  no: number;
  gold: Claim[];
  pred: Claim[];
  judgement: Judgement;
};

describe("判定の直しの中身を残す", () => {
  const { gold, pred, judgement: raw } = record;

  it("直したものを 1 件ずつ、直す前の組・残った組・理由つきで返す", () => {
    const { judgement, dropped, repairs } = repairJudgement(gold.length, pred.length, raw);
    expect(dropped).toBe(3);
    expect(repairs).toEqual([
      { reason: "duplicate", before: { gold: 2, pred: 3, verdict: "wording" }, after: { gold: 2, pred: 2, verdict: "wording" } },
      { reason: "out_of_range", before: { gold: 9, pred: 0, verdict: "same" }, after: null },
      { reason: "bad_dangerous_extra", before: { dangerousExtra: 0 }, after: { gold: 0, pred: 0, verdict: "same" } },
    ]);
    expect(judgement.pairs).toHaveLength(4);
    expect(judgement.dangerousExtras).toEqual([3]);
  });

  it("同じ危ない取り出しすぎの番号を 2 回返したら、2 回目を「同じものを 2 回」として落とす", () => {
    const { repairs } = repairJudgement(gold.length, pred.length, { pairs: [], dangerousExtras: [3, 3] });
    expect(repairs).toEqual([{ reason: "duplicate", before: { dangerousExtra: 3 }, after: null }]);
  });

  it("直す前の数を、採点を止めずに出す（範囲の外は数えられないに入れる）", () => {
    expect(() => score(gold, pred, raw)).toThrow();
    expect(scoreBefore(gold.length, pred.length, raw)).toEqual({ matched: 5, missed: 0, extra: 0, dangerous: 2, uncountable: 1 });
    // 直したあとは、2 回目に組にされた答え 3 が取り出しすぎに数えられる
    const after = score(gold, pred, repairJudgement(gold.length, pred.length, raw).judgement);
    expect(after).toMatchObject({ matched: 4, missed: 0, extra: 1, dangerous: 1 });
  });

  it("フックは直しを 1 件 1 行で記録に足し、履歴の行に件数・直す前の数・記録の参照を書く", () => {
    mkdirSync(privatePath("tmp"), { recursive: true });
    const dir = mkdtempSync(join(privatePath("tmp"), "repairs-"));
    const path = join(dir, "judge-repairs.jsonl");
    const at = new Date("2026-11-03T15:38:12Z");
    const { repairs } = repairJudgement(gold.length, pred.length, raw);
    appendRepairs(path, at, "abc", repairs.map((r) => ({ no: record.no, ...r })));
    appendRepairs(path, at, "abc", []);
    const lines = readFileSync(path, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ run: "2026-11-04 00:38:12", hash: "abc", no: 18, reason: "duplicate", before: { gold: 2, pred: 3, verdict: "wording" }, after: { gold: 2, pred: 2, verdict: "wording" } });

    const s = score(gold, pred, repairJudgement(gold.length, pred.length, raw).judgement);
    const row = historyRow(at, "abc", 1, s, 3, 0.01, 2, scoreBefore(gold.length, pred.length, raw));
    expect(row).toContain("| 3 | 0.0100 | 2 | 組 5・漏れ 0・取り出しすぎ 0・危ない 2・数えられない 1 | judge-repairs.jsonl の run「2026-11-04 00:38:12」 |");
    expect(historyRow(at, "abc", 1, s, 0, 0.01, 2, scoreBefore(gold.length, pred.length, raw))).toMatch(/\| — \|$/);
    rmSync(dir, { recursive: true, force: true });
  });
});
