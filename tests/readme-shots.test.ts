// README の画面の写真（126）の検査。写真は e2e/readme-shots.spec.ts が撮る（SHOTS=1）。
// 英語と日本語の README が同じ 6 枚を同じ順に載せ、どれも横長の 1280×720 の PNG であることを調べる
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const imgs = (f: string) => [...readFileSync(f, "utf-8").matchAll(/!\[[^\]]*\]\((docs\/img\/[^)]+)\)/g)].map((m) => m[1]);

describe("README の画面の写真（126）", () => {
  it("英語と日本語で同じ 6 枚が同じ順", () => {
    expect(imgs("README.md")).toHaveLength(6);
    expect(imgs("README.ja.md")).toEqual(imgs("README.md"));
  });

  it("どれも 1280×720 の PNG", () => {
    for (const f of imgs("README.md")) {
      const b = readFileSync(f);
      expect([...b.subarray(1, 4)].map((c) => String.fromCharCode(c)).join(""), f).toBe("PNG");
      expect([b.readUInt32BE(16), b.readUInt32BE(20)], f).toEqual([1280, 720]);
    }
  });
});
