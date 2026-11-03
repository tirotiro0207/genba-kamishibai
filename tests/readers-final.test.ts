import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 絵の正解表の確定版（058）: docs/readers.md の表の形と、直す前と後の率が表どうしで合っているか
const md = readFileSync("docs/readers.md", "utf-8").replace(/\r\n/g, "\n");
const section = (head: string) => md.split(head)[1].split(/\n#{2,3} /)[0];

/** 「| R01 | ○ | … | 75% |」の表を、読み手ごとの記号の並びと、最後の伝わる率の行にする */
function grid(text: string) {
  const lines = text.split("\n").filter((l) => l.startsWith("| "));
  const cells = (l: string) => l.split("|").slice(1, -1).map((s) => s.trim());
  const head = cells(lines[0]);
  const cols = head.filter((h) => h.startsWith("輪"));
  const rows = Object.fromEntries(lines.filter((l) => /^\| R\d\d /.test(l)).map((l) => [cells(l)[0], cells(l).slice(1, 1 + cols.length)]));
  const rate = cells(lines.find((l) => l.startsWith("| 伝わる率"))!).slice(1, 1 + cols.length);
  return { cols, rows, rate };
}

const pct = (n: number, d: number) => `${Math.round((n / d) * 100)}%`;

describe("絵の正解表の確定版（058）", () => {
  const v2 = grid(section("### 絵の正解表 v2"));
  const v3 = grid(section("### 絵の正解表 v3"));

  it("確定版は 24 人 × 8 枚で、記号は ○・△・×・危 だけ。伝わる率の行は ○ の数と合う", () => {
    expect(v3.cols).toEqual(["輪 1", "輪 2", "輪 3", "輪 4", "輪 5", "輪 6", "輪 7", "輪 8"]);
    expect(Object.keys(v3.rows)).toHaveLength(24);
    for (const r of Object.values(v3.rows)) for (const c of r) expect(["○", "△", "×", "危"]).toContain(c);
    v3.cols.forEach((_, i) => expect(v3.rate[i]).toBe(pct(Object.values(v3.rows).filter((r) => r[i] === "○").length, 24)));
  });

  it("直していない輪 4・5・6・8 は 057 の答えのまま", () => {
    for (const [reader, r] of Object.entries(v3.rows)) for (const i of [3, 4, 5, 7]) expect(r[i], `${reader} 輪 ${i + 1}`).toBe(v2.rows[reader][i]);
  });

  it("直す前と後の率の表は、057 の表と確定版の表の率と合う", () => {
    const lines = section("### 直す前と後の伝わる率").split("\n").filter((l) => /^\| 輪 \d /.test(l));
    expect(lines).toHaveLength(4);
    for (const l of lines) {
      const [ring, before, after] = l.split("|").slice(1, 4).map((s) => s.trim());
      const i = v3.cols.indexOf(ring);
      expect(before, ring).toBe(v2.rate[i]);
      expect(after, ring).toBe(v3.rate[i]);
    }
  });
});
