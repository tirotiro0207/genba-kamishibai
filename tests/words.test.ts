import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { MemoryCallLog } from "../src/shared/claude";
import { addedNumbers, makeWords, wordsParams } from "../src/shared/make/words";
import { sampleCard } from "./fixtures/card";

const msg = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 500, output_tokens: 200 } }) as unknown as Anthropic.Message;

function fake(outs: unknown[]) {
  const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
  return { sent, messages: { create: async (p: Anthropic.MessageCreateParamsNonStreaming) => (sent.push(p), msg(outs[sent.length - 1])) } };
}

describe("言葉の欄（036）", () => {
  it("カードの文を渡し、足さないことを指示する", () => {
    const p = wordsParams(sampleCard());
    expect(String(p.system)).toContain("カードの文に無いことは足さない");
    expect(JSON.stringify(p.messages)).toContain(sampleCard().statements[0].text);
  });

  it("カードの文に無い数字を見つける", () => {
    const card = sampleCard();
    card.statements[0].text = "高さ 2 m 以上では安全帯を使う";
    expect(addedNumbers(card, { ja: "2 m より 高い ところ", vi: "cao hơn 2 m" })).toEqual([]);
    expect(addedNumbers(card, { ja: "3 回 たしかめる", vi: "kiểm tra 3 lần" })).toEqual(["3"]);
  });

  it("ベトナム語の小数点の「,」は、カードの文の「.」と同じ数字と見る（063 の通しで 1 枚が止まった）", () => {
    const card = sampleCard();
    card.statements[0].text = "酸素の濃度が 0.1 % 下がったら外に出る";
    expect(addedNumbers(card, { ja: "0.1 % さがったら そとに でる", vi: "giảm 0,1 % thì ra ngoài" })).toEqual([]);
    expect(addedNumbers(card, { ja: "そとに でる", vi: "giảm 0,2 % thì ra ngoài" })).toEqual(["0,2"]);
  });

  it("数字を足したら 1 回だけ書き直させ、用語の空の組は捨てる", async () => {
    const card = sampleCard();
    const client = fake([
      { ja: "5 回 たしかめる", vi: "kiểm tra 5 lần", terms: [] },
      { ja: "たしかめる", vi: "kiểm tra", terms: [{ ja: "検電器", vi: "bút thử điện" }, { ja: "", vi: "x" }] },
    ]);
    const out = await makeWords({ client, log: new MemoryCallLog() }, "measure", card);
    expect(client.sent).toHaveLength(2);
    expect(JSON.stringify(client.sent[1].messages)).toContain("「5」");
    expect(out.words).toEqual({ ja: "たしかめる", vi: "kiểm tra" });
    expect(out.terms).toEqual([{ ja: "検電器", vi: "bút thử điện" }]);
  });

  it("2 回とも足したら止める", async () => {
    const bad = { ja: "9 回", vi: "9 lần", terms: [] };
    await expect(makeWords({ client: fake([bad, bad]), log: new MemoryCallLog() }, "measure", sampleCard())).rejects.toThrow("2 回とも");
  });
});
