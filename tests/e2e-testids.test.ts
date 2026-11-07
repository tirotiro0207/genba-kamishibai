import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// e2e が探す data-testid の名前が、画面のコードに全部あるかを静的に照らす（名前を変えたのに e2e を直し忘れるのを、流す前に見つける）
const root = join(import.meta.dirname, "..");

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(join(root, dir), { recursive: true, encoding: "utf-8" })
    .filter((f) => ext.test(f))
    .map((f) => readFileSync(join(root, dir, f), "utf-8"));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * e2e の getByTestId("…") の決まった名前（文字の名前だけ。変数や `${}` を含む名前は数えない）。
 * 「無いこと」だけを見る名前（使う行が全部 toHaveCount(0)）は、画面に無くてよいので外す
 */
function wanted(): string[] {
  const uses = new Map<string, boolean>();
  for (const line of files("e2e", /\.spec\.ts$/).flatMap((s) => s.split(/\r?\n/)))
    for (const m of line.matchAll(/getByTestId\(\s*(["'])([^"'`$]+)\1\s*\)/g)) uses.set(m[2], (uses.get(m[2]) ?? false) || !line.includes("toHaveCount(0)"));
  return [...uses].filter(([, shown]) => shown).map(([n]) => n).sort();
}

/**
 * 画面のコードの data-testid。data-testid={…} と、部品へ渡す testid={…}・testid="…"、名前を作る tid の中の文字と `…` を拾う。
 * `a-${x}` の形は「a-」のあとに何かが続く形として持つ（丸ごと変数の data-testid={testid} は、渡す側で拾う）
 */
function present(): { exact: Set<string>; patterns: RegExp[] } {
  const src = files("src/client", /\.(tsx?|jsx?)$/).join("\n");
  const exprs = [
    ...[...src.matchAll(/\b(?:data-testid|testid)=(["'])([^"']+)\1/g)].map((m) => JSON.stringify(m[2])),
    ...[...src.matchAll(/\b(?:data-testid|testid)=\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)].map((m) => m[1]),
    ...[...src.matchAll(/\bconst tid = ([^;\n]*)/g)].map((m) => m[1]),
  ];
  const exact = new Set<string>();
  const patterns: RegExp[] = [];
  for (const e of exprs) {
    for (const q of e.matchAll(/(["'])([^"']+)\1/g)) exact.add(q[2]);
    for (const t of e.matchAll(/`([^`]*)`/g)) patterns.push(new RegExp(`^${t[1].split(/\$\{[^}]*\}/).map(esc).join(".+")}$`));
  }
  return { exact, patterns };
}

describe("e2e の data-testid と画面のコードの照合", () => {
  it("e2e が getByTestId で探す名前は、全部 src/client のどこかに data-testid としてある", () => {
    const want = wanted();
    expect(want.length).toBeGreaterThan(50);
    const { exact, patterns } = present();
    const missing = want.filter((n) => !exact.has(n) && !patterns.some((p) => p.test(n)));
    expect(missing).toEqual([]);
  });

  it("照らし方そのもの: 無い名前は見つかる", () => {
    const { exact, patterns } = present();
    const n = "no-such-testid-zzz";
    expect(exact.has(n) || patterns.some((p) => p.test(n))).toBe(false);
  });
});
