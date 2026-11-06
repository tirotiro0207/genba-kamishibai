// PDF → ページの画像 → 行番号付きの文字（031b）。手元の Node で mupdf を使い、会社の資料を外に出さずに処理する。
// 行はページの中で上から順に 1 から番号を振り、ページに対する割合の位置（経路の画面で光らせる位置）を持つ。
// 文字の層が無いページは、ページの画像を Opus に読ませて行と位置を返させ、その費用は呼び出しの記録に残る。
import type Anthropic from "@anthropic-ai/sdk";
import * as mupdf from "mupdf";
import { type GuardedDeps, guardedCall, type Purpose } from "../shared/claude";
import { imageBlock } from "./png";

/** 位置はページの幅と高さに対する割合（左上が 0,0） */
export interface PdfLine {
  n: number;
  text: string;
  box: [x: number, y: number, w: number, h: number];
}

export interface PdfPage {
  page: number;
  width: number;
  height: number;
  png: Uint8Array;
  lines: PdfLine[];
  source: "text" | "ocr";
}

/** ページの画像の長い辺（Opus に渡す大きさと同じ） */
export const PAGE_PX = 1400;
/** 文字の層の文字数がこれ未満なら、文字の層が無いとみなす */
export const MIN_TEXT_CHARS = 5;
export const OCR_MODEL = "claude-opus-5-5";

const r4 = (n: number) => Math.round(n * 10000) / 10000;

interface StLine {
  bbox: { x: number; y: number; w: number; h: number };
  text: string;
}

/** 文字の層から行を取る（上から、同じ高さなら左から） */
export function textLines(page: mupdf.Page): PdfLine[] {
  const [x0, y0, x1, y1] = page.getBounds();
  const [w, h] = [x1 - x0, y1 - y0];
  const st = JSON.parse(page.toStructuredText("preserve-whitespace").asJSON()) as { blocks: { type: string; lines?: StLine[] }[] };
  const raw = st.blocks.flatMap((b) => (b.type === "text" ? (b.lines ?? []) : [])).filter((l) => l.text.trim());
  // 2 つずつ比べる並べ方は、行の高さで「同じ高さ」が決まるので推移的でなく、入力の順で並びが揺れる。
  // 先に上から並べて、行の頭から高さの半分までを 1 つの段にまとめ、段の中を左から並べる（入力の順に依らない）
  const byY = [...raw].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x || a.text.localeCompare(b.text));
  const rows: StLine[][] = [];
  for (const l of byY) {
    const row = rows.at(-1);
    if (row && l.bbox.y - row[0].bbox.y <= row[0].bbox.h / 2) row.push(l);
    else rows.push([l]);
  }
  const lines = rows.flatMap((row) => row.sort((a, b) => a.bbox.x - b.bbox.x || a.bbox.y - b.bbox.y));
  return lines.map((l, i) => ({ n: i + 1, text: l.text.trim(), box: [r4((l.bbox.x - x0) / w), r4((l.bbox.y - y0) / h), r4(l.bbox.w / w), r4(l.bbox.h / h)] }));
}

export function renderPage(page: mupdf.Page, px = PAGE_PX): Uint8Array {
  const [x0, y0, x1, y1] = page.getBounds();
  const s = px / Math.max(x1 - x0, y1 - y0);
  return page.toPixmap(mupdf.Matrix.scale(s, s), mupdf.ColorSpace.DeviceRGB, false, true).asPNG();
}

const OCR_SYSTEM = `あなたは資料の読み取り係です。渡されたのは資料の 1 ページの画像です。
書いてある文字を、行ごとに上から順にそのまま書き写してください。要約・言い換え・補いはしません。
box は行を囲む四角で、ページの幅と高さに対する割合（左上が 0,0。x・y・w・h、どれも 0〜1）。
読めない文字は「〓」にします。図の中の文字も行として書き写します。`;

const OCR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "box"],
        properties: { text: { type: "string" }, box: { type: "array", items: { type: "number" } } },
      },
    },
  },
} as const;

export function ocrParams(png: Uint8Array): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: OCR_MODEL,
    max_tokens: 16000,
    system: OCR_SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: { type: "json_schema", schema: OCR_SCHEMA } },
    messages: [{ role: "user", content: [imageBlock(png), { type: "text", text: "このページの文字を行ごとに書き写してください。" }] }],
  } as Anthropic.MessageCreateParamsNonStreaming;
}

const clamp01 = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? r4(Math.min(1, Math.max(0, n))) : 0);

/** 文字の層が無いページを Opus で読む */
export async function ocrLines(deps: GuardedDeps, purpose: Purpose, png: Uint8Array): Promise<PdfLine[]> {
  const msg = await guardedCall(deps, { purpose, label: "PDF の読み取り", params: ocrParams(png) });
  if (msg.stop_reason !== "end_turn") throw new Error(`PDF の読み取りが最後まで返らなかった: ${msg.stop_reason}`);
  const out = JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as { lines: { text: string; box: number[] }[] };
  return out.lines
    .filter((l) => typeof l.text === "string" && l.text.trim())
    .map((l, i) => ({ n: i + 1, text: l.text.trim(), box: [clamp01(l.box?.[0]), clamp01(l.box?.[1]), clamp01(l.box?.[2]), clamp01(l.box?.[3])] }));
}

export interface PdfOptions {
  /** 文字の層が無いページを読む呼び出し。無ければ読まずに行を空で返す */
  ocr?: { deps: GuardedDeps; purpose: Purpose };
  px?: number;
}

/** 全ページを、ページの画像と行番号付きの文字にする */
export async function pdfPages(bytes: Uint8Array, opts: PdfOptions = {}): Promise<PdfPage[]> {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const out: PdfPage[] = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    const [x0, y0, x1, y1] = page.getBounds();
    const png = renderPage(page, opts.px);
    let lines = textLines(page);
    let source: PdfPage["source"] = "text";
    if (lines.reduce((s, l) => s + l.text.replace(/\s/g, "").length, 0) < MIN_TEXT_CHARS) {
      source = "ocr";
      lines = opts.ocr ? await ocrLines(opts.ocr.deps, opts.ocr.purpose, png) : [];
    }
    out.push({ page: i + 1, width: r4(x1 - x0), height: r4(y1 - y0), png, lines, source });
  }
  return out;
}
