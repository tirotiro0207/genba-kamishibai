import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadBanned } from "../scripts/public-check";
import { jpegStrings, parseLeakOutput, pngStrings, runChecks, tiffStrings } from "../scripts/public-check-all";

// 102: 公開物の検査のまとめ。試しのファイルは tests/ の一時のフォルダの中の使い捨ての git 置き場に作り、終わりに消す。
// 禁句は作りものの一覧（W）で通しで確かめる。本物の一覧は、実行の時に BANNED_RULES から読む（試験のコードには書き写さない）
const W = "作りもの会社";
const fake = { banned: loadBanned(`\`\`\`banned\n${W}\n\`\`\`\n`), values: [] as [string, string][], names: [] as [string, string][], material: [] as string[] };

const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]); // 検査は CRC を見ない
};
const png = (...chunks: Buffer[]) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", Buffer.alloc(13)), ...chunks, chunk("IEND", Buffer.alloc(0))]);
const text = (k: string, v: string) => chunk("tEXt", Buffer.from(`${k}\0${v}`, "utf-8"));
const ztxt = (k: string, v: string) => chunk("zTXt", Buffer.concat([Buffer.from(`${k}\0\0`, "latin1"), deflateSync(Buffer.from(v, "utf-8"))]));

/** 小さな EXIF（リトルエンディアン、IFD0 に ImageDescription の ASCII 1 つ） */
const tiff = (desc: string) => {
  const s = Buffer.from(`${desc}\0`, "utf-8");
  const h = Buffer.from([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]);
  const ifd = Buffer.alloc(2 + 12 + 4);
  ifd.writeUInt16LE(1, 0);
  ifd.writeUInt16LE(0x010e, 2);
  ifd.writeUInt16LE(2, 4);
  ifd.writeUInt32LE(s.length, 6);
  ifd.writeUInt32LE(8 + ifd.length, 10);
  return Buffer.concat([h, ifd, s]);
};
const seg = (marker: number, data: Buffer) => {
  const len = Buffer.alloc(2);
  len.writeUInt16BE(data.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), len, data]);
};
/** 画像データの部分に scan のバイト列を入れた JPEG */
const jpeg = (segs: Buffer[], scan = Buffer.from([1, 2, 3])) => Buffer.concat([Buffer.from([0xff, 0xd8]), ...segs, seg(0xda, Buffer.from([0, 0])), scan, Buffer.from([0xff, 0xd9])]);
const exif = (desc: string) => seg(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff(desc)]));

const base = mkdtempSync(join(import.meta.dirname, ".tmp-public-check-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));

/** 使い捨ての git 置き場を作り、ファイルを git add する（force: private/ と eval/holdout/ も入れる） */
function repo(name: string, files: Record<string, string | Buffer>): string {
  const root = join(base, name);
  mkdirSync(root, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: root });
  for (const [f, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), body);
  }
  execFileSync("git", ["add", "-f", "-A"], { cwd: root });
  return root;
}

describe("画像の文字列の読み出し", () => {
  it("PNG: tEXt・zTXt の欄だけを読み、画像のバイト列は読まない", () => {
    const s = pngStrings(png(text("Comment", `連絡 ${W}`), ztxt("Description", `圧縮 ${W}`)));
    expect(s.filter((x) => x.includes(W))).toHaveLength(2);
    // IDAT（画像のバイト列）に語のバイト列があっても、欄ではないので読まない
    expect(pngStrings(png(chunk("IDAT", Buffer.from(W, "utf-8")))).join("")).not.toContain(W);
  });

  it("JPEG: EXIF の文字とコメントを読み、画像データ（SOS のあと）は読まない", () => {
    expect(tiffStrings(tiff(`説明 ${W}`)).join("")).toContain(W);
    expect(jpegStrings(jpeg([exif(`説明 ${W}`)])).join("")).toContain(W);
    expect(jpegStrings(jpeg([seg(0xfe, Buffer.from(`コメント ${W}`, "utf-8"))])).join("")).toContain(W);
    expect(jpegStrings(jpeg([], Buffer.from(W, "utf-8"))).join("")).not.toContain(W);
  });

  it("壊れた画像でも落ちない", () => {
    expect(pngStrings(Buffer.from("PNGでない"))).toEqual([]);
    expect(jpegStrings(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]))).toEqual([]);
    expect(tiffStrings(Buffer.from("II*\0\xff\xff\xff\xff", "latin1"))).toEqual([]);
  });
});

