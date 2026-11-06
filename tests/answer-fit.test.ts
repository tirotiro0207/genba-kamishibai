import { describe, expect, it } from "vitest";
import { ANSWER_MAX, fitAnswer, packAnswer, unpackAnswer } from "../src/shared/answer-fields";

describe("答えを列の長さに収める（JSON を途中で切らない）", () => {
  it("短い答えはそのまま", () => {
    const s = packAnswer({ ja: "たしかめる", own: "kiểm tra" });
    expect(fitAnswer(s)).toBe(s);
    expect(fitAnswer("ただの文")).toBe("ただの文");
  });

  it("自分の言葉の欄が長すぎても、2 つの欄のまま読める形で切る", () => {
    const s = packAnswer({ ja: "たしかめる", own: "あ".repeat(2500) });
    const out = fitAnswer(s);
    expect(out.length).toBeLessThanOrEqual(ANSWER_MAX);
    const f = unpackAnswer(out)!;
    expect(f.ja).toBe("たしかめる");
    expect(f.own.length).toBeGreaterThan(1900);
    expect(f.own).toMatch(/^あ+$/);
  });

  it("両方が長く、改行のように JSON で長くなる字があっても収める", () => {
    const out = fitAnswer(packAnswer({ ja: "い\n".repeat(800), own: "う\"".repeat(800) }));
    expect(out.length).toBeLessThanOrEqual(ANSWER_MAX);
    expect(unpackAnswer(out)!.ja.startsWith("い\nい")).toBe(true);
  });

  it("前からのただの文は頭から切る", () => {
    expect(fitAnswer("え".repeat(2100))).toBe("え".repeat(ANSWER_MAX));
  });
});
