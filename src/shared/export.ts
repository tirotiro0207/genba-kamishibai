// PNG・SVG の書き出し（077）。署名済みのカードのコマを 1 枚ずつ、絵の下に「版・署名の日付・何コマ目か」の帯を付けて書き出す。
// 帯は絵の面の外に置くので、絵の面は 0 字のまま。ファイル名にも版と日付を入れる。PNG にするのは Node の側（src/node/png.ts）。
// 11/7 既定（作者の確認待ち）:
// - 命に関わるカード（weight が life）は、絵の面の外（帯と、貼り紙の外の余白）に赤い縁を付ける。絵の中には赤を置かない（赤は禁止の印だけ）。
//   確かめる AI に渡す絵（コマの PNG）と、絵柄の検査（style.ts）は絵の面だけを見るので、この縁は入らない
// - 掲示の版（exportSheet）: A4 横の 1 枚に、コマを大きく 2×2（原則の 1 コマは 1 枚を大きく）並べ、右にやさしい日本語（ふりがなは（ ））と版・日付
// - 原則の列（exportPrinciples）: 原則の 1 コマのカードを小さく横 1 列に並べ、貼り紙の下に付ける
import { type CardBody, weightOf } from "./card";
import { cutFrames } from "./picto/motion";
import { renderFrame, SIZE } from "./picto/scene";
import { rubyParen } from "./ruby";

export const FOOT = 64;
const FONT = "Yu Gothic, Meiryo, Hiragino Sans, Noto Sans JP, sans-serif";
/** 命に関わるカードの縁の赤（画面の --err と同じ） */
export const LIFE_RED = "#cc2222";

export interface ExportItem {
  /** ファイル名（拡張子なし） */
  name: string;
  svg: string;
}

/** 署名の時刻を、日本の日付（YYYY-MM-DD）にする */
export const dayOf = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** 絵の SVG を、外の SVG の中の (x, y) に置く（大きさは絵の SVG のまま） */
const placed = (picture: string, x: number, y: number) => picture.replace(/^<svg /, `<svg x="${x}" y="${y}" `);

/** 1 コマの絵の下に帯を付けた SVG。life なら帯を赤地に白い字にする（赤は絵の面の外だけ） */
export function footed(picture: string, foot: string, size = SIZE, life = false): string {
  const inner = placed(picture, 0, 0);
  const band = life ? `<rect x="0" y="${size}" width="${size}" height="${FOOT}" fill="${LIFE_RED}" data-part="life-rim"/>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + FOOT}" viewBox="0 0 ${size} ${size + FOOT}">` +
    `<rect width="${size}" height="${size + FOOT}" fill="#fff"/>${inner}${band}` +
    `<line x1="0" y1="${size + 1}" x2="${size}" y2="${size + 1}" stroke="#111" stroke-width="2"/>` +
    `<text x="${size / 2}" y="${size + FOOT / 2}" font-family="${FONT}" font-size="28" font-weight="700" fill="${life ? "#fff" : "#111"}" text-anchor="middle" dominant-baseline="middle">${esc(foot)}</text></svg>`
  );
}

const keyframesOf = (id: string, body: CardBody) => {
  if (body.motion.kind !== "keyframes") throw new Error(`${id}: 動きの HTML のカードは、コマの絵が無いので書き出せない`);
  return body.motion.json;
};

/** 1 枚のカードのコマを全部、版と日付入りで */
export function exportCard(id: string, body: CardBody, version: number, signedAt: string): ExportItem[] {
  const json = keyframesOf(id, body);
  const day = dayOf(signedAt);
  const frames = cutFrames(json);
  const life = weightOf(body) === "life";
  return frames.map(({ frame }, i) => ({
    name: `${id}_v${version}_${day}_${i + 1}of${frames.length}`,
    svg: footed(renderFrame(frame).svg, `${life ? "命に関わる ・ " : ""}版 ${version} ・ ${day} ・ ${i + 1} / ${frames.length}`, SIZE, life),
  }));
}

/** 文を 1 行 perLine 字ずつに折る（日本語は字ごとに折ってよい。行の数の上限を超えたら最後を「…」） */
export function wrapText(s: string, perLine: number, maxLines = 99): string[] {
  const chars = [...s.replace(/\s+/g, " ").trim()];
  const lines: string[] = [];
  for (let i = 0; i < chars.length; i += perLine) lines.push(chars.slice(i, i + perLine).join(""));
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = `${[...cut[maxLines - 1]].slice(0, Math.max(0, perLine - 1)).join("")}…`;
    return cut;
  }
  return lines;
}

const textBlock = (lines: string[], x: number, y: number, size: number, weight = 400, color = "#111") =>
  lines.map((l, i) => `<text x="${x}" y="${y + i * size * 1.4}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}" dominant-baseline="hanging">${esc(l)}</text>`).join("");

/** 掲示の版の大きさ（A4 横を 1 mm = 10 px で） */
export const SHEET_W = 2970;
export const SHEET_H = 2100;
const M = 60;
const GAP = 30;

/**
 * 掲示の版（11/7）: A4 横の 1 枚。左にコマを大きく 2×2（3 コマなら 1 つ空ける。原則の 1 コマは 1 枚を大きく）、
 * 右に守ること・なぜ・やさしい日本語（ふりがなは（ ）書き）と、下に版・署名の日付。コマの番号は絵の外の左上に置く。
 * 命に関わるカードは、紙の外の余白に赤い縁と「命に関わる」の札を付ける（絵の面には赤を置かない）
 */
