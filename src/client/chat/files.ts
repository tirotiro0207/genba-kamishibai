// チャットに添付したファイルを文字にする（11/5）。文字のファイル・Word（.docx）・Excel（.xlsx・11/7）は画面の側で読み、PDF（/chats/pdf）と写真（/chats/image・11/7）は Worker で Claude に読ませる。
// Word は zip の中の word/document.xml だけを取り出し、段落ごとに 1 行にする（道具を足さず、ブラウザの DecompressionStream で開く）
import { req } from "../make/MakeScreen";

export interface Attached {
  name: string;
  text: string;
  pages?: { page: number; lines: number }[];
}

export const ACCEPT =
  ".pdf,.docx,.xlsx,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*";
/** 添付できるもの（画面の言葉） */
export const ACCEPT_LABEL = "PDF・Word・Excel・文字のファイル・写真";

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/** zip から 1 つのファイルを取り出す（しまい方は「そのまま」か deflate） */
export async function unzipOne(buf: ArrayBuffer, path: string): Promise<Uint8Array | null> {
  const b = new Uint8Array(buf);
  // 終わりの記録（PK\x05\x06）を後ろから探す
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { e = i; break; }
  if (e < 0) return null;
  const count = u16(b, e + 10);
  let p = u32(b, e + 16);
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (u32(b, p) !== 0x02014b50) return null;
    const method = u16(b, p + 10), size = u32(b, p + 20), nameLen = u16(b, p + 28), extra = u16(b, p + 30), note = u16(b, p + 32), local = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extra + note;
    if (name !== path) continue;
    const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    const data = b.subarray(start, start + size);
    if (method === 0) return data;
    if (method !== 8) return null;
    const out = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(out).arrayBuffer());
  }
  return null;
}

/** Word の本文を段落ごとの行にする（表のセルも段落として 1 行ずつ） */
export function docxText(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  return Array.from(doc.getElementsByTagNameNS(W, "p"))
    .map((p) => Array.from(p.getElementsByTagNameNS(W, "t")).map((t) => t.textContent ?? "").join("").trim())
    .filter(Boolean)
    .join("\n");
}

/** Excel の文字のセル（共有の文字・その場の文字・数）を、シートごとに 1 行 1 つの「・」区切りにする（11/7 作者） */
export async function xlsxText(buf: ArrayBuffer): Promise<string> {
  const dec = new TextDecoder();
  const parse = (x: Uint8Array) => new DOMParser().parseFromString(dec.decode(x), "application/xml");
  const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const shared: string[] = [];
  const ss = await unzipOne(buf, "xl/sharedStrings.xml");
  if (ss) for (const si of Array.from(parse(ss).getElementsByTagNameNS(S, "si"))) shared.push(Array.from(si.getElementsByTagNameNS(S, "t")).map((t) => t.textContent ?? "").join(""));
  const out: string[] = [];
  for (let n = 1; n <= 30; n++) {
    const sheet = await unzipOne(buf, `xl/worksheets/sheet${n}.xml`);
    if (!sheet) break;
    for (const row of Array.from(parse(sheet).getElementsByTagNameNS(S, "row"))) {
      const cells = Array.from(row.getElementsByTagNameNS(S, "c")).map((c) => {
        const t = c.getAttribute("t");
        if (t === "s") return shared[Number(c.getElementsByTagNameNS(S, "v")[0]?.textContent ?? -1)] ?? "";
        if (t === "inlineStr") return Array.from(c.getElementsByTagNameNS(S, "t")).map((x) => x.textContent ?? "").join("");
        return c.getElementsByTagNameNS(S, "v")[0]?.textContent ?? "";
      });
      const line = cells.map((x) => x.trim()).filter(Boolean).join("・");
      if (line) out.push(line);
    }
  }
  return out.join("\n");
}

/** 写真を長い辺 2000px の JPEG に縮める（スマホの写真は大きいので、Claude に渡せる大きさにする） */
async function shrinkImage(f: File): Promise<Blob> {
  if (f.size <= 3.5 * 1024 * 1024 && /^image\/(jpeg|png|webp|gif)$/.test(f.type)) return f;
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * k);
  cv.height = Math.round(bmp.height * k);
  cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
  return await new Promise<Blob>((ok, ng) => cv.toBlob((b) => (b ? ok(b) : ng(new Error(`${f.name} を縮められませんでした`))), "image/jpeg", 0.85));
}

export async function readAttachment(tenant: string, f: File): Promise<Attached> {
  const lower = f.name.toLowerCase();
  if (lower.endsWith(".pdf") || f.type === "application/pdf") {
    const r = await req<{ text: string; pages: { page: number; lines: number }[] }>(tenant, "/chats/pdf", { method: "POST", headers: { "content-type": "application/pdf" }, body: f });
    return { name: f.name, text: r.text, pages: r.pages };
  }
  if (lower.endsWith(".docx")) {
    const xml = await unzipOne(await f.arrayBuffer(), "word/document.xml");
    if (!xml) throw new Error(`${f.name} を Word の文書として開けませんでした`);
    const text = docxText(new TextDecoder().decode(xml));
    if (!text) throw new Error(`${f.name} に文字がありませんでした`);
    return { name: f.name, text };
  }
  if (lower.endsWith(".xlsx")) {
    const text = await xlsxText(await f.arrayBuffer());
    if (!text) throw new Error(`${f.name} に文字がありませんでした（Excel）`);
    return { name: f.name, text };
  }
  if (f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/.test(lower)) {
    const img = await shrinkImage(f);
    const r = await req<{ text: string; pages: { page: number; lines: number }[] }>(tenant, "/chats/image", { method: "POST", headers: { "content-type": img.type || "image/jpeg" }, body: img });
    return { name: f.name, text: r.text, pages: r.pages };
  }
  if (lower.endsWith(".txt") || lower.endsWith(".md") || f.type.startsWith("text/")) {
    const text = (await f.text()).replaceAll("\r\n", "\n").trim();
    if (!text) throw new Error(`${f.name} に文字がありませんでした`);
    return { name: f.name, text };
  }
  throw new Error(`${f.name} は添付できません（${ACCEPT_LABEL}）`);
}
