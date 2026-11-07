import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_FACE, EXPRESSIONS, type FaceParts, type FaceShape, faceSvg, FACE_OPTIONS } from "../src/shared/picto/avatar";
import type { Vowel } from "../src/shared/picto/avatar";
import type { View } from "../src/shared/picto/character";

// 表情の描き方を「部品の組み合わせ」に組み替えても、今の 9 つの表情の絵が 1 文字も変わらないことの確かめ。
// 組み替える前の描き方で作った指紋を tests/fixtures/asset-face-same.json に置いてある（UPDATE_FACE_FIXTURE=1 で作り直せるが、絵を変えたいとき以外はしない）
const VIEWS: View[] = ["front", "quarter", "side"];
const SHAPES: FaceShape[] = ["standard", "round", "slim", "square"];
const FILE = "tests/fixtures/asset-face-same.json";

function digests(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ex of EXPRESSIONS)
    for (const view of VIEWS)
      for (const face of SHAPES) {
        const h = createHash("sha256");
        for (const brows of FACE_OPTIONS.brows)
          for (const eyeShape of [...FACE_OPTIONS.eyeShape, "white" as const])
            for (const lashes of [...FACE_OPTIONS.lashes, "threeCenter" as const])
              for (const beard of [...FACE_OPTIONS.beard, "stubble" as const])
                for (const faceSize of ["m", "l"] as const)
                  for (const speak of [undefined, "a", "o"] as (Vowel | undefined)[]) {
                    const p: FaceParts = { ...DEFAULT_FACE, face, brows, eyeShape, lashes, beard, faceSize };
                    h.update(faceSvg(view, p, 0, { expression: ex, speak }));
                    h.update(faceSvg(view, p, 6, { expression: ex, speak }));
                  }
        out[`${ex}/${view}/${face}`] = h.digest("hex").slice(0, 16);
      }
  return out;
}

describe("表情を部品の組み合わせにしても今の絵と同じ", () => {
  it("9 つの表情 × 3 つの向き × 4 つの輪郭 × 顔の部品の全部の組み合わせが、組み替える前と同じ文字列", () => {
    if (process.env.UPDATE_FACE_FIXTURE === "1" && !existsSync(FILE)) writeFileSync(FILE, JSON.stringify(digests(), null, 1));
    expect(digests()).toEqual(JSON.parse(readFileSync(FILE, "utf-8")));
  }, 120000);
});