export function exportSheet(id: string, body: CardBody, version: number, signedAt: string): ExportItem {
  const json = keyframesOf(id, body);
  const day = dayOf(signedAt);
  const life = weightOf(body) === "life";
  const frames = cutFrames(json);
  const single = frames.length === 1;
  const gridH = SHEET_H - 2 * M;
  const cell = single ? gridH : Math.floor((gridH - GAP) / 2);
  const parts: string[] = [];
  frames.slice(0, 4).forEach(({ frame }, i) => {
    const x = M + (single ? 0 : (i % 2) * (cell + GAP));
    const y = M + (single ? 0 : Math.floor(i / 2) * (cell + GAP));
    parts.push(placed(renderFrame(frame, cell).svg, x, y));
    if (!single) parts.push(`<circle cx="${x + 34}" cy="${y + 34}" r="26" fill="#fff" stroke="#111" stroke-width="3"/><text x="${x + 34}" y="${y + 36}" font-family="${FONT}" font-size="32" font-weight="700" text-anchor="middle" dominant-baseline="middle">${i + 1}</text>`);
  });
  const gridW = single ? cell : cell * 2 + GAP;
  const tx = M + gridW + 2 * GAP;
  const tw = SHEET_W - tx - M;
  let ty = M;
  if (life) {
    parts.push(`<rect x="${tx}" y="${ty}" width="${Math.min(tw, 360)}" height="72" rx="8" fill="${LIFE_RED}"/>`);
    parts.push(textBlock(["命に関わる"], tx + 24, ty + 14, 44, 700, "#fff"));
    ty += 72 + GAP;
  }
  if (body.bundle) {
    parts.push(textBlock(wrapText(`${body.bundle.parent}（${body.bundle.order} / ${body.bundle.total}）`, Math.floor(tw / 36), 2), tx, ty, 36, 700, "#444"));
    ty += 2 * 36 * 1.4 + GAP;
  }
  const rule = wrapText(body.rule, Math.floor(tw / 64), 5);
  parts.push(textBlock(rule, tx, ty, 64, 700));
  ty += rule.length * 64 * 1.4 + GAP;
  const why = wrapText(`なぜ: ${body.why}`, Math.floor(tw / 44), 4);
  parts.push(textBlock(why, tx, ty, 44));
  ty += why.length * 44 * 1.4 + GAP;
  if (body.words?.ja) {
    const words = wrapText(rubyParen(body.words.ja), Math.floor(tw / 48), 8);
    parts.push(textBlock(words, tx, ty, 48, 700));
  }
  parts.push(textBlock([`版 ${version} ・ ${day}`], tx, SHEET_H - M - 40, 36, 700, "#444"));
  const rim = life ? `<rect x="10" y="10" width="${SHEET_W - 20}" height="${SHEET_H - 20}" fill="none" stroke="${LIFE_RED}" stroke-width="20" data-part="life-rim"/>` : "";
  return {
    name: `${id}_v${version}_${day}_sheet`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${SHEET_H}" viewBox="0 0 ${SHEET_W} ${SHEET_H}"><rect width="${SHEET_W}" height="${SHEET_H}" fill="#fff"/>${rim}${parts.join("")}</svg>`,
  };
}

export interface PrincipleItem {
  id: string;
  body: CardBody;
  version: number;
  signedAt: string;
}

/**
 * 原則の列（11/7）: 原則の 1 コマのカードを、貼り紙の下に付ける横 1 列に小さく並べる。幅は掲示の版と同じ。
 * 原則でないカードと、動きの HTML のカードは入れない。1 枚も無ければ null
 */
export function exportPrinciples(items: PrincipleItem[], name = "principles"): ExportItem | null {
  const xs = items.filter((x) => x.body.shape === "principle" && x.body.motion.kind === "keyframes");
  if (!xs.length) return null;
  const cell = Math.min(420, Math.floor((SHEET_W - 2 * M - (xs.length - 1) * GAP) / xs.length));
  const cap = 30;
  const h = M + cell + 12 + cap * 1.4 * 3 + M;
  const parts = xs.map((x, i) => {
    const px = M + i * (cell + GAP);
    const [first] = cutFrames(keyframesOf(x.id, x.body));
    const life = weightOf(x.body) === "life";
    const rim = life ? `<rect x="${px - 8}" y="${M - 8}" width="${cell + 16}" height="${cell + 16}" fill="none" stroke="${LIFE_RED}" stroke-width="8" data-part="life-rim"/>` : "";
    return `${rim}${placed(renderFrame(first.frame, cell).svg, px, M)}${textBlock(wrapText(x.body.rule, Math.max(4, Math.floor(cell / cap)), 2), px, M + cell + 12, cap, 700)}${textBlock([`版 ${x.version} ・ ${dayOf(x.signedAt)}`], px, M + cell + 12 + cap * 1.4 * 2, cap * 0.8, 400, "#444")}`;
  });
  return { name, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${Math.ceil(h)}" viewBox="0 0 ${SHEET_W} ${Math.ceil(h)}"><rect width="${SHEET_W}" height="${Math.ceil(h)}" fill="#fff"/>${parts.join("")}</svg>` };
}
