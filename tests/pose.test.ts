import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { anglesParams, parsePose } from "../src/shared/pose/angles";
import { validatePose } from "../src/shared/pose/schema";
import { standingPose } from "./fixtures/pose";

const reply = (obj: unknown, stop = "end_turn") => ({ stop_reason: stop, content: [{ type: "text", text: JSON.stringify(obj) }] }) as unknown as Anthropic.Message;

describe("仮の関節の角度（005）", () => {
  it("範囲の中の姿勢は通る", () => {
    expect(validatePose(standingPose())).toEqual([]);
  });

  it("範囲の外の角度・人物の数・小物の付け先を断る", () => {
    const p = standingPose();
    p.figures[0].angles.head = 120;
    p.props[0].figure = 3;
    expect(validatePose(p).join("\n")).toMatch(/head/);
    expect(validatePose(p).join("\n")).toMatch(/figure/);
    expect(validatePose({ ...standingPose(), figures: [] })).toContain("人物は 1〜2 人");
  });

  it("モデルの答えを検査してから使う", () => {
    expect(parsePose(reply(standingPose()))).toEqual(standingPose());
    const bad = standingPose();
    bad.figures[0].x = 2;
    expect(() => parsePose(reply(bad))).toThrow(/範囲の外/);
    expect(() => parsePose(reply(standingPose(), "max_tokens"))).toThrow();
  });

  it("依頼に守ることと理由が入り、作り直しのときは前の受け取り方が入る", () => {
    const t = JSON.stringify(anglesParams("脚立の開き止めを掛ける", "倒れないように", "絵だけを見た人は「脚立を運ぶ」と受け取った").messages);
    expect(t).toContain("脚立の開き止めを掛ける");
    expect(t).toContain("倒れないように");
    expect(t).toContain("脚立を運ぶ");
  });
});
