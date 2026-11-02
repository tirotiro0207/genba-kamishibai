import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 078: README の下書きに、ライセンス・利害の開示・出どころの節がある
describe("README の下書き（078）", () => {
  const s = readFileSync("docs/readme-draft.md", "utf-8");
  const section = (h: string) => s.split(/^## /m).find((x) => x.startsWith(h)) ?? "";

  it("3 つの節がある", () => {
    for (const h of ["License", "利害の開示", "出どころ"]) expect(section(h), h).not.toBe("");
  });
  it("ライセンスは決まるまで案を並べ、未決と書く", () => {
    expect(section("License")).toContain("未決");
    expect(section("License").match(/^\| [A-Z]\. /gm)?.length).toBeGreaterThanOrEqual(2);
  });
  it("利害の開示は日英で、答えの記録と公開に触れる", () => {
    const d = section("利害の開示");
    expect(d).toContain("有償");
    expect(d).toContain("docs/answers.csv");
    expect(d).toMatch(/append-only/);
  });
  it("出どころに、正解表の作り方とプロンプトをゼロから書いたことがある", () => {
    const d = section("出どころ");
    expect(d).toContain("Answer key finalized by two site supervisors");
    expect(d).toContain("ゼロから書いた");
    expect(d).not.toMatch(/辞書/);
  });
});
