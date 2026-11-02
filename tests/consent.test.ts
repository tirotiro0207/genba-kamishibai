// 同意書の必要な項目の検査（026）。下書きは private/consent（git に入らない）に言葉ごとに置き、ここでは項目の印だけを調べる
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { privatePath } from "../src/node/private-dir";

const DIR = privatePath("consent");

/** 必要な項目。並びは書面の順番。中身は docs/consent.md */
const CONSENT_ITEMS = ["purpose", "voluntary", "no-boss", "stop-delete", "not-to-company", "not-evaluation", "recording", "publish-anonymous", "reuse", "questions", "sign"] as const;

/** 言葉ごとに、書面にかならず入る言い回し（言葉を足したら足す） */
const MUST: Record<string, Partial<Record<(typeof CONSENT_ITEMS)[number], RegExp[]>>> = {
  "ja-easy": { "publish-anonymous": [/名前を けした こたえ だけ/], recording: [/顔と 声は/, /手.*画面.*だけ/], reuse: [/AI（Claude）に わたす/, /それ いがいの ために、外（そと）の サービスには わたしません/] },
  vi: { "publish-anonymous": [/công khai mà không ghi tên/, /chỉ công khai câu trả lời đã xóa tên/], recording: [/khuôn mặt/, /giọng nói/, /Chỉ quay tay và màn hình/], reuse: [/cho AI \(Claude\)/, /không đưa câu trả lời cho dịch vụ bên ngoài/] },
};

const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^consent\.[a-z-]+\.md$/.test(f)) : [];
const sections = (s: string) => {
  const out = new Map<string, string>();
  const parts = s.split(/<!-- item:([a-z-]+) -->/);
  for (let i = 1; i < parts.length; i += 2) out.set(parts[i], parts[i + 1]);
  return out;
};

describe.skipIf(files.length === 0)("同意書の下書き（026）", () => {
  it("やさしい日本語とベトナム語の版がある", () => {
    expect(files).toEqual(expect.arrayContaining(["consent.ja-easy.md", "consent.vi.md"]));
  });

  for (const f of files) {
    const lang = f.slice("consent.".length, -".md".length);
    const s = readFileSync(join(DIR, f), "utf-8");
    it(`${lang}: 必要な項目が全部、順番どおりに中身つきで入っている`, () => {
      expect(s).toContain(`<!-- lang:${lang} -->`);
      const sec = sections(s);
      expect([...sec.keys()]).toEqual([...CONSENT_ITEMS]);
      for (const [k, body] of sec) expect(body.replace(/^#.*$/gm, "").trim().length, k).toBeGreaterThan(10);
      for (const [k, res] of Object.entries(MUST[lang] ?? {})) for (const re of res ?? []) expect(sec.get(k), `${k} ${re}`).toMatch(re);
    });
    it(`${lang}: 会社の名前・連絡先・名前を書く欄が無い`, () => {
      expect(s).not.toMatch(/株式会社|有限会社|công ty TNHH|Co\.,? ?Ltd|@|\d{2,4}-\d{2,4}-\d{3,4}/i);
      expect(sections(s).get("sign")).not.toMatch(/氏名|名前[:：]|Họ và tên|Họ tên/);
    });
  }
});
