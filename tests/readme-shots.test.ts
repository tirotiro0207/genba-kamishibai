// README の画面の写真（126）の検査。写真は e2e/readme-shots.spec.ts が撮る（SHOTS=1）。
// 英語と日本語の README が同じ 6 枚を同じ順に載せ、どれも横長の 1280×720 の PNG であることを調べる。
// 軸の図（137）は言葉ごとに別の SVG なので、写真には数えず、最後の 1 本で別に調べる
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const all = (f: string) => [...readFileSync(f, "utf-8").matchAll(/!\[[^\]]*\]\((docs\/img\/[^)]+)\)/g)].map((m) => m[1]);
/** 画面の写真は「数字-名前.png」 */
const imgs = (f: string) => all(f).filter((p) => /\/\d+-[a-z-]+\.png$/.test(p));

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

  it("写真のほかの絵は軸の図だけで、英語は .en.svg・日本語は .svg を載せ、どちらもある", () => {
    const other = (f: string) => all(f).filter((p) => !imgs(f).includes(p));
    expect(other("README.md")).toEqual(["docs/img/shinro.en.svg"]);
    expect(other("README.ja.md")).toEqual(["docs/img/shinro.svg"]);
    for (const p of ["docs/img/shinro.en.svg", "docs/img/shinro.svg"]) expect(existsSync(p), p).toBe(true);
  });
});
