import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("録画の土台（010）", () => {
  const cfg = readFileSync("playwright.config.ts", "utf-8");
  it("設定ファイルに絶対パスが無く、置き場所は環境変数で渡す", () => {
    expect(cfg).not.toMatch(/["'`][A-Za-z]:[\\/]|\/Users\/|\/home\//);
    expect(cfg).toContain("process.env.RECORD_DIR");
  });
  it("録画は毎回とる", () => {
    expect(cfg).toMatch(/video:\s*\{\s*mode:\s*"on"/);
  });
});
