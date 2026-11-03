import { describe, expect, it } from "vitest";
import { loadBanned, namesFromList, namesFromVars, scan, secretValues } from "../scripts/public-check";

// 102: 公開物の検査の道具。禁句・鍵・個人情報の見つけ方を、作りものの一覧と値で確かめる（本物の一覧・PIN・名前は使わない）
const rules = "# 約束\n\n```banned\n作りもの会社\nZZ\n\n```\n";
const secrets = {
  banned: loadBanned(rules),
  values: secretValues({ tenant: "t", pin: "98765432", people: { trainer1: "123400" }, key: "kkkk-not-real", url: "/mcp/t" }, "t.json"),
  names: namesFromVars('SUPERVISOR_1_NAME="山田 作り"\nTRAINER_NAME=\nSESSION_SECRET=abc\n'),
};

describe("公開物の検査（102）", () => {
  it("禁句: 空白を詰めて探し、英数字の語は語の切れ目だけで当たる", () => {
    expect(secrets.banned.map((b) => b.word)).toEqual(["作りもの会社", "ZZ"]);
    expect(scan("a.md", "作り もの 会社の話", secrets).map((h) => h.what)).toEqual(["作りもの会社"]);
    expect(scan("a.md", "zz です", secrets)).toHaveLength(1);
    expect(scan("a.md", "PUZZLE と zzz", secrets)).toEqual([]);
    expect(() => loadBanned("一覧なし")).toThrow();
  });

  it("鍵と PIN: 形と値で当て、値は返さない", () => {
    // 検査そのものに当たらないよう、鍵・メール・電話の形はつないで作る
    const h = scan("b.ts", `const k = "${"sk-"}ant-abcdefghijklmnopqrstuvwx";\nPIN は 98765432\nkkkk-not-real`, secrets);
    expect(h.map((x) => x.kind).sort()).toEqual(["PIN", "鍵", "鍵"]);
    expect(JSON.stringify(h)).not.toMatch(/98765432|sk-ant-abc|kkkk-not-real/);
    expect(secrets.values.map(([l]) => l)).toEqual(["PIN（t.json.pin）", "PIN（t.json.people.trainer1）", "鍵（t.json.key）"]);
  });

  it("個人情報: noreply と例のメールは通し、ほかのメール・電話・名前は当てる。名前は欄の名前だけを返す", () => {
    const ok = "247218239+x@users.noreply.github.com と a@example.com と noreply@anthropic.com";
    expect(scan("c.md", ok, secrets)).toEqual([]);
    const h = scan("c.md", `連絡は someone${"@"}gmail.com か 03-${"1234"}-5678 へ。監修は山田作り`, secrets);
    expect(h.map((x) => [x.kind, x.what])).toEqual([
      ["メール", "…@gmail.com"],
      ["電話", "電話番号の形"],
      ["名前", "SUPERVISOR_1_NAME（1 行目）"],
    ]);
    expect(scan("c.md", "版は 1.03-1234-5678 ではない 2026-11-03", secrets).filter((x) => x.kind === "電話")).toEqual([]);
  });

  it("名前の一覧のファイル: 1 行 1 語を読み、当たった文書の行と一覧の何行目かだけを返す", () => {
    const names = namesFromList("\uFEFF# 見出し\n作り太郎\n\n例の花子\n");
    expect(names.map(([l]) => l)).toEqual(["名前の一覧の 2 行目", "名前の一覧の 4 行目"]);
    const h = scan("d.md", "一行目\n担当は 作り 太郎\n三行目は例の\n花子", { banned: [], values: [], names });
    expect(h.map((x) => x.what)).toEqual(["名前の一覧の 2 行目（2 行目）", "名前の一覧の 4 行目（行をまたぐ）"]);
    expect(JSON.stringify(h)).not.toMatch(/太郎|花子/);
  });
});
