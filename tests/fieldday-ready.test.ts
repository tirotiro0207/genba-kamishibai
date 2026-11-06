// 当日の準備の確かめ表の検査（066）。表は private/fieldday/ready.md（git に入らない）に置き、段取り表（042）と組で使う。
// 項目がそろうこと、どの行にも確かめ方と × のときの手があること、端末の台数が段取り表と同じこと、
// 記録アプリの画面のアドレスが本当にある画面であることを調べる。実物の確認は当日
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { privatePath } from "../src/node/private-dir";

const FILE = privatePath("fieldday", "ready.md");
const RUNSHEET = privatePath("fieldday", "runsheet.md");
const ITEMS = ["cards", "app", "devices", "network", "recording", "consent"] as const;
const MARKS = ["□", "○", "×", "—"];

const sections = (s: string) => {
  const out = new Map<string, string>();
  const parts = s.split(/<!-- item:([a-z-]+) -->/);
  for (let i = 1; i < parts.length; i += 2) out.set(parts[i], parts[i + 1]);
  return out;
};
const rows = (md: string) =>
  md
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|[-|\s]+\|$/.test(l))
    .slice(1)
    .map((l) => l.slice(1, -1).split("|").map((x) => x.trim()));

describe.skipIf(!existsSync(FILE) || !existsSync(RUNSHEET))("【手元限定】当日の準備の確かめ表（066）", () => {
  const sec = sections(existsSync(FILE) ? readFileSync(FILE, "utf-8") : "");
  const run = existsSync(RUNSHEET) ? readFileSync(RUNSHEET, "utf-8") : "";

  it("8 枚・記録アプリ・端末・回線・録画・同意書の印刷の項目が、順番どおりにある", () => {
    expect([...sec.keys()]).toEqual([...ITEMS]);
  });

  it("どの行にも、確かめ方・前日と当日の印・× のときの手がある", () => {
    for (const [k, body] of sec) {
      const r = rows(body);
      expect(r.length, k).toBeGreaterThan(0);
      for (const [item, how, before, day, fallback] of r) {
        expect(how.length, `${k}: ${item}`).toBeGreaterThan(5);
        expect(MARKS, `${k}: ${item} 前日`).toContain(before);
        expect(MARKS, `${k}: ${item} 当日`).toContain(day);
        expect(fallback.length, `${k}: ${item} × のとき`).toBeGreaterThan(3);
      }
    }
  });

  it("端末の台数と時間の割り振りの ①・② は、段取り表と同じ", () => {
    // 11/5 作者: 端末は iPad からノートパソコン（作者のものと会社のもの）に替えた。1 人 1 台（台数は当日の朝に数える）
    expect(run).toMatch(/1 人 1 台のノートパソコン/);
    expect(sec.get("devices")).toMatch(/ノートパソコン（作者のものと会社のもの）/);
    expect(run).toMatch(/① 分かるまでの時間/);
    expect(run).toMatch(/② 絵だけ/);
    expect(sec.get("app")).toMatch(/① 分かるまでの時間/);
    expect(sec.get("app")).toMatch(/② 絵だけ/);
  });

  it("記録アプリの画面のアドレスは、画面の分け方（App.tsx）にある画面", () => {
    const app = readFileSync("src/client/App.tsx", "utf-8");
    const paths = [...sec.get("app")!.matchAll(/#\/t\/<テナント>\/trial\/(?:<回>\/)?([a-z]+)/g)].map((m) => m[1]);
    expect(paths.sort()).toEqual(["answer", "clocks", "forecast", "grade", "new", "pictures", "self"]);
    for (const p of paths) expect(app, p).toMatch(new RegExp(`r\\[[34]\\] === "${p}"`));
  });

  it("同意書はやさしい日本語の版だけを刷り、確認の済んでいない版は使わない。新入社員は撮らない", () => {
    expect(sec.get("consent")).toMatch(/やさしい日本語の版/);
    expect(sec.get("consent")).not.toMatch(/ベトナム語の版/);
    expect(sec.get("consent")).toMatch(/済んでいない版は使わない/);
    expect(sec.get("recording")).toMatch(/顔・声・名前を撮らない/);
  });
});
