import { describe, expect, it } from "vitest";
import { storyFrameSvg } from "../src/shared/picto/story";
import { checkStyle } from "../src/shared/picto/style";
import { PANEL_SECONDS, STORY_PANELS } from "../src/shared/video/story-panels";

// 096b: 起の紙芝居 5 枚。1 枚 4 秒で 20 秒に収まり、どの絵も絵柄の決まりを守り、字は絵に入れない
describe("起の紙芝居 5 枚（096b）", () => {
  it("5 枚 × 4 秒 = 20 秒", () => {
    expect(STORY_PANELS).toHaveLength(5);
    expect(STORY_PANELS.length * PANEL_SECONDS).toBe(20);
  });

  it("どの絵も絵柄のテストが通り、字幕の字は絵に入らない", () => {
    for (const [i, p] of STORY_PANELS.entries()) {
      const svg = storyFrameSvg(p.frame, p.parts);
      expect(checkStyle(svg), `${i + 1}`).toEqual([]);
      expect(svg).not.toContain(p.caption);
      expect(p.caption.length).toBeGreaterThan(0);
    }
  });

  it("作者は白いヘルメットの新人の役で、2 枚目から 5 枚目に出る", () => {
    for (const p of STORY_PANELS.slice(1)) expect(p.frame.figures.some((f) => f.role === "new")).toBe(true);
  });
});
