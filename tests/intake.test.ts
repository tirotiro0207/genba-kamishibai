import { describe, expect, it } from "vitest";
import { classify, compare, type EvalRow, estimateUsd, evalRows, logLine } from "../scripts/intake-check";

const row = (p: Partial<EvalRow>): EvalRow => ({ at: "2026-11-07 10:30", hash: "h", gold: 54, pred: 41, matched: 38, wording: 17, missed: 16, extra: 3, dangerous: 0, usd: 0.44, ...p });

describe("取り込みの見張り（11/7）", () => {
  it("精度に効く場所ごとに分け、関係の無いファイルと最後の確認用の 10 個は数えない", () => {
    const m = classify(["src/shared/extract/rules.ts", "src/shared/picto/props.ts", "README.md", "src/client/App.tsx", "eval/holdout/x.json", "eval/items_tune_v1r9.json", ["src", "shared", "eval", "judge.ts"].join(String.fromCharCode(92))]);
    expect([...m.keys()].sort()).toEqual(["evaldata", "extract", "judge", "picto"]);
    expect(m.get("judge")).toEqual(["src/shared/eval/judge.ts"]);
    expect(classify(["docs/flow.md", "src/worker/index.ts"]).size).toBe(0);
  });

  it("numbers.md の 20 項目の表を古い順に読む", () => {
    const md = [
      "# 数字",
      "## 変更のたびの 20 項目（調整用）",
      "",
      "| 日時（日本時間） | 見張るファイルのハッシュ | 項目 | 正解 | 答え | 組 | 言い方の違い | 漏れ | 取り出しすぎ | 危ない読み違い | 判定の直し | 費用（USD） | 時間（秒） | 直す前の数 | 直しの記録 |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
      "| 2026-11-05 13:01 | 6f036268561a | 20 | 54 | 39 | 39 | 14 | 15 | 0 | 0 | 3 | 0.4322 | 16 | x | y |",
      "| 2026-11-07 10:30 | fea1809d4832 | 20 | 54 | 41 | 38 | 17 | 16 | 3 | 0 | 0 | 0.4416 | 15 | x | — |",
      "",
      "## 次の節",
      "| 2026-11-08 00:00 | zzz | 20 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | x | y |",
    ].join("\r\n");
    const rows = evalRows(md);
    expect(rows.map((r) => r.hash)).toEqual(["6f036268561a", "fea1809d4832"]);
    expect(rows[1]).toMatchObject({ gold: 54, matched: 38, missed: 16, extra: 3, dangerous: 0, usd: 0.4416 });
  });

  it("危ない読み違いは 1 件でも増えたら落ちる。ほかは揺れの幅まで許す", () => {
    expect(compare(row({}), row({ matched: 36, missed: 18, extra: 5 }), 2).ok).toBe(true);
    expect(compare(row({}), row({ dangerous: 1 }), 2).reasons[0]).toMatch(/危ない読み違いが増えた/);
    expect(compare(row({}), row({ matched: 35 }), 2).ok).toBe(false);
    expect(compare(row({}), row({ extra: 6 }), 2).ok).toBe(false);
    const c = compare(row({}), row({ gold: 60 }), 2);
    expect([c.ok, c.comparable]).toEqual([false, false]);
  });

  it("見込みの費用は近い 5 回の最高の 1.2 倍。履歴が無ければ 1 USD", () => {
    expect(estimateUsd([row({ usd: 0.3 }), row({ usd: 0.44 })])).toBe(0.53);
    expect(estimateUsd([])).toBe(1);
  });

  it("記録の行は表を壊さない", () => {
    expect(logLine(["a|b", "c\nd"])).toBe("| a／b | c d |\n");
  });
});
