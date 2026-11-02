import { describe, expect, it } from "vitest";
import { faceText } from "../src/shared/card-face";
import { cutFrames } from "../src/shared/picto/motion";
import { renderFrame } from "../src/shared/picto/scene";
import { MOTION } from "./fixtures/card";

describe("絵の面の文字（037）", () => {
  it("見た目の決まりと注釈は数えず、画面に出る文字は数える", () => {
    expect(faceText('<svg><style>.a{fill:red}</style><title>t</title><path d="M0 0"/></svg>')).toBe("");
    expect(faceText("<svg><text>危</text></svg>")).toBe("危");
  });

  it("カードのコマは、どれも絵の面が 0 字", () => {
    const frames = cutFrames(MOTION);
    expect(frames.length).toBeGreaterThanOrEqual(3);
    for (const { frame } of frames) expect(faceText(renderFrame(frame).svg)).toBe("");
  });
});
