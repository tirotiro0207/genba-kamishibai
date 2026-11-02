import type Anthropic from "@anthropic-ai/sdk";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadTuneItems, ROOT } from "../scripts/eval-hook";
import { extractParams, parseExtraction } from "../src/shared/extract/extract";

const reply = (obj: unknown) =>
  ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }] }) as unknown as Anthropic.Message;

describe("仮の取り出し（004）", () => {
  const text = "作業の前に、脚立の開き止めを掛ける。脚立が開いて倒れるおそれがあるため。";

  it("やること・なぜと、どこからが出る。どこからは元の文にあるかを確かめる", () => {
    const out = parseExtraction(
      reply({
        do: [{ text: "脚立の開き止めを掛ける", span: "脚立の開き止めを掛ける" }],
        dont: [],
        why: [{ text: "倒れないように", span: "倒れるおそれがある" }, { text: "作った理由", span: "どこにも無い文" }],
      }),
      text,
    );
    expect(out.map((c) => c.kind)).toEqual(["do", "why", "why"]);
    expect(out.map((c) => c.spanFound)).toEqual([true, true, false]);
  });

  it("最後まで返らなかった答えは使わない", () => {
    expect(() => parseExtraction({ stop_reason: "max_tokens", content: [] } as unknown as Anthropic.Message, text)).toThrow();
  });

  it("依頼に入るのは渡した文だけで、指示に評価データの答えが入っていない", () => {
    const params = extractParams(text);
    expect(JSON.stringify(params.messages)).toContain(text);
    const code = readdirSync(join(ROOT, "src", "shared", "extract")).map((f) => readFileSync(join(ROOT, "src", "shared", "extract", f), "utf-8")).join("\n");
    for (const it of loadTuneItems()) {
      for (const c of [...it.do, ...it.dont, ...it.why]) {
        expect(code).not.toContain(c.text);
        if (c.span && c.span.length >= 8) expect(code).not.toContain(c.span);
      }
      expect(code).not.toContain(it.text.slice(0, 30));
    }
  });
});
