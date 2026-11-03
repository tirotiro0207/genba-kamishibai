import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import { type Hair, HEADWEAR, type HeadwearKind, hairSvg, headwearSvg, type View } from "../src/shared/picto/character";

// 頭だけを 1 倍で描き、塗られた所（不透明な画素）を取り出す。原点（首の付け根）は (100, 180)
const mask = (body: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><g transform="translate(100 180)">${body}</g></svg>`;
  const img = new Resvg(svg).render();
  const px = img.pixels; // 読むたびに写しを作るので 1 回だけ取る
  return (x: number, y: number) => px[(y * 200 + x) * 4 + 3] > 0;
};

const VIEWS: View[] = ["front", "quarter", "side"];
const HAIRS: Hair[] = ["bob", "short", "bun"];
const KINDS = Object.keys(HEADWEAR) as HeadwearKind[];

describe("かぶり物と髪", () => {
  it("かぶり物は髪に覆いかぶさる: 縁より上の髪は全部かぶり物の中に入る（はみ出す髪が無い）", () => {
    const bad: string[] = [];
    for (const view of VIEWS)
      for (const hair of HAIRS)
        for (const kind of KINDS) {
          if (HEADWEAR[kind].hair === "hide") continue;
          const h = hairSvg(view, hair, kind);
          const hairAt = mask(h.back + h.front);
          const hatAt = mask(headwearSvg(kind, view, "new"));
          const out: string[] = [];
          for (let y = 0; y < 180 + HEADWEAR[kind].bottom - 3; y++)
            for (let x = 0; x < 200; x++) if (hairAt(x, y) && !hatAt(x, y)) out.push(`${x - 100},${y - 180}`);
          if (out.length) bad.push(`${view}・${hair}・${kind}: ${out.length} 点（${out[0]} ほか）`);
        }
    expect(bad).toEqual([]);
  }, 60000);

  it("髪をしまうかぶり物は髪を描かず、かぶり物をかぶるとお団子とつやの線を描かない", () => {
    expect(hairSvg("quarter", "bob", "hygiene")).toEqual({ back: "", front: "" });
    expect(hairSvg("side", "bun", "helmet").back).toBe("");
    expect(hairSvg("side", "bun", "none").back).not.toBe("");
    expect(hairSvg("front", "bob", "chef").front).not.toContain("#777");
  });

  it("役の明るさで塗るかぶり物は役で色が変わり、いつも白のかぶり物は変わらない", () => {
    expect(headwearSvg("helmet", "quarter", "lead")).toContain('fill="#222"');
    expect(headwearSvg("chef", "quarter", "lead")).not.toContain('fill="#222"');
  });
});
