import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { wrap } from "../scripts/video-draft";
import { DRAFT, fit, share } from "../src/shared/video/draft-cut";

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
});
