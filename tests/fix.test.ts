import { describe, expect, it } from "vitest";
import { boxFrom, validateFix } from "../src/shared/fix";

// 枠と指示の形（044a）
describe("枠と指示", () => {
  it("どちら向きになぞっても同じ枠になり、絵の外は縁で止める", () => {
    expect(boxFrom([0.6, 0.7], [0.2, 0.1])).toEqual(boxFrom([0.2, 0.1], [0.6, 0.7]));
    const b = boxFrom([-0.2, 0.5], [0.4, 1.3]);
    expect(b.x).toBe(0);
    expect(b.y).toBe(0.5);
    expect(b.w).toBeCloseTo(0.4);
    expect(b.h).toBeCloseTo(0.5);
  });

  it("枠と文がそろえば通り、足りなければ理由を返す", () => {
    const box = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    expect(validateFix({ frame: 2, box, text: "近づける" }, 3)).toEqual([]);
    expect(validateFix({ frame: 3, box, text: "近づける" }, 3).join()).toMatch(/frame/);
    expect(validateFix({ frame: 0, box: { ...box, h: 0.01 }, text: "a" }, 3).join()).toMatch(/小さすぎる/);
    expect(validateFix({ frame: 0, box, text: "a".repeat(2001) }, 3).join()).toMatch(/2000/);
    expect(validateFix(null, 3)).toEqual(["依頼が無い"]);
  });
});