describe("検査のまとめ（使い捨ての git 置き場に流す）", () => {
  it("きれいな置き場は 0 件。画像のバイト列に語のバイト列が偶然あっても当たらない", () => {
    const root = repo("clean", {
      "README.md": "ふつうの文\n",
      "a.png": png(text("Software", "tool 1.0"), chunk("IDAT", Buffer.from(W, "utf-8"))),
      "b.jpg": jpeg([exif("camera")], Buffer.from(W, "utf-8")),
      "c.svg": "<svg><text>hello</text></svg>",
    });
    const r = runChecks({ root, secrets: fake });
    expect(r.found).toEqual([]);
    expect(r.images).toBe(3);
  });

  it("わざと入れたものを種類ごとに見つけ、値は一覧に出さない。eval/holdout/ は調べない", () => {
    const mail = `someone${"@"}gmail.com`;
    const key = `const k = "${"sk-"}ant-abcdefghijklmnopqrstuvwx";`;
    const root = repo("dirty", {
      "docs/a.md": `本文 ${W}`,
      "docs/k.ts": key,
      "docs/m.md": `連絡は ${mail}`,
      "docs/b.svg": `<svg><title>${W}</title></svg>`,
      "docs/c.png": png(text("Comment", W)),
      "docs/d.png": png(ztxt("Comment", W)),
      "docs/e.jpg": jpeg([exif(W)]),
      "docs/f.jpg": jpeg([seg(0xfe, Buffer.from(W, "utf-8"))]),
      "private/x.txt": "作った物",
      "eval/holdout/h.json": `{"x":"${W}"}`,
    });
    const r = runChecks({ root, secrets: fake });
    expect(r.counts).toEqual({ 禁句: 1, 鍵: 1, 個人情報: 1, 資料の文: 0, private: 1, 画像の文字列: 5, "leak-check": 0 });
    expect(r.found.filter((x) => x.category === "画像の文字列").map((x) => x.where).sort()).toEqual(["docs/b.svg", "docs/c.png", "docs/d.png", "docs/e.jpg", "docs/f.jpg"]);
    expect(r.found.some((x) => x.where.startsWith("eval/holdout/"))).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(new RegExp(`${W}|abcdefghijklmnop|someone`));
  });

  it("資料の文: 20 文字続けて同じ文書を見つける（評価データは比べない）", () => {
    const line = "これは試験のための作りものの長い一文であって実在の資料ではありません";
    const root = repo("material", { "docs/n.md": `前置き ${line} 後書き`, "eval/n.json": line });
    const r = runChecks({ root, secrets: { ...fake, banned: [], material: [line] } });
    expect(r.found).toEqual([{ category: "資料の文", where: "docs/n.md", kind: "資料の文" }]);
  });

  it("本物の禁句の一覧でも画像のメタデータの中の語を見つける（一覧は実行の時に読む）", () => {
    const rules = process.env.BANNED_RULES;
    if (!rules) return; // 一覧が無い環境では作りものの一覧の試験だけ
    const real = loadBanned(readFileSync(rules, "utf-8"));
    const root = repo("real", { "docs/x.png": png(text("Comment", real[0].word)), "docs/ok.png": png(text("Comment", "ふつう")) });
    const r = runChecks({ root, secrets: { banned: real, values: [], names: [], material: [] } });
    expect(r.counts.画像の文字列).toBe(1);
    expect(r.found[0].where).toBe("docs/x.png");
  });
});

describe("leak-check の出力", () => {
  it("重なった語句は読み捨てて、件数だけを足す", () => {
    const out = [
      "相手: 取り出しの決まりと理由 0（無し）・当日のカードの表 0 行・調整用 134 文・確認用 無し（HOLDOUT_FILE が無い）",
      "eval/prompts/a.txt: 取り出し 0・当日のカード 0・調整用 3（あいう・えお・かき 4）・確認用 未",
      "eval/prompts/b.txt: 取り出し 0・当日のカード 0・調整用 0・確認用 未",
    ].join("\n");
    expect(parseLeakOutput(out)).toEqual([
      { prompt: "eval/prompts/a.txt", count: 3 },
      { prompt: "eval/prompts/b.txt", count: 0 },
    ]);
  });
});
