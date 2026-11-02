import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("リポジトリ（001）", () => {
  it("最初のコミットが 2026-11-02 12:30（日本時間）以降", () => {
    const first = execFileSync("git", ["log", "--reverse", "--format=%aI"], { encoding: "utf-8" }).split("\n")[0];
    expect(new Date(first).getTime()).toBeGreaterThanOrEqual(new Date("2026-11-02T12:30:00+09:00").getTime());
  });
});
