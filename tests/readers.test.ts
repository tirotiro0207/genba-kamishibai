import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BIAS_PATTERNS, findBias } from "../src/shared/readers/bias";
import { orderFor, PANEL_MODEL, PANEL_MODELS, type PanelRun, parseReaderResult, readerPrompt } from "../src/shared/readers/prompt";
import { describeReader, JA_LEVELS, ORIGINS, READER_KEYS, READERS } from "../src/shared/readers/readers";

const pictures = [1, 2, 3, 4, 5].map((i) => ({ label: `絵 ${i}`, path: `C:/x/p${i}.png` }));
const run: PanelRun = { runId: "test", seed: "s", model: "sonnet", answersDir: "C:/x/answers" };

describe("読み手パネルの設定表（027）", () => {
  it("20〜30 人で、ID が重ならない", () => {
    expect(READERS.length).toBeGreaterThanOrEqual(20);
    expect(READERS.length).toBeLessThanOrEqual(30);
    expect(new Set(READERS.map((r) => r.id)).size).toBe(READERS.length);
  });

  it("出身は 7 つ全部いて、ベトナム出身が一番多い", () => {
    const n = (o: string) => READERS.filter((r) => r.origin === o).length;
    for (const o of ORIGINS) expect(n(o), o).toBeGreaterThan(0);
    for (const o of ORIGINS.filter((x) => x !== "ベトナム")) expect(n("ベトナム")).toBeGreaterThan(n(o));
  });

  it("日本語の力は N3 から、文字がほとんど読めない人まで全部いる", () => {
    for (const l of JA_LEVELS) expect(READERS.some((r) => r.ja === l), l).toBe(true);
    expect(READERS.filter((r) => r.origin !== "日本").every((r) => r.ja !== "母語")).toBe(true);
  });

  it("欄は事実だけ（決めた欄のほかを持たない）", () => {
    for (const r of READERS) expect(Object.keys(r).sort()).toEqual([...READER_KEYS].sort());
  });

  it("設定表と指示の型に決めつけの言い回しが無い", () => {
    for (const r of READERS) expect(findBias(describeReader(r)), r.id).toEqual([]);
    expect(findBias(readerPrompt(run, READERS[0], pictures))).toEqual([]);
    for (const f of ["src/shared/readers/readers.ts", "src/shared/readers/prompt.ts"]) {
      const code = readFileSync(f, "utf-8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      expect(findBias(code), f).toEqual([]);
    }
  });

  it("決めつけの検査は、決めつけの言い回しを見つける", () => {
    const bad = ["ベトナムの人は時間にルーズになりがち", "この国の出身者は細かい作業が得意", "国民性として", "日本人らしい反応をする", "一般的にアジアの人は", "Filipinos tend to"];
    for (const b of bad) expect(findBias(b).length, b).toBeGreaterThan(0);
    expect(findBias("出身: ベトナム。日本語の文字を読む力: N4")).toEqual([]);
    expect(BIAS_PATTERNS.length).toBeGreaterThan(3);
  });
});

describe("読み手に渡す指示の型（027）", () => {
  it("絵のパスと設定だけを渡し、順番は読み手ごとに乱数で決まる", () => {
    const p = readerPrompt(run, READERS[0], pictures);
    for (const x of pictures) expect(p).toContain(x.path);
    expect(p).toContain("ほかの読み手の答え");
    expect(orderFor("s", "R01", pictures)).toEqual(orderFor("s", "R01", pictures));
    const orders = new Set(READERS.map((r) => orderFor("s", r.id, pictures).map((x) => x.label).join()));
    expect(orders.size).toBeGreaterThan(5);
  });

  it("既定は Sonnet 5.5 で、切り替えは 1 か所。どちらで回したかを答えに書かせる", () => {
    expect(PANEL_MODEL).toBe("sonnet");
    expect(PANEL_MODELS.sonnet.id).toBe("claude-sonnet-5-5");
    expect(PANEL_MODELS.opus.id).toBe("claude-opus-5-5");
    const src = readFileSync("src/shared/readers/prompt.ts", "utf-8");
    expect(src.match(/export const PANEL_MODEL: PanelModel = "(sonnet|opus)";/g)).toHaveLength(1);
    expect(readerPrompt({ ...run, model: "opus" }, READERS[0], pictures)).toContain('"model": "claude-opus-5-5"');
  });

  it("答えは、モデルが違う・足りない・形が違うと受け付けない", () => {
    const ok = { run: "test", reader: "R01", model: "claude-sonnet-5-5", answers: pictures.map((p) => ({ label: p.label, do: "止める", dont: "", why: "", sure: 3 })) };
    expect(parseReaderResult(ok, run, READERS[0], pictures).answers).toHaveLength(5);
    expect(() => parseReaderResult({ ...ok, model: "claude-opus-5-5" }, run, READERS[0], pictures)).toThrow(/モデル/);
    expect(() => parseReaderResult({ ...ok, model: undefined }, run, READERS[0], pictures)).toThrow(/モデル/);
    expect(() => parseReaderResult({ ...ok, answers: ok.answers.slice(1) }, run, READERS[0], pictures)).toThrow(/答えていない/);
    expect(() => parseReaderResult({ ...ok, answers: [...ok.answers.slice(1), { ...ok.answers[1] }] }, run, READERS[0], pictures)).toThrow(/二重/);
    expect(() => parseReaderResult({ ...ok, answers: ok.answers.map((a) => ({ ...a, sure: 9 })) }, run, READERS[0], pictures)).toThrow(/sure/);
  });
});
