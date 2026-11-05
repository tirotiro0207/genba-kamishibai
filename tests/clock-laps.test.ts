import { describe, expect, it } from "vitest";
import { contrast, dialPaint, FACE, formatSec, LAP_FILLS, lapOf } from "../src/shared/clock-laps";

// 095 の続き（11/5 作者）: 60 秒を超えたら周ごとに塗りを濃くする。針と目盛りは、どの周の塗りの上でも 3:1 以上で見える
describe("時計の周ごとの塗り", () => {
  it("1 周 = 60 秒。60 秒ちょうどは 1 周目の終わり", () => {
    expect([0, 30_000, 60_000, 60_001, 90_000, 200_000, 400_000].map(lapOf)).toEqual([1, 1, 1, 2, 2, 4, 7]);
  });

  it("前の周は丸ごと 1 色、今の周は 1 段濃い色。5 周目より先はいちばん濃い色のまま", () => {
    expect(dialPaint(30_000)).toMatchObject({ lap: 1, under: FACE, sweep: LAP_FILLS[0], deg: 180 });
    expect(dialPaint(90_000)).toMatchObject({ lap: 2, under: LAP_FILLS[0], sweep: LAP_FILLS[1], deg: 180 });
    expect(dialPaint(200_000)).toMatchObject({ lap: 4, under: LAP_FILLS[2], sweep: LAP_FILLS[3] });
    expect(dialPaint(200_000).deg).toBeCloseTo(120);
    expect(dialPaint(400_000)).toMatchObject({ lap: 7, under: LAP_FILLS[4], sweep: LAP_FILLS[4] });
  });

  it("色は同じ系統で、周が進むほど暗い（明るさの差で区別できる）", () => {
    const white = (c: string) => contrast(c, "#ffffff");
    for (let i = 1; i < LAP_FILLS.length; i++) expect(white(LAP_FILLS[i])).toBeGreaterThan(white(LAP_FILLS[i - 1]));
  });

  it("針は前の周と今の周の両方に、目盛りはその下の色に、どの周でもコントラスト比 3:1 以上", () => {
    for (let lap = 1; lap <= LAP_FILLS.length + 2; lap++) {
      const p = dialPaint((lap - 1) * 60_000 + 30_000);
      expect(contrast(p.hand, p.under), `${lap} 周目の針と前の周`).toBeGreaterThanOrEqual(3);
      expect(contrast(p.hand, p.sweep), `${lap} 周目の針と今の周`).toBeGreaterThanOrEqual(3);
      expect(contrast(p.tickOn, p.sweep)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.tickOff, p.under)).toBeGreaterThanOrEqual(3);
    }
    // 濃い周では針が白に切り替わる
    expect(dialPaint(30_000).hand).toBe("#111111");
    expect(dialPaint(270_000).hand).toBe("#ffffff");
  });

  it("色の並びを差し替えると、塗りと針の色もそれに従う", () => {
    const blues = ["#ddeeff", "#99c2ee", "#4a86c8", "#1f4f8a", "#0b2647"];
    expect(dialPaint(90_000, blues)).toMatchObject({ under: blues[0], sweep: blues[1] });
    expect(dialPaint(400_000, blues).hand).toBe("#ffffff");
    expect(dialPaint(90_000, blues).sweep).not.toBe(dialPaint(90_000).sweep);
  });

  it("秒は 60 秒までは「23.4 秒」、超えたら「1 分 23.4 秒」", () => {
    expect(formatSec(4200)).toBe("4.2 秒");
    expect(formatSec(59_940)).toBe("59.9 秒");
    expect(formatSec(83_400)).toBe("1 分 23.4 秒");
    expect(formatSec(119_960)).toBe("2 分 0.0 秒");
    expect(formatSec(400_000)).toBe("6 分 40.0 秒");
  });
});
