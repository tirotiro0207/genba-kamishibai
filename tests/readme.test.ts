import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 111: README の日英の骨組み。見出しの順と、未実装を not built と書くこと
const ORDER = ["The Problem", "Why I built this", "What it does", "How Claude is used", "Quick Start", "License"];

describe.each(["README.md", "README.ja.md"])("%s の骨組み（111）", (file) => {
  const s = readFileSync(file, "utf-8");
  const h2 = s.match(/^## .+$/gm) ?? [];

  it("見出しが決まった順に並ぶ", () => {
    expect(h2.map((h) => ORDER.find((o) => h.startsWith(`## ${o}`)))).toEqual(ORDER);
  });
  it("未実装は not built と書き、もう一方の言葉へのリンクがある", () => {
    expect(s).toContain("not built");
    expect(s).toContain(file === "README.md" ? "(README.ja.md)" : "(README.md)");
  });
  it("会社は創業の年で書く", () => {
    expect(s).toContain("1923");
  });
});
