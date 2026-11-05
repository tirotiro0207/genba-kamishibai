// 102: 公開物の検査をまとめて流す。1 本でも見つかれば 1 で終わる（0 件なら 0。道具が動かなかったときは 2）。
// 一覧は private/audit/102-public-check-all.json（git の外）。画面にも一覧にも、種類・件数・どのファイルかだけを出し、見つけた値は出さない。
//
//   BANNED_RULES=<約束のファイル> [PUBLIC_CHECK_NAMES_FILE=<名前の一覧>] npx tsx scripts/public-check-all.ts   （npm run public-check）
//
// 流すもの（外の API は使わない。公開デモには行かない。デモも見るなら scripts/public-check.ts）:
//   1 禁句 / 2 鍵 / 3 個人情報 / 4 資料の文 … git に入っているファイルとコミットの文（scripts/public-check.ts の道具）
//   5 git に入っている private/ のファイル（1 ファイルにつき 1 件）
//   6 画像の中の文字列 … svg は文字、png・jpg・webp はメタデータの文字列の欄（tEXt・iTXt・zTXt・EXIF・XMP・コメント）だけ。
//     画像のバイト列そのものは読まない（バイト列の偶然の一致で禁句に当たるのを避ける）
//   7 leak-check … eval/prompts/ のプロンプトに当てて、重なりの件数だけを取る（HOLDOUT_FILE は渡さない）
// eval/holdout/ は調べない。
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { privatePath } from "../src/node/private-dir";
import { copiedRuns } from "../src/shared/overlap";
import { type Secrets, loadSecrets, scan } from "./public-check";

const ROOT = join(import.meta.dirname, "..");

export type Category = "禁句" | "鍵" | "個人情報" | "資料の文" | "private" | "画像の文字列" | "leak-check";
const CATEGORIES: Category[] = ["禁句", "鍵", "個人情報", "資料の文", "private", "画像の文字列", "leak-check"];
export interface Found {
  category: Category;
  where: string;
  /** 見つけた種類（禁句・PIN・メール など）。値は入れない */
  kind: string;
}

const CATEGORY_OF: Record<string, Category> = { 禁句: "禁句", 鍵: "鍵", PIN: "鍵", メール: "個人情報", 電話: "個人情報", 名前: "個人情報", 資料の文: "資料の文" };

// ---- 画像のメタデータの文字列 ----

const utf8 = (b: Uint8Array) => Buffer.from(b).toString("utf-8").replace(/\0+$/, "");

/** TIFF（EXIF）の文字の欄だけを集める。ASCII 型・UserComment・XP 系（UTF-16）。サブの IFD と次の IFD も辿る */
export function tiffStrings(buf: Buffer): string[] {
  const out: string[] = [];
  if (buf.length < 8) return out;
  const head = buf.toString("latin1", 0, 2);
  const le = head === "II";
  if (!le && head !== "MM") return out;
  const u16 = (o: number) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o: number) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const utf16 = (b: Uint8Array) => {
    const c = Buffer.from(b);
    return (le ? c : c.swap16()).toString("utf16le").replace(/\0+$/, "");
  };
  const SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const seen = new Set<number>();
  const walk = (at: number, depth: number) => {
    if (depth > 4 || at < 8 || at + 2 > buf.length || seen.has(at)) return;
    seen.add(at);
    const n = u16(at);
    for (let i = 0; i < n; i++) {
      const e = at + 2 + i * 12;
      if (e + 12 > buf.length) return;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      if ([0x8769, 0x8825, 0xa005].includes(tag) && type === 4) {
        walk(u32(e + 8), depth + 1);
        continue;
      }
      const size = (SIZE[type] ?? 0) * count;
      const off = size <= 4 ? e + 8 : u32(e + 8);
      if (!size || off + size > buf.length) continue;
      const data = buf.subarray(off, off + size);
      if (type === 2) out.push(utf8(data));
      else if (type === 7 && tag === 0x9286 && data.length > 8) {
        const charset = data.toString("latin1", 0, 8);
        if (charset.startsWith("ASCII")) out.push(utf8(data.subarray(8)));
        else if (charset.startsWith("UNICODE")) out.push(utf16(data.subarray(8)));
      } else if (type === 1 && tag >= 0x9c9b && tag <= 0x9c9f) out.push(utf16(data));
    }
    const next = at + 2 + n * 12;
    if (next + 4 <= buf.length) walk(u32(next), depth + 1);
  };
  walk(u32(4), 0);
  return out;
}

