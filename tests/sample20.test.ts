import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { makeForm } from "../scripts/sample20";
import type { Exec } from "../src/node/d1-node";
import { formCsv, hasScript, pickSample, readForm, scriptedOnly, summarize, summaryMarkdown } from "../src/shared/sample20";

// 064: 20 枚を種で選び、監修者の記入欄を作って集計する。D1 は手元と同じ表を node:sqlite に作り、作りもののカードで試す
const root = join(import.meta.dirname, "..");
const ids = Array.from({ length: 120 }, (_, i) => `card-${String(i).padStart(3, "0")}`);
// 脚本のあるカードの本文に入れる、作りものの脚本
const script = { trigger: "きっかけ", frames: [{ role: "場", who: "作業者", action: "立つ", viewer: "場所が分かる" }], why_shown: "", avoid: [], drawable: true, missing: null };

function memExec(): { db: DatabaseSync; exec: Exec } {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(join(root, "migrations")).filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(join(root, "migrations", f), "utf-8"));
  return {
    db,
    exec: async (sql) => (/^\s*(SELECT|WITH)/i.test(sql) ? { results: db.prepare(sql).all() as Record<string, unknown>[], changes: 0 } : { results: [], changes: Number(db.prepare(sql).run().changes) }),
  };
}

describe("20 枚の選び方と記入欄（064）", () => {
  it("同じ種なら、渡す順番にかかわらず同じ 20 枚。種が違えば違う 20 枚", () => {
    const a = pickSample("s1", ids);
    expect(a).toHaveLength(20);
    expect(new Set(a).size).toBe(20);
    expect(pickSample("s1", [...ids].reverse())).toEqual(a);
    expect(pickSample("s2", ids)).not.toEqual(a);
    expect(pickSample("s1", ids.slice(0, 5))).toHaveLength(5);
  });

  it("記入欄に種と 20 行が入り、書いたものを読んで集計できる", () => {
    const picked = pickSample("s1", ids).map((id) => ({ id, title: `決まり, "${id}"` }));
    const csv = formCsv("s1", picked);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(22);
    expect(readForm(csv)).toEqual({ seed: "s1", entries: [], blank: 20 });
    const filled = [lines[0], lines[1], ...lines.slice(2).map((l, i) => {
      const c = l.split(",");
      const rest = l.slice(l.indexOf(c[1]) + c[1].length + 1).replace(/,,,,,$/, "");
      return i < 3 ? `${c[0]},${c[1]},${rest},${["そのまま署名", "直して署名", "作り直し"][i]},${i},${i ? 1 : 0},${(i + 1) * 30},${i === 1 ? '"言葉を足した, 2 つ"' : ""}` : l;
    })].join("\n");
    const f = readForm(filled);
    expect(f.blank).toBe(17);
    expect(f.entries.map((e) => e.outcome)).toEqual(["そのまま署名", "直して署名", "作り直し"]);
    expect(f.entries[1].note).toBe("言葉を足した, 2 つ");
    const s = summarize(f.entries);
    expect(s).toEqual({ n: 3, outcomes: { そのまま署名: 1, 直して署名: 1, 作り直し: 1 }, added: 3, missed: 2, medianSeconds: 60, totalSeconds: 180 });
    expect(summaryMarkdown("s1", s, 17)).toContain("| 1 | 1 | 1 | 3 | 2 | 60 | 180 |");
  });

  it("読めない結果や数でない欄は止める", () => {
    const head = "# 種,s\n順,カード,決まり,結果,書き足し,漏れ,秒,一言\n";
    expect(() => readForm(`${head}1,c,x,よし,0,0,10,\n`)).toThrow("結果");
    expect(() => readForm(`${head}1,c,x,作り直し,二,0,10,\n`)).toThrow("書き足し");
    expect(() => readForm("順,カード\n")).toThrow("種");
  });

  it("手元の D1 の夜間の一括のカードから選ぶ（ほかの一括とほかのテナントのカードは入らない）", async () => {
    const { db, exec } = memExec();
    const card = db.prepare("INSERT INTO cards (id, tenant_id, body) VALUES (?, ?, ?)");
    const draft = db.prepare("INSERT INTO night_drafts (run_id, tenant_id, sort_run, page, item, state, card_id) VALUES (?, ?, 'sort', ?, 0, 'done', ?)");
    ids.forEach((id, i) => {
      card.run(id, "practice", JSON.stringify({ rule: `決まり ${i}`, script }));
      draft.run(i < 100 ? "run-a" : "run-b", "practice", i, id);
    });
    card.run("other", "demo", JSON.stringify({ rule: "ほか", script }));
    const r = await makeForm(exec, "practice", "s1", { run: "run-a" });
    expect(r.total).toBe(100);
    expect(r.droppedNoScript).toBe(0);
    expect(r.short).toBe(false);
    expect(r.picked.map((p) => p.id)).toEqual(pickSample("s1", ids.slice(0, 100)));
    expect(r.picked[0].title).toMatch(/^決まり \d+$/);
    expect((await makeForm(exec, "practice", "s1")).total).toBe(120);
  });

  it("脚本のある行だけを残し、脚本の無い行と JSON が壊れた行を分けて返す（11/6）", () => {
    const rows = [
      { id: "a", body: JSON.stringify({ rule: "あ", script }) },
      { id: "b", body: JSON.stringify({ rule: "い" }) },
      { id: "c", body: JSON.stringify({ rule: "う", script: { ...script, frames: [] } }) },
      { id: "d", body: JSON.stringify({ rule: "え", script: null }) },
      { id: "e", body: "{壊れた" },
    ];
    const f = scriptedOnly(rows);
    expect(f.kept.map((r) => r.id)).toEqual(["a"]);
    expect(f.noScript).toEqual(["b", "c", "d"]);
    expect(f.broken).toEqual(["e"]);
    expect(hasScript({ script })).toBe(true);
    expect(hasScript(null)).toBe(false);
  });

  it("脚本の無いカードは既定で外し、外した枚数を返す。足りないときは short が立つ。--include-noscript なら入れる（11/6）", async () => {
    const { db, exec } = memExec();
    const card = db.prepare("INSERT INTO cards (id, tenant_id, body) VALUES (?, ?, ?)");
    // 30 枚のうち脚本のあるのは 12 枚、脚本の無いのは 17 枚、本文の壊れたのが 1 枚
    ids.slice(0, 30).forEach((id, i) => card.run(id, "practice", i === 29 ? "{壊れた" : JSON.stringify(i < 12 ? { rule: `決まり ${i}`, script } : { rule: `古い ${i}` })));
    const r = await makeForm(exec, "practice", "s1");
    expect(r.total).toBe(30);
    expect(r.eligible).toBe(12);
    expect(r.droppedNoScript).toBe(17);
    expect(r.droppedBroken).toBe(1);
    expect(r.short).toBe(true);
    expect(r.picked.map((p) => p.id).sort()).toEqual(ids.slice(0, 12));
    expect(r.csv.trim().split("\n")).toHaveLength(14);
    const all = await makeForm(exec, "practice", "s1", { includeNoScript: true });
    expect(all.eligible).toBe(29);
    expect(all.droppedNoScript).toBe(0);
    expect(all.noScript).toBe(17);
    expect(all.picked).toHaveLength(20);
    expect(all.short).toBe(false);
    expect(all.picked.map((p) => p.id)).not.toContain("card-029");
  });
});
