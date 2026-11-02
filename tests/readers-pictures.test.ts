import { describe, expect, it } from "vitest";
import { strip } from "../scripts/readers-pictures";
import { SIZE } from "../src/shared/pose/svg";

// 読み手パネルに見せる絵（045）: コマを横に並べた 1 枚で、文字は入れない
describe("読み手に見せる絵（045）", () => {
  const frame = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="10" height="10"/></svg>`;
  it("コマを左から順に並べ、幅はコマの数に合う", () => {
    const svg = strip([frame, frame, frame]);
    expect(svg.match(/<svg x="/g)).toHaveLength(3);
    expect(svg).toContain(`<svg x="${2 * (SIZE + 24)}" y="0"`);
    expect(svg).toMatch(new RegExp(`^<svg [^>]*width="${3 * SIZE + 2 * 24}"`));
  });
  it("文字（text 要素）を足さない", () => {
    expect(strip([frame, frame])).not.toMatch(/<text\b/);
  });
});