/** PNG: tEXt・zTXt・iTXt（XMP もここ）・eXIf の文字の欄 */
export function pngStrings(buf: Buffer): string[] {
  const out: string[] = [];
  if (buf.length < 8 || buf.toString("latin1", 1, 4) !== "PNG") return out;
  const inflate = (b: Buffer) => {
    try {
      return utf8(inflateSync(b));
    } catch {
      return "";
    }
  };
  for (let p = 8; p + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("latin1", p + 4, p + 8);
    const d = buf.subarray(p + 8, Math.min(p + 8 + len, buf.length));
    if (type === "tEXt") out.push(utf8(d));
    else if (type === "zTXt") {
      const z = d.indexOf(0);
      if (z >= 0) out.push(utf8(d.subarray(0, z)), inflate(d.subarray(z + 2)));
    } else if (type === "iTXt") {
      const z = d.indexOf(0);
      if (z >= 0) {
        const compressed = d[z + 1] === 1;
        const l = d.indexOf(0, z + 3); // 言語の札の終わり
        const t = l >= 0 ? d.indexOf(0, l + 1) : -1; // 訳したキーワードの終わり
        if (t >= 0) out.push(utf8(d.subarray(0, z)), utf8(d.subarray(l + 1, t)), compressed ? inflate(d.subarray(t + 1)) : utf8(d.subarray(t + 1)));
      }
    } else if (type === "eXIf") out.push(...tiffStrings(Buffer.from(d)));
    else if (type === "IEND") break;
    p += 12 + len;
  }
  return out;
}

/** JPEG: 画像データ（SOS）の前の、APP1 の EXIF と XMP・COM（コメント）の文字の欄 */
export function jpegStrings(buf: Buffer): string[] {
  const out: string[] = [];
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return out;
  for (let p = 2; p + 4 <= buf.length && buf[p] === 0xff; ) {
    const m = buf[p + 1];
    if (m === 0xda || m === 0xd9) break; // ここから先は画像のバイト列
    if (m === 0xff) {
      p += 1;
      continue;
    }
    const len = buf.readUInt16BE(p + 2);
    const d = buf.subarray(p + 4, Math.min(p + 2 + len, buf.length));
    if (m === 0xe1 && d.toString("latin1", 0, 6) === "Exif\0\0") out.push(...tiffStrings(Buffer.from(d.subarray(6))));
    else if (m === 0xe1 && d.toString("latin1", 0, 28).startsWith("http://ns.adobe.com/xap/1.0/")) out.push(utf8(d.subarray(29)));
    else if (m === 0xfe) out.push(utf8(d));
    p += 2 + len;
  }
  return out;
}

/** WebP: RIFF の EXIF と XMP の欄 */
export function webpStrings(buf: Buffer): string[] {
  const out: string[] = [];
  if (buf.length < 12 || buf.toString("latin1", 0, 4) !== "RIFF" || buf.toString("latin1", 8, 12) !== "WEBP") return out;
  for (let p = 12; p + 8 <= buf.length; ) {
    const type = buf.toString("latin1", p, p + 4);
    const len = buf.readUInt32LE(p + 4);
    const d = buf.subarray(p + 8, Math.min(p + 8 + len, buf.length));
    if (type === "EXIF") out.push(...tiffStrings(Buffer.from(d.toString("latin1", 0, 6) === "Exif\0\0" ? d.subarray(6) : d)));
    else if (type === "XMP ") out.push(utf8(d));
    p += 8 + len + (len % 2);
  }
  return out;
}

export const IMAGE = /\.(png|jpe?g|svg|webp)$/i;

/** 画像 1 枚から読む文字列。svg は全文、ほかはメタデータの欄だけ */
export function imageText(path: string, buf: Buffer): string {
  if (/\.svg$/i.test(path)) return buf.toString("utf-8");
  const strings = /\.png$/i.test(path) ? pngStrings(buf) : /\.jpe?g$/i.test(path) ? jpegStrings(buf) : webpStrings(buf);
  return strings.join("\n");
}

// ---- 流す ----

const TEXT = /\.(md|ts|tsx|js|mjs|cjs|json|css|html|yml|yaml|txt|toml|py|sh|ps1|sql|csv|example)$|(^|\/)(\.gitignore|LICENSE|CLAUDE\.md)$/;
const LOCK = /(^|\/)package-lock\.json$/;
const HOLDOUT = /^eval\/holdout\//;

