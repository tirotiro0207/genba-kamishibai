// チャットに添付したファイルを文字にする（11/5）。文字のファイルと Word（.docx）は画面の側で読み、PDF は Worker で Claude に読ませる（/chats/pdf）。
// Word は zip の中の word/document.xml だけを取り出し、段落ごとに 1 行にする（道具を足さず、ブラウザの DecompressionStream で開く）
import { req } from "../make/MakeScreen";

export interface Attached {
  name: string;
  text: string;
  pages?: { page: number; lines: number }[];
}

export const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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
  if (lower.endsWith(".txt") || lower.endsWith(".md") || f.type.startsWith("text/")) {
    const text = (await f.text()).replaceAll("\r\n", "\n").trim();
    if (!text) throw new Error(`${f.name} に文字がありませんでした`);
    return { name: f.name, text };
  }
  throw new Error(`${f.name} は添付できません（PDF・Word・文字のファイル）`);
}
