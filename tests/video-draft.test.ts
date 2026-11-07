import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DROP_BLANK, NOTE_WRAP, wrap } from "../scripts/video-draft";
import { grepOf, missingScenes, SCENES } from "../scripts/video-rec";
import { DRAFT, FLOW_CUTS, fit, share, withRun } from "../src/shared/video/draft-cut";

// 098: 仮の 3 分版のつなぎ方。台本（docs/video.md の 098b の表）と同じ秒割りで、3 分に収まり、字幕は台本の語り
const sec = (t: string) => {
  const [m, s] = t.split(":").map(Number);
  return m * 60 + s;
};
const table = readFileSync("docs/video.md", "utf-8")
  .split("## 台本の下書き（098b・途中）")[1]
  .split("\n## ")[0]
  .split("\n")
  .filter((l) => /^\| \d:\d{2}〜/.test(l))
  .map((l) => {
    const c = l.split("|").map((x) => x.trim());
    const [a, b] = c[1].split("〜");
    return { start: sec(a), end: sec(b), part: c[2], say: c[4] };
  });

describe("仮の 3 分版のつなぎ方（098）", () => {
  it("区切りが台本の表と同じ秒・同じ段で、隙間なく 3 分に収まる", () => {
    expect(DRAFT.map((s) => [s.start, s.end, s.part])).toEqual(table.map((t) => [t.start, t.end, t.part]));
    DRAFT.forEach((s, i) => expect(s.start).toBe(i ? DRAFT[i - 1].end : 0));
    expect(DRAFT.at(-1)!.end).toBeLessThanOrEqual(180);
  });

  it("字幕は台本の語りと同じ（語りが無い区切りは字幕なし）", () => {
    DRAFT.forEach((s, i) => expect(s.caption, `${s.start}`).toBe(table[i].say.replace(/^（.*）$|^—$/, "")));
  });

  it("結はまだ撮っていないので、写真と一言は文字だけの仮の画面", () => {
    const end = DRAFT.filter((s) => s.part === "結");
    expect(end.slice(0, 2).every((s) => s.sources.every((x) => "card" in x))).toBe(true);
  });

  it("動画の速さ: 半分までは遅くし、それでも足りなければ最後のコマで止める。長ければ速める", () => {
    expect(fit(10, 10)).toEqual({ speed: 1, hold: 0 });
    expect(fit(20, 10)).toEqual({ speed: 2, hold: 0 });
    expect(fit(6, 10)).toEqual({ speed: 0.6, hold: 0 });
    expect(fit(4, 10)).toEqual({ speed: 0.5, hold: 2 });
    expect(share(12, [1, 2, 3])).toEqual([2, 4, 6]);
    expect(share(9, [null, 5, 1])).toEqual([3, 3, 3]);
  });

  it("字幕は 1 行 34 文字までで、読点のあとで折る", () => {
    const w = wrap("監修者が直したいところを枠で囲み、直ったら署名します。署名したカードだけが、新入社員に届きます。");
    expect(w.split("\n").every((l) => l.length <= 34)).toBe(true);
    expect(w.split("\n")[0].endsWith("。") || w.split("\n")[0].endsWith("、")).toBe(true);
  });

  it("2 版目: 録画の置き場を差し替えると、録画は全部その置き場のもので、通しの録画はその置き場の切れ目になる", () => {
    const v2 = withRun(DRAFT, "runs-video");
    const clips = v2.flatMap((s) => s.sources).filter((x) => "clip" in x);
    expect(clips.length).toBeGreaterThan(0);
    clips.forEach((x) => expect(x.clip.startsWith("rec/runs-video/")).toBe(true));
    clips.filter((x) => x.scene).forEach((x) => expect([x.from, x.to]).toEqual(FLOW_CUTS["runs-video"][x.scene!]));
    expect(v2.map((s) => [s.start, s.end, s.caption])).toEqual(DRAFT.map((s) => [s.start, s.end, s.caption]));
    expect(() => withRun(DRAFT, "runs-none")).toThrow(/FLOW_CUTS/);
  });

  it("2 版目: 白いコマは明るさの平均 234 以上で落とし、撮り直しは 11 場面を 1 つの -g で流す", () => {
    expect(DROP_BLANK).toContain("YAVG:value=234:function=less");
    expect(SCENES).toHaveLength(11);
    expect(grepOf(["a.b", "c|d"])).toBe(String.raw`a\.b|c\|d`);
  });

  it("3 版目: 出どころは 2 行までで、右上の取り直しの印に届かない幅で折る", () => {
    const notes = DRAFT.filter((s) => s.note);
    expect(notes.length).toBeGreaterThan(0);
    notes.forEach((s) => expect(wrap(s.note, NOTE_WRAP).split("\n").length, s.note).toBeLessThanOrEqual(2));
    expect(NOTE_WRAP * 20).toBeLessThanOrEqual(1280 - 2 * 220);
  });

  it("撮り直し: --list の出力でどのテストの題名にも当たらない場面を返す", () => {
    expect(missingScenes(["a", "b"], "  x.spec.ts:1:1 › a です")).toEqual(["b"]);
    // 題名の印（ › ）の無い行は数えない
    expect(missingScenes(["a"], "a だけの行\nTotal: 1 test")).toEqual(["a"]);
  });

  it("撮り直し: SCENES の場面は全部、e2e のテストの題名（describe か test）に含まれる", () => {
    const titles = readdirSync("e2e")
      .filter((f) => f.endsWith(".spec.ts"))
      .flatMap((f) => [...readFileSync(`e2e/${f}`, "utf-8").matchAll(/\b(?:test|describe)(?:\.\w+)*\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]));
    expect(titles.length).toBeGreaterThan(0);
    expect(SCENES.filter((s) => !titles.some((t) => t.includes(s)))).toEqual([]);
  });
});
