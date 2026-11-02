import { describe, expect, it } from "vitest";
import { sourceLines } from "../scripts/readers-text-prompts";
import type { CardBody } from "../src/shared/card";
import { READERS } from "../src/shared/readers/readers";
import { readerTextPrompt } from "../src/shared/readers/text-prompt";

// 読み手パネルの「元の文を読ませた側」（057）: 資料の文をそのまま渡し、絵の側と同じ問いに答えさせる
describe("元の文を読ませた側（057）", () => {
  const run = { runId: "r1", seed: "s1", model: "sonnet" as const, answersDir: "/tmp/answers" };
  const texts = [
    { label: "文 1", text: "一つ目の文" },
    { label: "文 2", text: "二つ目の文" },
    { label: "文 3", text: "三つ目の文" },
  ];

  it("文を全部そのまま並べ、答えの置き場と読み手の名前が入る。並びは読み手ごとに決まる", () => {
    const p = readerTextPrompt(run, READERS[0], texts);
    for (const t of texts) expect(p).toContain(`### ${t.label}\n${t.text}`);
    expect(p).toContain(`/tmp/answers/${READERS[0].id}.json`);
    expect(p).toContain("日本語の文字を読む力が設定より上のように読まないでください");
    expect(readerTextPrompt(run, READERS[0], texts)).toBe(p);
    const order = (s: string) => texts.map((t) => s.indexOf(`### ${t.label}`));
    const orders = new Set(READERS.map((r) => order(readerTextPrompt(run, r, texts)).join(",")));
    expect(orders.size).toBeGreaterThan(1);
  });

  it("資料の行を、文の元の位置からページ・行の順に重ねずに取り出す", () => {
    const body = {
      statements: [
        { text: "a", sources: [{ kind: "doc", doc: "m", page: 12, line: 3, line_end: 4 }] },
        { text: "b", sources: [{ kind: "doc", doc: "m", page: 2, line: 1 }, { kind: "doc", doc: "m", page: 12, line: 4 }, { kind: "input", input: "x", start: 0, end: 1 }] },
      ],
    } as unknown as CardBody;
    const page = (doc: string, n: number) => [1, 2, 3, 4].map((l) => `${doc}-${n}-${l}`);
    expect(sourceLines(body, page)).toEqual(["m-2-1", "m-12-3", "m-12-4"]);
  });
});
