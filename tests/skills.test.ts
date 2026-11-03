import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copiedRuns } from "../src/shared/overlap";

// 080: Skills（電気工事・労働条件）の下書き。Skill の中に 30 項目の答えと資料の文が無い。
// 調整用の 20 項目と、手元にあればマニュアルの文（private/pdf、git の外）と比べる。確認用の 10 項目は読まない（最後の確認で別に見る）。
// 付けた前後の 20 項目の比べは 060 のあと
const root = join(import.meta.dirname, "..");
const dir = join(root, "skills");
const skills = readdirSync(dir).map((name) => ({ name, body: readFileSync(join(dir, name, "SKILL.md"), "utf-8") }));

type Part = { text?: string; span?: string };
const tune = JSON.parse(readFileSync(join(root, "eval/items_tune_v1r8.json"), "utf-8")) as { text: string; do: Part[]; dont: Part[]; why: Part[] }[];
const answers = tune.flatMap((i) => [i.text, ...[...i.do, ...i.dont, ...i.why].flatMap((p) => [p.text ?? "", p.span ?? ""])]);

const manualDir = join(root, "private/pdf/manual");
const manual = existsSync(manualDir)
  ? readdirSync(manualDir)
      .filter((f) => /^p\d+\.json$/.test(f))
      .flatMap((f) => (JSON.parse(readFileSync(join(manualDir, f), "utf-8")) as { lines: { text: string }[] }).lines.map((l) => l.text))
  : [];

describe("Skills の下書き（080）", () => {
  it("電気工事と労働条件の 2 つがあり、name と description を持つ", () => {
    expect(skills.map((s) => s.name).sort()).toEqual(["electrical-work", "labor-conditions"]);
    for (const s of skills) {
      expect(s.body).toMatch(new RegExp(`^---\\nname: ${s.name}\\ndescription: .+\\n---\\n`));
      expect(s.body).toContain("答えとして書き足さない");
    }
  });

  it("調整用の 20 項目の文と答えが、15 文字続けて入っていない", () => {
    expect(answers.length).toBeGreaterThan(40);
    for (const s of skills) expect(copiedRuns(s.body, answers), s.name).toEqual([]);
  });

  it.skipIf(!manual.length)("マニュアルの文が、15 文字続けて入っていない（手元にあるときだけ）", () => {
    for (const s of skills) expect(copiedRuns(s.body, manual), s.name).toEqual([]);
  });

  it("写しの検出そのものが働く", () => {
    expect(copiedRuns("前置き。盤に触る前に、検電器で電気が来ていないことを確かめる。", ["盤に触る前に検電器で電気が来ていないことを確かめる"])).not.toEqual([]);
    expect(copiedRuns("短い文", ["短い文"])).toEqual([]);
  });
});
