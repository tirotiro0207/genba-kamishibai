import { describe, expect, it } from "vitest";
import { categoryOf } from "../src/shared/exemplars";

describe("手本の分け（電気の「盤」）", () => {
  it("盤に触る・制御盤は電気。基盤・碁盤・地盤のような電気でない語は電気にしない", () => {
    expect(categoryOf("盤に触る前に確かめる")).toBe("electric");
    expect(categoryOf("制御盤の扉を閉める")).toBe("electric");
    expect(categoryOf("碁盤の目のように並べる")).not.toBe("electric");
    expect(categoryOf("地盤の弱い所に置かない")).not.toBe("electric");
    expect(categoryOf("基盤を落とさない")).not.toBe("electric");
  });
});