const gitIn = (root: string, ...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
// -z: 日本語のファイル名が引用符つきに化けないように
const tracked = (root: string) => gitIn(root, "ls-files", "-z").split("\0").filter((f) => f && !HOLDOUT.test(f));

/** leak-check の出力の行 →（プロンプト, 重なりの件数）。重なった語句は読み捨てる */
export function parseLeakOutput(out: string): { prompt: string; count: number }[] {
  return out
    .split(/\r?\n/)
    .filter((l) => /取り出し \d+.*・当日のカード \d+.*・調整用 \d+.*・確認用 /.test(l))
    .map((l) => {
      const prompt = l.slice(0, l.indexOf(": 取り出し"));
      // 「（語句…）」は件数を読む前に落とす
      const flat = l.slice(l.indexOf(": 取り出し")).replace(/（[^）]*）/g, "");
      const n = (k: string) => Number(new RegExp(`${k} (\\d+)`).exec(flat)?.[1] ?? 0);
      return { prompt, count: n("取り出し") + n("当日のカード") + n("調整用") + n("確認用") };
    });
}

function runLeak(root: string): Found[] {
  const prompts = readdirSync(join(root, "eval", "prompts"))
    .filter((f) => f.endsWith(".txt"))
    .map((f) => `eval/prompts/${f}`);
  if (!prompts.length) return [];
  const env = { ...process.env };
  env.HOLDOUT_FILE = undefined; // 確認用は渡さない（子には届かない）
  let out: string;
  try {
    out = execFileSync(process.execPath, ["--import", "tsx", "scripts/leak-check.ts", ...prompts], { cwd: root, encoding: "utf-8", env, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 });
  } catch (e) {
    // 重なりがあると 1 で終わる。出力が読めるのは 1 のときだけ（2 や出力無しは道具の失敗）
    const x = e as { status?: number; stdout?: string };
    if (x.status !== 1 || !x.stdout) throw new Error(`leak-check が動かなかった（終了 ${String(x.status)}）`);
    out = x.stdout;
  }
  const rows = parseLeakOutput(out);
  if (rows.length !== prompts.length) throw new Error(`leak-check の出力が読めない（プロンプト ${prompts.length} 本に対して ${rows.length} 行）`);
  return rows.filter((r) => r.count > 0).map((r) => ({ category: "leak-check", where: r.prompt, kind: `重なり ${r.count} 件` }));
}

export interface RunOptions {
  root: string;
  secrets: Secrets;
  /** 7 の leak-check を流すか（本番の root だけ） */
  leak?: boolean;
}

export function runChecks(o: RunOptions): { found: Found[]; counts: Record<Category, number>; docs: number; images: number } {
  const { root, secrets } = o;
  const { material, ...rest } = secrets;
  const files = tracked(root);
  const found: Found[] = [];
  const docs: [string, string][] = [];

  for (const f of files) {
    if (f.startsWith("private/")) found.push({ category: "private", where: f, kind: "git に入っている" });
    if (TEXT.test(f) && !LOCK.test(f)) docs.push([f, readFileSync(join(root, f), "utf-8")]);
  }
  // コミットの文（まだコミットが無い置き場は空）
  try {
    for (const m of gitIn(root, "log", "--format=%h%x00%B%x01").split("\x01").filter((x) => x.trim())) {
      const [h, body] = m.trim().split("\x00");
      docs.push([`コミット ${h}`, body ?? ""]);
    }
  } catch {}

  for (const [w, t] of docs) for (const h of scan(w, t, rest)) found.push({ category: CATEGORY_OF[h.kind], where: w, kind: h.kind });
  // 資料の文: 評価データ（法令と公開資料の文）は資料ではないので比べない
  if (material.length) for (const [w, t] of docs) if (!w.startsWith("eval/") && copiedRuns(t, material, 20).length) found.push({ category: "資料の文", where: w, kind: "資料の文" });

  const images = files.filter((f) => IMAGE.test(f));
  for (const f of images) for (const h of scan(f, imageText(f, readFileSync(join(root, f))), rest)) found.push({ category: "画像の文字列", where: f, kind: h.kind });

  if (o.leak) found.push(...runLeak(root));

  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, found.filter((x) => x.category === c).length])) as Record<Category, number>;
  return { found, counts, docs: docs.length, images: images.length };
}

function main() {
  const r = runChecks({ root: ROOT, secrets: loadSecrets(), leak: true });
  const dir = privatePath("audit");
  mkdirSync(dir, { recursive: true });
  const at = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" });
  writeFileSync(join(dir, "102-public-check-all.json"), `${JSON.stringify({ at, docs: r.docs, images: r.images, counts: r.counts, found: r.found }, null, 1)}\n`);
  console.log(`調べた文書 ${r.docs}（ファイル・コミットの文）・画像 ${r.images}`);
  console.log(`見つけたもの ${r.found.length} 件: ${Object.entries(r.counts).map(([k, n]) => `${k} ${n}`).join("・")}`);
  for (const f of r.found) console.log(`- ${f.category}: ${f.where}（${f.kind}）`);
  process.exit(r.found.length ? 1 : 0);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  }
}
