import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { MemoryCallLog } from "../src/shared/claude";
import { type ImageBlock, isRed, readerParams, runCard } from "../src/shared/verify/verify";
import { standingPose } from "./fixtures/pose";

const RULE = "脚立の開き止めを確実に掛けてから昇る";
const WHY = "脚立が開いて倒れないように";
const IMG: ImageBlock = { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } };

/** 呼ばれた依頼を残し、label の代わりにモデル名と system の中身で答えを返す偽の client */
function fake(scores: number[]) {
  const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let m = 0;
  const reply = (obj: unknown) => ({ model: "x", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;
  return {
    sent,
    messages: {
      create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
        sent.push(p);
        const sys = String(p.system);
        if (sys.includes("人形の姿勢")) return reply(standingPose());
        if (sys.includes("新入社員です")) return reply({ meaning: "脚立を運ぶ", do: "運ぶ", dont: null, why_guess: null, confidence: 50 });
        return reply({ score: scores[m++] ?? 100, dangerous: false, reason: "開き止めが描かれていない" });
      },
    },
  };
}

describe("仮の確かめる AI（007）", () => {
  it("確かめる AI に渡す中身に、決まりの文が入っていない", () => {
    const t = JSON.stringify(readerParams(IMG));
    expect(t).not.toContain("脚立");
    const content = readerParams(IMG).messages[0].content as Array<{ type: string }>;
    expect(content.map((b) => b.type)).toEqual(["image", "text"]);
  });

  it("赤の線は 60 点未満か危ない読み違い", () => {
    expect(isRed({ score: 59, dangerous: false, reason: "" })).toBe(true);
    expect(isRed({ score: 90, dangerous: true, reason: "" })).toBe(true);
    expect(isRed({ score: 60, dangerous: false, reason: "" })).toBe(false);
  });

  it("赤なら前の受け取り方を渡して 1 回だけ作り直す", async () => {
    const c = fake([30, 20]);
    const at = await runCard({ client: c, log: new MemoryCallLog(), draw: () => IMG }, "measure", RULE, WHY);
    expect(at.map((a) => a.red)).toEqual([true, true]);
    expect(c.sent).toHaveLength(6); // 角度・読む・照合 × 2
    expect(JSON.stringify(c.sent[3].messages)).toContain("脚立を運ぶ");
    // 絵を読む 2 回とも、決まりの文が入っていない
    for (const p of c.sent.filter((p) => String(p.system).includes("新入社員です"))) expect(JSON.stringify(p.messages)).not.toContain(RULE);
  });

  it("赤でなければ作り直さない", async () => {
    const c = fake([80]);
    const at = await runCard({ client: c, log: new MemoryCallLog(), draw: () => IMG }, "measure", RULE, WHY);
    expect(at).toHaveLength(1);
    expect(c.sent).toHaveLength(3);
  });
});
