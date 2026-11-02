import type Anthropic from "@anthropic-ai/sdk";
import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { pdfPages } from "../src/node/pdf";
import { MemoryCallLog } from "../src/shared/claude";

/** 1 ページ目は文字の層あり（2 行）、2 ページ目は図だけ（文字の層なし）の PDF を作る */
function samplePdf(): Uint8Array {
  const doc = new mupdf.PDFDocument();
  const res = doc.addObject({ Font: { F1: doc.addSimpleFont(new mupdf.Font("Helvetica")) } });
  const text = "BT /F1 14 Tf 72 720 Td (Wear the helmet first) Tj 0 -20 Td (Check the tester before use) Tj ET BT /F1 10 Tf 300 400 Td (Side note) Tj ET";
  doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, res, text));
  doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, res, "0 0 0 rg 100 100 200 200 re f"));
  return doc.saveToBuffer("compress").asUint8Array();
}

function fakeOcr() {
  const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
  return {
    sent,
    messages: {
      create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
        sent.push(p);
        const text = JSON.stringify({ lines: [{ text: "図の中の見出し", box: [0.1, 0.2, 0.5, 0.03] }, { text: " ", box: [0, 0, 0, 0] }, { text: "はみ出し", box: [-1, 2, 0.5, 0.1] }] });
        return { model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text }], usage: { input_tokens: 1800, output_tokens: 300 } } as unknown as Anthropic.Message;
      },
    },
  };
}

describe("PDF → ページの画像 → 行番号付きの文字（031b）", () => {
  it("全ページが画像と行番号付きの文字になり、行は上から番号が付き、光らせる位置を持つ", async () => {
    const pages = await pdfPages(samplePdf());
    expect(pages.map((p) => p.page)).toEqual([1, 2]);
    expect(pages[0].source).toBe("text");
    expect(pages[0].lines.map((l) => [l.n, l.text])).toEqual([
      [1, "Wear the helmet first"],
      [2, "Check the tester before use"],
      [3, "Side note"],
    ]);
    const [x, y, w, h] = pages[0].lines[0].box;
    expect(x).toBeCloseTo(72 / 595, 2);
    expect(y).toBeGreaterThan(0.1);
    expect(y).toBeLessThan(0.15);
    expect(w).toBeGreaterThan(0.1);
    expect(h).toBeGreaterThan(0);
    for (const p of pages) expect([...p.png.slice(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
  });

  it("文字の層が無いページは Opus で読み、費用が記録に残る。読まないときは空", async () => {
    expect((await pdfPages(samplePdf()))[1]).toMatchObject({ source: "ocr", lines: [] });
    const client = fakeOcr();
    const log = new MemoryCallLog();
    const pages = await pdfPages(samplePdf(), { ocr: { deps: { client, log }, purpose: "night" } });
    expect(client.sent.length).toBe(1);
    const content = client.sent[0].messages[0].content as { type: string }[];
    expect(content.map((b) => b.type)).toEqual(["image", "text"]);
    expect(pages[1].lines).toEqual([
      { n: 1, text: "図の中の見出し", box: [0.1, 0.2, 0.5, 0.03] },
      { n: 2, text: "はみ出し", box: [0, 1, 0.5, 0.1] },
    ]);
    expect(log.records).toHaveLength(1);
    expect(log.records[0]).toMatchObject({ label: "PDF の読み取り", purpose: "night" });
    expect(log.records[0].usd).toBeGreaterThan(0);
  });
});
