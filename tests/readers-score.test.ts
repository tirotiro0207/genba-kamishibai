import { describe, expect, it } from "vitest";
import { findBias } from "../src/shared/readers/bias";
import type { ReaderResult } from "../src/shared/readers/prompt";
import { aggregate, cardTable, judgePrompt, type KeyCard, parseJudgments } from "../src/shared/readers/score";
import { sampleCard } from "./fixtures/card";

const card = sampleCard();
const keys: KeyCard[] = [
  { label: "絵 1", cardId: "c1", rule: card.rule, why: card.why },
  { label: "絵 2", cardId: "c2", rule: "迷ったら上の人に聞く", why: "ひとりで決めると事故になるから" },
];
const ans = (reader: string) => ({ run: "r", reader, model: "claude-sonnet-5-5", answers: keys.map((k) => ({ label: k.label, do: "確かめる", dont: "", why: "", sure: 3 })) }) as ReaderResult;
const results = [ans("R01"), ans("R02")];
const judge = (verdicts: string[]) => ({
  run: "r",
  model: "claude-sonnet-5-5",
  judgments: ["R01", "R02"].flatMap((reader, i) => keys.map((k, j) => ({ reader, label: k.label, verdict: verdicts[i * 2 + j], note: "" }))),
});

describe("読み手パネルの採点（027）", () => {
  it("判定役の指示には、カードの守ること・なぜと答えを入れ、読み手の設定は入れない", () => {
    const p = judgePrompt("r", "sonnet", keys, results, "C:/x/judge.json");
    expect(p).toContain(card.rule);
    expect(p).toContain("迷ったら上の人に聞く");
    expect(p).not.toMatch(/出身|母語|日本語の文字を読む力/);
    expect(p).toContain('"model": "claude-sonnet-5-5"');
    expect(findBias(p)).toEqual([]);
  });

  it("カードごと・読み手ごとの伝わる率と危ない読み違いを数える", () => {
    const js = parseJudgments(judge(["match", "danger", "partial", "danger"]), "r", "sonnet", keys, results);
    const agg = aggregate(keys, js);
    expect(agg.total).toMatchObject({ n: 4, match: 1, partial: 1, danger: 2, rate: 0.25 });
    expect(agg.byCard.find((c) => c.cardId === "c2")).toMatchObject({ danger: 2, rate: 0 });
    expect(agg.byReader.map((r) => [r.reader, r.rate])).toEqual([["R01", 0.5], ["R02", 0]]);
    const t = cardTable(agg, "claude-sonnet-5-5");
    expect(t).toContain("危ない読み違い 2 件");
    expect(t.split("\n")[4]).toContain("c2"); // 危ない読み違いが多いカードが先頭
  });

  it("判定のモデルが違う・足りない・二重・値が違うときは数えない", () => {
    const ok = judge(["match", "match", "match", "match"]);
    expect(() => parseJudgments({ ...ok, model: "claude-opus-5-5" }, "r", "sonnet", keys, results)).toThrow(/モデル/);
    expect(() => parseJudgments({ ...ok, judgments: ok.judgments.slice(1) }, "r", "sonnet", keys, results)).toThrow(/判定していない/);
    expect(() => parseJudgments({ ...ok, judgments: [...ok.judgments, ok.judgments[0]] }, "r", "sonnet", keys, results)).toThrow(/二重/);
    expect(() => parseJudgments(judge(["match", "ok", "match", "match"]), "r", "sonnet", keys, results)).toThrow(/判定の値/);
  });
});
