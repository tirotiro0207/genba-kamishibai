// 指示どうしのつながり: 選ぶ段の描ける物は部品の一覧から作る・脚本と教訓の高さの扱いをそろえる・読み手の国を決めない
import { describe, expect, it } from "vitest";
import { PICK_SYSTEM } from "../src/shared/make/pick";
import { BOARD_SYSTEM, PROP_JA } from "../src/shared/make/script";
import { INNER_KINDS, PROP_KINDS } from "../src/shared/picto/props";
import { readParams } from "../src/shared/verify/formal";
import { readerParams } from "../src/shared/verify/verify";

const IMG = { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: "AAAA" } };

describe("指示どうしのつながり", () => {
  it("選ぶ段の「描ける物」に、今の部品が全部入る（11/5〜11/6 に足した脚立・消火器・AED なども）", () => {
    for (const k of PROP_KINDS) expect(PICK_SYSTEM).toContain(PROP_JA[k]);
    for (const k of INNER_KINDS) expect(PICK_SYSTEM.split("吹き出しの中には")[1]).toContain(PROP_JA[k]);
    expect(PICK_SYSTEM).toContain("脚立");
  });

  it("コマ割りの係は、高さの条件のときだけ台に乗せられると書く（教訓と食い違わない）", () => {
    expect(BOARD_SYSTEM).not.toContain("人を床より高い所に立たせる");
    expect(BOARD_SYSTEM).toContain("高さ〇m」を条件にするときだけ");
  });

  it("確かめる AI の読み手は、国を決めない（外国から来たばかりの新入社員）", () => {
    for (const sys of [String(readParams([IMG]).system), String(readerParams(IMG).system)]) {
      expect(sys).not.toContain("ベトナム");
      expect(sys).toContain("外国から日本に来て");
    }
  });
});
