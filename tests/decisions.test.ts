import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const text = readFileSync(new URL("../docs/decisions.md", import.meta.url), "utf-8");

describe("技術と置き場の決定（000）", () => {
  const section = text.split("## 2026-11-02 技術と置き場（000）")[1]?.split("\n## ")[0] ?? "";

  it("節がある", () => {
    expect(section.length).toBeGreaterThan(0);
  });

  it.each(["画面", "サーバー", "DB", "置き場", "PDF の処理", "PNG の処理", "署名パッド"])(
    "%s に、選んだものと理由がある",
    (item) => {
      const row = section.split("\n").find((l) => l.startsWith(`| ${item} |`));
      expect(row).toBeDefined();
      const cells = row!.split("|").map((c) => c.trim()).filter(Boolean);
      expect(cells).toHaveLength(3);
      expect(cells[1].length).toBeGreaterThan(0);
      expect(cells[2].length).toBeGreaterThan(10);
    },
  );
});
