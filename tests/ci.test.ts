import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// テストの自動実行（110）
describe("テストの自動実行のワークフロー（110）", () => {
  // コメントの行は除いて、実際に流すものだけを見る
  const wf = readFileSync(".github/workflows/test.yml", "utf-8")
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
  it("push のたびに、型と単体テストを流す", () => {
    expect(wf).toMatch(/^on:\n\s+push:/m);
    expect(wf).toContain("npm ci");
    expect(wf).toContain("npx tsc");
    expect(wf).toContain("npx vitest run");
  });
  it("録画のテストと手元だけの検査は流さない", () => {
    expect(wf).not.toMatch(/playwright|npm run e2e/i);
    expect(wf).not.toMatch(/banned|約束|\.git\/hooks/);
  });
  it("README の上に結果の印がある", () => {
    const head = readFileSync("README.md", "utf-8").split("\n").slice(0, 4).join("\n");
    expect(head).toContain("actions/workflows/test.yml/badge.svg");
  });
});
