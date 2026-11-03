import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import { characterSvg, type View } from "../src/shared/picto/character";
import { INDUSTRY_DRAFTS } from "../src/shared/picto/industry-drafts";
import { headMarks, outfitTorso } from "../src/shared/picto/outfit";
import { POSES } from "../src/shared/picto/poses";

const VIEWS: View[] = ["front", "quarter", "side"];
const draw = (view: View, r: (typeof INDUSTRY_DRAFTS)[number]["roles"][number]) =>
  characterSvg({ angles: POSES.stand, x: 100, groundY: 300, height: 270, facing: "right", view, role: r.role, hair: "short", headwear: r.headwear, outfit: r.outfit });

describe("職場の服と役の印（下絵）", () => {
  // 40 業種あるので、業種ごとに分けて時間切れを防ぐ
  it.each(INDUSTRY_DRAFTS.map((ind) => [ind.id, ind] as const))("業種 %s: 全役・3 つの向きで描け、色は灰色だけ（R=G=B）", (_id, ind) => {
    for (const r of ind.roles)
        for (const view of VIEWS) {
          const body = draw(view, r);
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="320">${body}</svg>`;
          expect(() => new Resvg(svg).render(), `${ind.name}・${r.name}・${view}`).not.toThrow();
          const colors = [...body.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)].map((m) => m[1].toLowerCase());
          const notGray = colors.filter((c) => (c.length === 3 ? !(c[0] === c[1] && c[1] === c[2]) : !(c.slice(0, 2) === c.slice(2, 4) && c.slice(2, 4) === c.slice(4))));
          expect(notGray, `${ind.name}・${r.name}・${view}`).toEqual([]);
        }
  }, 60000);

  it("部品は Illustrator で直したあとに取り込めるよう、part_ の id の g に入る", () => {
    const svg = outfitTorso("front", { wear: [{ kind: "hivis" }, { kind: "apronLong" }], neck: "tie", tag: "lanyard", toolBelt: true });
    expect([...svg.matchAll(/id="part_(\w+)"/g)].map((m) => m[1])).toEqual(["hivis", "apronLong", "neck", "tag", "toolbelt"]);
  });

  it("かぶり物の線は本数ぶん、若葉は安全帽にだけ描く。暗いかぶり物には白い線", () => {
    const count = (s: string) => (s.match(/<path d="M-?\d+ -\d+Q/g) ?? []).length;
    expect(count(headMarks("helmet", "front", { stripes: 2 }, "#999"))).toBe(2);
    expect(count(headMarks("helmet", "front", { stripes: 1 }, "#999"))).toBe(1);
    expect(headMarks("helmet", "front", { stripes: 1 }, "#222")).toContain('stroke="#fff"');
    expect(headMarks("helmet", "quarter", { leaf: true }, "#fff")).toContain("part_leaf");
    expect(headMarks("chef", "quarter", { leaf: true, stripes: 2 }, "#fff")).toBe("");
  });
});
