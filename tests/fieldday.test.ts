// 現場の確認の日の段取り表の検査（042）。段取り表は private/fieldday/runsheet.md（git に入らない）に置き、ここでは項目と時間の割り振りだけを調べる
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { privatePath } from "../src/node/private-dir";

const FILE = privatePath("fieldday", "runsheet.md");

/** 必要な項目。並びは書面の順番 */
const ITEMS = ["basics", "timeline", "lanes", "devices", "supervisor", "filming", "graders", "trainer", "fallback"] as const;
/** 決まっていないところに付ける印 */
const PENDING = "確定待ち";
const TOTAL = 90;

const sections = (s: string) => {
  const out = new Map<string, string>();
  const parts = s.split(/<!-- item:([a-z-]+) -->/);
  for (let i = 1; i < parts.length; i += 2) out.set(parts[i], parts[i + 1]);
  return out;
};

/** 表の行を [列, …] に。見出しと区切りの行は除く */
const rows = (md: string) =>
  md
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|[-|\s]+\|$/.test(l))
    .slice(1)
    .map((l) => l.slice(1, -1).split("|").map((x) => x.trim()));

describe.skipIf(!existsSync(FILE))("現場の確認の日の段取り表（042）", () => {
  const sec = sections(existsSync(FILE) ? readFileSync(FILE, "utf-8") : "");

  it("必要な項目が全部、順番どおりに中身つきで入っている", () => {
    expect([...sec.keys()]).toEqual([...ITEMS]);
    for (const [k, body] of sec) expect(body.replace(/^#.*$/gm, "").trim().length, k).toBeGreaterThan(20);
  });

  it("日時・場所・人数・国籍の欄があり、決まっていないところには確定待ちの印がある", () => {
    const basics = new Map(rows(sec.get("basics")!).map(([k, v]) => [k, v]));
    expect(basics.get("日時")).toMatch(/\d+\/\d+.*\d+:\d{2}/);
    for (const k of ["場所", "新入社員の人数", "国籍"]) expect(basics.get(k), k).toBeTruthy();
    // 中身の無い「空欄」は残さない。決まっていないところは確定待ちと書く
    for (const [k, v] of basics) expect(v, k).not.toMatch(/空欄/);
    expect([...basics.values()].some((v) => v.includes(PENDING))).toBe(true);
  });

  it("割り振りは 0 分から 90 分まで、すき間も重なりも無く続く", () => {
    const t = rows(sec.get("timeline")!).map(([a, b, room, side]) => ({ a: Number(a), b: Number(b), room, side }));
    expect(t[0].a).toBe(0);
    expect(t.at(-1)!.b).toBe(TOTAL);
    for (let i = 0; i < t.length; i++) {
      expect(t[i].b, `${t[i].a} 分の段`).toBeGreaterThan(t[i].a);
      if (i) expect(t[i].a, `${t[i].a} 分の段`).toBe(t[i - 1].b);
    }
  });

  // 11/5 作者: ① は 1 人がカードの問題と文の問題を 1 つずつ、全員が同時に。② は ① の後
  it("① は全員が同時で、1 人がカードと文を 1 つずつ。② より前、② は端末を分けて同時、教育担当の勘は ① より前", () => {
    const t = rows(sec.get("timeline")!).map(([a, b, room, side]) => ({ a: Number(a), b: Number(b), room, side }));
    const one = t.find((x) => x.room.startsWith("① 分かるまでの時間"))!;
    const two = t.find((x) => x.room.startsWith("② 絵だけ"))!;
    expect(one.room).toMatch(/全員が同時/);
    expect(one.room).toMatch(/同じ項目を 2 回見せない/);
    expect(sec.get("lanes")).toMatch(/国籍ごとに半分ずつ/);
    expect(sec.get("lanes")).toMatch(/ページの画像/);
    expect(two.room).toMatch(/端末を分けて同時/);
    expect(one.b).toBeLessThanOrEqual(two.a);
    const trainer = t.find((x) => x.side.includes("教育担当の勘"))!;
    expect(trainer.b).toBeLessThanOrEqual(one.a);
    expect(sec.get("trainer")).toMatch(/① より前/);
  });

  it("監修者の段に、監修と署名・20 枚・一言の撮影が時刻つきで、すき間なく並ぶ", () => {
    const t = rows(sec.get("supervisor")!).map(([a, b, what]) => ({ a, b, what }));
    const min = (x: string) => Number(x.split(":")[0]) * 60 + Number(x.split(":")[1]);
    for (let i = 0; i < t.length; i++) {
      // 最後の段だけは終わりを決めない（「—」。15:00 からの職人の撮影は、終わりの時刻が決まっていない）
      if (i === t.length - 1 && t[i].b === "—") continue;
      expect(min(t[i].b), t[i].a).toBeGreaterThan(min(t[i].a));
      if (i) expect(t[i].a).toBe(t[i - 1].b);
    }
    expect(t.find((x) => /署名/.test(x.what))).toBeTruthy();
    expect(t.find((x) => /20 枚/.test(x.what))).toBeTruthy();
    expect(t.find((x) => /一言/.test(x.what))).toBeTruthy();
  });

  it("撮影と一言の公開の同意を確かめる手順と、2 人目の採点者の欄がある", () => {
    expect(sec.get("filming")).toMatch(/撮影.*同意|同意.*撮/);
    expect(sec.get("filming")).toMatch(/一言/);
    expect(sec.get("graders")).toMatch(/2 人目/);
    expect(sec.get("graders")).toMatch(/危ない読み違い/);
  });
});
