import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 111: README の日英の骨組み。見出しの順と、未実装を not built と書くこと。
// 106（途中）: 決まった見出しのあいだにほかの節（Try it・Before / During・Disclosure ほか）を挟んでよい。docs へのリンクは実在する
const ORDER = ["The Problem", "Why I built this", "What it does", "How Claude is used", "Quick Start", "License"];

describe.each(["README.md", "README.ja.md"])("%s の骨組み（111）", (file) => {
  const s = readFileSync(file, "utf-8");
  const h2 = s.match(/^## .+$/gm) ?? [];

  it("見出しが決まった順に並ぶ", () => {
    expect(h2.map((h) => ORDER.find((o) => h.startsWith(`## ${o}`))).filter(Boolean)).toEqual(ORDER);
  });
  it("未実装は not built と書き、もう一方の言葉へのリンクがある", () => {
    expect(s).toContain("not built");
    expect(s).toContain(file === "README.md" ? "(README.ja.md)" : "(README.md)");
  });
  it("docs へのリンクは実在するファイルを指す", () => {
    for (const [, path] of s.matchAll(/\]\((docs\/[^)#]+)\)/g)) expect(existsSync(path), path).toBe(true);
  });
  it("会社は創業の年で書く", () => {
    expect(s).toContain("1923");
  });
});

// 107（途中）: 日本語版は英語版と同じ節を同じ順に持つ。見出しは「英語の節の名前（日本語）」
describe("README の日英の節の対応（107）", () => {
  const h2 = (file: string) => (readFileSync(file, "utf-8").match(/^## .+$/gm) ?? []).map((h) => h.slice(3));
  it("日本語版の見出しの英語の部分が、英語版の見出しと同じ順に並ぶ", () => {
    expect(h2("README.ja.md").map((h) => h.replace(/（.+）$/, ""))).toEqual(h2("README.md"));
  });
  it("TBD の数がそろう", () => {
    const n = (file: string) => (readFileSync(file, "utf-8").match(/TBD/g) ?? []).length;
    expect(n("README.ja.md")).toBe(n("README.md"));
  });
});
