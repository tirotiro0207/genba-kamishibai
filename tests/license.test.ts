import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 078: ライセンス。コードは AGPL-3.0（根の LICENSE が全文）、docs と書き出した絵は CC BY 4.0、名前とロゴは含まない
const section = (file: string, h: string) => readFileSync(file, "utf-8").split(`\n## ${h}`)[1]?.split("\n## ")[0] ?? "";

describe("ライセンス（078）", () => {
  it("LICENSE は AGPL-3.0 の全文", () => {
    const s = readFileSync("LICENSE", "utf-8");
    expect(s).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
    expect(s).toContain("Version 3, 19 November 2007");
    expect(s).toContain("END OF TERMS AND CONDITIONS");
    expect(s.split("\n").length).toBeGreaterThan(600);
  });

  it.each(["README.md", "README.ja.md"])("%s の License の節に、AGPL・CC BY・名前とロゴの除外・理由があり、TBD が無い", (file) => {
    const s = section(file, "License");
    expect(s).toContain("AGPL-3.0");
    expect(s).toContain("CC BY 4.0");
    expect(s).toContain("(LICENSE)");
    expect(s).toMatch(file === "README.md" ? /not covered by either license/ : /どちらのライセンスにも含みません/);
    expect(s).toMatch(file === "README.md" ? /^Why: /m : /^選んだ理由: /m);
    expect(s).not.toContain("TBD");
  });

  it("利害の開示に、ホストしたサービスにするつもりがあることを書く", () => {
    expect(section("README.md", "Disclosure")).toContain("hosted service");
    expect(section("README.ja.md", "Disclosure")).toContain("ホストしたサービス");
  });

  it("決めたことに節があり、守秘はライセンスの話でないと書く", () => {
    const s = section("docs/decisions.md", "2026-11-03 ライセンス（078）");
    expect(s).toContain("AGPL-3.0");
    expect(s).toContain("守秘");
  });
});
