import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PATHS, run, sha, stable } from "../scripts/review-import";
import { readMark, readMarks } from "../src/shared/eval/review";

// 060: 監修者の確認表の取り込み。作りものの 3 項目（調整用 2・確認用 1）で試す。本物の確認用は読まない
const tune = [
  { no: 1, reviewer: "安全の監修者", source: "規則 1", url: "u1", text: "文 1", do: [{ text: "する 1", basis: "明記" }], dont: [], why: [{ text: "なぜ 1" }] },
  { no: 2, reviewer: "規程の監修者", source: "規則 2", url: "u2", text: "文 2", do: [{ text: "する 2" }], dont: [{ text: "しない 2" }], why: [] },
];
const hold = { no: 3, reviewer: "安全の監修者", source: "規則 3", url: "u3", text: "文 3", do: [{ text: "する 3" }], dont: [], why: [] };
// 監修者に送った版は担当者の名前と下書きのメモが入っている（ここでは作りもの）
const NAME: Record<string, string> = { 安全の監修者: "作りものの名前 A", 規程の監修者: "作りものの名前 B" };
const sent = (i: typeof hold) => ({ ...i, reviewer: NAME[i.reviewer], decision: "メモ" });

function setup() {
  const root = mkdtempSync(join(tmpdir(), "gk-060-"));
  mkdirSync(join(root, "eval"), { recursive: true });
  writeFileSync(join(root, PATHS.tune), JSON.stringify(tune, null, 2));
  writeFileSync(join(root, PATHS.hashes), JSON.stringify({ version: "x", algorithm: "a", file_sha256: sha(JSON.stringify([hold], null, 2)), items: [{ no: 3, sha256: sha(stable(hold)) }] }));
  const next = [sent(tune[0] as never), { ...sent(tune[1] as never), dont: [{ text: "しない 2（直した）" }], mark: "△" }, sent(hold)];
  const nextPath = join(root, "items_next.json");
  writeFileSync(nextPath, JSON.stringify(next));
  const marks = join(root, "marks.csv");
  writeFileSync(marks, "﻿no,mark,note\n1,○,\n2,△,言い方を直した\n");
  return { root, nextPath, marks, next };
}
const read = (root: string, rel: string) => readFileSync(join(root, rel), "utf-8");

describe("監修者の確認表の取り込み（060）", () => {
  it("印を読む（○△× と書き方の揺れ）", () => {
    expect(["○", "〇", "o", "△", "x", "×"].map(readMark)).toEqual(["○", "○", "○", "△", "×", "×"]);
    expect(readMark("?")).toBeNull();
    expect([...readMarks("no,mark,note\n7,x,a,b\n")]).toEqual([[7, { mark: "×", note: "a,b" }]]);
    expect(() => readMarks("no,note\n1,a")).toThrow();
  });

  it("20 項目を差し替え、直した差分を履歴に残す。担当者は役割のまま、下書きのメモは落とす", () => {
    const s = setup();
    const before = read(s.root, PATHS.hashes);
    const { result, wrote, stopped } = run(s.nextPath, { root: s.root, marks: s.marks, now: new Date("2026-11-05T09:00:00Z") });
    expect(stopped).toBe(false);
    expect(wrote).toEqual([PATHS.tune, PATHS.history]);
    const out = JSON.parse(read(s.root, PATHS.tune));
    expect(out[1].dont).toEqual([{ text: "しない 2（直した）" }]);
    expect(out.map((i: { reviewer: string }) => i.reviewer)).toEqual(["安全の監修者", "規程の監修者"]);
    expect(Object.keys(out[0])).not.toContain("decision");
    expect(result.dropped).toEqual(["decision", "mark"]);
    const h = read(s.root, PATHS.history);
    expect(h).toContain("## 2026-11-05 18:00 items_next.json");
    expect(h).toContain("○ 1・△ 1・× 0");
    expect(h).toContain("### 2 △ 言い方を直した");
    expect(h).toContain("  - 前: しない 2\n  - 後: しない 2（直した）");
    expect(h).toContain("### 1 ○\n\n直し無し");
    // 確認用の 10 項目のハッシュは変わらない
    expect(result.holdoutChanged).toEqual([]);
    expect(read(s.root, PATHS.hashes)).toBe(before);
    expect(h).not.toContain("文 3");
  });

  it("確認用の項目が直っていたら、何も書かずに止まる。番号だけを出し、中身は出さない", () => {
    const s = setup();
    s.next[2] = { ...s.next[2], do: [{ text: "する 3（直した）" }] };
    writeFileSync(s.nextPath, JSON.stringify(s.next));
    const tuneBefore = read(s.root, PATHS.tune);
    const { result, wrote, stopped } = run(s.nextPath, { root: s.root });
    expect(stopped).toBe(true);
    expect(wrote).toEqual([]);
    expect(result.holdoutChanged).toEqual([3]);
    expect(JSON.stringify(result)).not.toContain("する 3");
    expect(read(s.root, PATHS.tune)).toBe(tuneBefore);
  });

  it("--rehash <書き出し先> なら新しい確認用をそこに書き、ハッシュを作り直す（担当者は役割にする）", () => {
    const s = setup();
    s.next[2] = { ...s.next[2], do: [{ text: "する 3（直した）" }] };
    writeFileSync(s.nextPath, JSON.stringify(s.next));
    const out = join(s.root, "holdout-next.json");
    const { wrote } = run(s.nextPath, { root: s.root, rehash: out });
    expect(wrote).toEqual([PATHS.tune, PATHS.history, out, PATHS.hashes]);
    const items = JSON.parse(readFileSync(out, "utf-8"));
    const hashes = JSON.parse(read(s.root, PATHS.hashes));
    expect(items[0].reviewer).toBe("安全の監修者");
    expect(Object.keys(items[0])).not.toContain("decision");
    expect(hashes.items[0].sha256).toBe(sha(stable(items[0])));
    expect(hashes.file_sha256).toBe(sha(readFileSync(out, "utf-8")));
  });

  it("送った版の担当者の欄が owner でも、確認用のハッシュは変わらない", () => {
    const s = setup();
    const owned = s.next.map(({ reviewer, ...i }: { reviewer: string }) => ({ ...i, owner: reviewer }));
    writeFileSync(s.nextPath, JSON.stringify(owned));
    const { result, stopped } = run(s.nextPath, { root: s.root, dry: true });
    expect(stopped).toBe(false);
    expect(result.holdoutChanged).toEqual([]);
    expect(result.tune.map((i) => i.reviewer)).toEqual(["安全の監修者", "規程の監修者"]);
  });

  it("--dry は何も書かない", () => {
    const s = setup();
    expect(run(s.nextPath, { root: s.root, dry: true }).wrote).toEqual([]);
  });
});
