import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 112: docs/flow.md の段の形と、作業の表・制作記録との食い違い
const flow = readFileSync("docs/flow.md", "utf-8");
const ID = /\b\d{3}[a-z]?\b/g;

/** 作業の表から、マスの番号 → 状態（済み・途中・まだ） */
const status = new Map<string, string>();
for (const line of readFileSync("docs/plan.md", "utf-8").split(/\r?\n/)) {
  const c = line.split("|").map((x) => x.trim());
  const st = c.find((x) => x === "済み" || x === "途中" || x === "まだ");
  if (/^\d{3}[a-z]?$/.test(c[1] ?? "") && st) status.set(c[1], st);
}

/** 段の行（→ で始まる行）と、その行が引くマスの番号 */
const steps = flow
  .split(/\r?\n/)
  .filter((l) => l.startsWith("→ "))
  .map((l) => ({ line: l, ids: (l.match(/（[^（）]*）$/)?.[0].match(ID) ?? []) as string[], todo: /（まだ・/.test(l) }));

describe("docs/flow.md（112）", () => {
  it("【前】【中】【後】の順に段があり、どの段にも 1 行以上ある", () => {
    const heads = flow.match(/^## 【.】/gm) ?? [];
    expect(heads).toEqual(["## 【前】", "## 【中】", "## 【後】"]);
    for (const part of flow.split(/^## /m).slice(1)) expect(part.split(/\r?\n/).filter((l) => l.startsWith("→ ")).length).toBeGreaterThan(0);
  });

  it("どの段も行の終わりにマスの番号があり、作業の表にある", () => {
    for (const s of steps) {
      expect(s.ids.length, s.line).toBeGreaterThan(0);
      for (const id of s.ids) expect(status.has(id), `${id}: ${s.line}`).toBe(true);
    }
  });

  it("作業の表と食い違わない（済みの段のマスは済み、まだの段のマスは済みでない）", () => {
    for (const s of steps)
      for (const id of s.ids) {
        if (s.todo) expect(status.get(id), `${id}: ${s.line}`).not.toBe("済み");
        else expect(status.get(id), `${id}: ${s.line}`).toBe("済み");
      }
  });

  it("制作記録で済んだマスを、まだの段に書かない", () => {
    const logged = new Set(readFileSync("docs/build-log.md", "utf-8").split(/\r?\n/).filter((l) => l.startsWith("→ ")).flatMap((l) => l.match(/^→ \d{1,2}:\d{2} ([\d・a-z]+) /)?.[1].split("・") ?? []));
    for (const s of steps.filter((x) => x.todo)) for (const id of s.ids) expect(logged.has(id), `${id}: ${s.line}`).toBe(false);
  });
});
