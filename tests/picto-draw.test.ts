import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { MemoryCallLog } from "../src/shared/claude";
import { drawCard, drawParams } from "../src/shared/picto/draw";
import { POSES } from "../src/shared/picto/poses";

const msg = (obj: unknown, model = "claude-opus-5-5") =>
  ({ model, stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;
const fig = (angles = POSES.stand) => ({ x: 0.4, height: 0.55, facing: "right", angles });
const fake = (answers: unknown[]) => {
  const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
  return { sent, client: { messages: { create: async (p: Anthropic.MessageCreateParamsNonStreaming) => (sent.push(p), msg(answers[sent.length - 1], p.model)) } } };
};

describe("絵の数字を決めさせる（079b）", () => {
  it("角度は 1 枚の形、動きはキーフレームの形を求める。決まりの文だけを渡す", () => {
    const a = drawParams("claude-sonnet-5-5", "angles", "体調が悪いときは申し出る") as unknown as { output_config: { format: { schema: { required: string[] } } }; system: string };
    expect(a.output_config.format.schema.required).toEqual(["figures", "props"]);
    const m = drawParams("claude-opus-5-5", "motion", "体調が悪いときは申し出る") as unknown as { output_config: { format: { schema: { required: string[] } } }; system: string };
    expect(m.output_config.format.schema.required).toEqual(["keyframes"]);
    expect(m.system).toMatch(/mark: true/);
  });

  it("範囲の外なら中身を渡して 1 回だけ呼び直し、動きは印の数だけコマになる", async () => {
    const bad = { figures: [fig({ ...POSES.stand, torso: 170 })], props: [] };
    const good = { figures: [fig()], props: [] };
    const f = fake([bad, good]);
    const d = await drawCard({ client: f.client, log: new MemoryCallLog() }, "measure", "claude-sonnet-5-5", "angles", "決まり");
    expect(d.frames).toHaveLength(1);
    expect(d.messages).toHaveLength(2);
    expect(JSON.stringify(f.sent[1].messages)).toMatch(/torso/);

    const k = (t: number, mark: boolean) => ({ t, mark, figures: [fig()], props: [] });
    const g = fake([{ keyframes: [k(0, true), k(1, false), k(2, true), k(3, true)] }]);
    const dm = await drawCard({ client: g.client, log: new MemoryCallLog() }, "measure", "claude-opus-5-5", "motion", "決まり");
    expect(dm.frames).toHaveLength(3);

    const h = fake([bad, bad]);
    await expect(drawCard({ client: h.client, log: new MemoryCallLog() }, "measure", "claude-sonnet-5-5", "angles", "決まり")).rejects.toThrow(/2 回とも/);
  });
});
