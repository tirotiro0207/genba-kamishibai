// PNG・SVG の書き出し（077）。署名済みのカードのコマを 1 枚ずつ、絵の下に「版・署名の日付・何コマ目か」の帯を付けて書き出す。
// 帯は絵の面の外に置くので、絵の面は 0 字のまま。ファイル名にも版と日付を入れる。PNG にするのは Node の側（src/node/png.ts）。
import type { CardBody } from "./card";
import { cutFrames } from "./picto/motion";
import { renderFrame, SIZE } from "./picto/scene";

export const FOOT = 64;
const FONT = "Yu Gothic, Meiryo, Hiragino Sans, Noto Sans JP, sans-serif";

export interface ExportItem {
  /** ファイル名（拡張子なし） */
  name: string;
  svg: string;
}

/** 署名の時刻を、日本の日付（YYYY-MM-DD）にする */
export const dayOf = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** 1 コマの絵の下に帯を付けた SVG */
export function footed(picture: string, foot: string, size = SIZE): string {
  const inner = picture.replace(/^<svg /, `<svg x="0" y="0" `);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + FOOT}" viewBox="0 0 ${size} ${size + FOOT}">` +
    `<rect width="${size}" height="${size + FOOT}" fill="#fff"/>${inner}` +
    `<line x1="0" y1="${size + 1}" x2="${size}" y2="${size + 1}" stroke="#111" stroke-width="2"/>` +
    `<text x="${size / 2}" y="${size + FOOT / 2}" font-family="${FONT}" font-size="28" font-weight="700" fill="#111" text-anchor="middle" dominant-baseline="middle">${esc(foot)}</text></svg>`
  );
}

/** 1 枚のカードのコマを全部、版と日付入りで */
export function exportCard(id: string, body: CardBody, version: number, signedAt: string): ExportItem[] {
  if (body.motion.kind !== "keyframes") throw new Error(`${id}: 動きの HTML のカードは、コマの絵が無いので書き出せない`);
  const day = dayOf(signedAt);
  const frames = cutFrames(body.motion.json);
  return frames.map(({ frame }, i) => ({
    name: `${id}_v${version}_${day}_${i + 1}of${frames.length}`,
    svg: footed(renderFrame(frame).svg, `版 ${version} ・ ${day} ・ ${i + 1} / ${frames.length}`),
  }));
}
