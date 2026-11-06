import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countFolder, parsePageList, report } from "../scripts/fold-count";
import { countChars, foldPage, foldTotal } from "../src/shared/fold";
import { privatePath } from "../src/node/private-dir";

// 折りたたみの文字数（081）。中身は架空の例
describe("文字数を数える", () => {
  it("空白（全角の空白・改行・タブ）を除いて数える", () => {
    expect(countChars("盤に 触る　前に\n確かめる\t。")).toBe(11);
    expect(countChars("   ")).toBe(0);
  });

  it("ページの数は行の数の合計で、行の長さだけを持ち、中身は持たない", () => {
    const p = foldPage("sample", 3, ["第 3 章", "", "盤に触る前に"]);
    expect(p).toEqual({ doc: "sample", page: 3, chars: 9, bars: [3, 0, 6] });
    expect(JSON.stringify(p)).not.toMatch(/盤/);
    expect(foldTotal([p, foldPage("sample", 4, ["あいう"])])).toBe(12);
  });

  it("スクリプトはフォルダのページを数え、出すのは数だけ", () => {
    const dir = mkdtempSync(join(tmpdir(), "fold-"));
    writeFileSync(join(dir, "p003.json"), JSON.stringify({ lines: [{ text: "盤に触る前に" }, { text: "検電器で 確かめる" }] }));
    writeFileSync(join(dir, "p004.json"), JSON.stringify({ lines: [{ text: "感電するから" }] }));
    const r = report(countFolder(dir, parsePageList("3-4")));
    expect(r.total).toBe(6 + 8 + 6);
    expect(r.pages.map((p) => p.chars)).toEqual([14, 6]);
    expect(r).toMatchObject({ cards: 1, face_chars: 0 });
    expect(JSON.stringify(r)).not.toMatch(/盤|検電|感電/);
    expect(() => countFolder(dir, [5])).toThrow(/5 ページが無い/);
    expect(parsePageList("27, 30-32,27")).toEqual([27, 30, 31, 32]);
  });

  // 手元に文字にした資料があるときだけ: 11/2 に数えた 12 ページの合計と同じになる
  const manual = privatePath("pdf", "manual");
  it.skipIf(!existsSync(join(manual, "index.json")))("【手元限定】デモの 8 枚の元の 12 ページは numbers.md の合計と同じ", () => {
    const r = report(countFolder(manual, parsePageList("26,27,32,35,36,39,40,49,55,62,80,92")));
    const want = Number(readFileSync("docs/numbers.md", "utf8").match(/合計（12 ページ） \| (\d+)/)![1]);
    expect(r.total).toBe(want);
    expect(r.pages.find((p) => p.page === 49)!.chars).toBe(984);
  });
});
