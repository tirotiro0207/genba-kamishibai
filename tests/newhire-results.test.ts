import { describe, expect, it } from "vitest";
import { FAKE_NEWHIRE, pictureRate, placeTime } from "../src/shared/newhire-results";

// 094: 見る人の答えを、新入社員の匿名の結果と並べる（今は作りものの数）
describe("見る人と新入社員の結果を並べる（094）", () => {
  it("見る人の秒を、新入社員のカードと文の中央値と速い順に並べる", () => {
    expect(placeTime(3000, FAKE_NEWHIRE).rows.map((r) => r.who)).toEqual(["you", "card", "text"]);
    expect(placeTime(9000, FAKE_NEWHIRE).rank).toBe(2);
    expect(placeTime(20000, FAKE_NEWHIRE).rank).toBe(3);
  });

  it("新入社員の正答率を出す。人数が 0 なら null。作りものの数は作りものの印を持つ", () => {
    expect(pictureRate(FAKE_NEWHIRE)).toBe(80);
    expect(pictureRate({ ...FAKE_NEWHIRE, picture: { correct: 0, n: 0 } })).toBeNull();
    expect(FAKE_NEWHIRE.fake).toBe(true);
  });

  it("新入社員の結果には人を区別する欄が無い（人数・中央値・正答率だけ）", () => {
    expect(Object.keys(FAKE_NEWHIRE).sort()).toEqual(["fake", "picture", "time"]);
    expect(Object.keys(FAKE_NEWHIRE.time).sort()).toEqual(["card_ms", "n", "text_ms"]);
    expect(Object.keys(FAKE_NEWHIRE.picture).sort()).toEqual(["correct", "n"]);
  });
});
