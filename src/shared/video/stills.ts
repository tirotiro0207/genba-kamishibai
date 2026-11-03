// 動画の承の素材 2 枚（029）。写真は使わず、ここで描く。
// - 貼り紙: 文字がびっしりの A3 の貼り紙を壁に貼った絵。文はこの場で作った言い回しで、会社の資料の文は使わない。文字は全部ぼかし、「イメージ」と添える
// - 焼けた作業服: ピクトグラムの絵柄の決まり（黒とグレーだけ・文字なし）で描く
import { rng } from "../assign";

const n = (v: number) => Math.round(v * 10) / 10;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 貼り紙の本文。この場で作った一般的な言い回し（ぼかすので読めない） */
const POSTER_LINES = [
  "作業の前に、受け持つ回路のブレーカーを切り、札を掛けてから検電器で確かめること",
  "高い所では、足場の手すりと安全帯の掛け先を確かめてから上がること",
  "工具は使う前に、柄の割れ・被覆の傷・刃の欠けがないかを見ること",
  "脚立の天板には乗らない。開き止めを掛け、二人で押さえて使うこと",
  "通路に材料を置かない。切れ端はその日のうちに片付けること",
  "火を使う作業は、消火器を手の届く所に置き、終わったあとも見回ること",
  "体の具合が悪いときは、作業を始める前に必ず上の人に言うこと",
  "重い物は一人で持たない。腰を落として、声を掛け合って運ぶこと",
  "仮の配線は、つなぐ前に図面と照らし、終わったら外したことを記録すること",
  "保護めがね・手袋・ヘルメットのあごひもを、作業の間ずっと着けること",
];

export interface PosterOptions {
  width?: number;
  height?: number;
  seed?: string;
  /** ぼかしの強さ（本文） */
  blur?: number;
}

/** 壁に貼った A3 の貼り紙（横長の動画の 1 コマ）。文字は全部ぼかし、右下に「イメージ」 */
export function posterSvg(o: PosterOptions = {}): string {
  const W = o.width ?? 1920;
  const H = o.height ?? 1080;
  const r = rng(o.seed ?? "029-poster");
  const blur = o.blur ?? 5;
  // A3 縦（297 × 420）を画面の高さの 88% に
  const ph = H * 0.88;
  const pw = (ph * 297) / 420;
  const px = (W - pw) / 2;
  const py = (H - ph) / 2;
  const m = pw * 0.06;
  const fs = pw * 0.021; // 本文の字の大きさ
  const lh = fs * 1.45;
  const font = "Yu Gothic, Meiryo, sans-serif";
  const text: string[] = [];
  // 見出しの帯
  text.push(`<rect x="${n(px + m)}" y="${n(py + m)}" width="${n(pw - 2 * m)}" height="${n(pw * 0.11)}" fill="#c62828"/>`);
  text.push(`<text x="${n(px + pw / 2)}" y="${n(py + m + pw * 0.077)}" font-family="${font}" font-weight="700" font-size="${n(pw * 0.06)}" fill="#fff" text-anchor="middle">安全作業のきまり</text>`);
  let y = py + m + pw * 0.11 + fs * 2.2;
  const maxChars = Math.floor((pw - 2 * m - fs * 2.5) / fs);
  let sec = 1;
  while (y < py + ph - m - fs * 4) {
    // 節の見出し
    text.push(`<rect x="${n(px + m)}" y="${n(y - fs * 1.05)}" width="${n(fs * 0.5)}" height="${n(fs * 1.3)}" fill="#1a1a1a"/>`);
    text.push(`<text x="${n(px + m + fs * 0.9)}" y="${n(y)}" font-family="${font}" font-weight="700" font-size="${n(fs * 1.25)}" fill="#1a1a1a">${sec}．${esc(POSTER_LINES[(sec * 3) % POSTER_LINES.length].slice(0, 8))}について</text>`);
    y += lh * 1.35;
    const rows = 4 + Math.floor(r() * 4);
    for (let k = 0; k < rows && y < py + ph - m - fs * 3; k++) {
      const base = POSTER_LINES[Math.floor(r() * POSTER_LINES.length)];
      const s = (k === 0 ? "・" : "　") + (base + base).slice(Math.floor(r() * 6), Math.floor(r() * 6) + maxChars - 2);
      text.push(`<text x="${n(px + m + fs * 0.9)}" y="${n(y)}" font-family="${font}" font-size="${n(fs)}" fill="#222">${esc(s)}</text>`);
      y += lh;
    }
    // ところどころに小さな表
    if (sec % 3 === 2 && y < py + ph - m - fs * 9) {
      const tw = pw - 2 * m - fs * 1.8;
      const tx = px + m + fs * 0.9;
      const cols = [0, 0.28, 0.62, 1];
      for (let i = 0; i < 4; i++) text.push(`<line x1="${n(tx)}" y1="${n(y + i * lh * 1.2 - fs)}" x2="${n(tx + tw)}" y2="${n(y + i * lh * 1.2 - fs)}" stroke="#444" stroke-width="1.2"/>`);
      for (const c of cols) text.push(`<line x1="${n(tx + c * tw)}" y1="${n(y - fs)}" x2="${n(tx + c * tw)}" y2="${n(y + 3 * lh * 1.2 - fs)}" stroke="#444" stroke-width="1.2"/>`);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          text.push(`<text x="${n(tx + cols[j] * tw + fs * 0.4)}" y="${n(y + i * lh * 1.2 - fs * 0.05)}" font-family="${font}" font-size="${n(fs * 0.9)}" fill="#222">${esc(POSTER_LINES[(i * 3 + j + sec) % POSTER_LINES.length].slice(j * 3, j * 3 + Math.floor((cols[j + 1] - cols[j]) * maxChars) - 1))}</text>`);
      y += 3 * lh * 1.2 + fs * 0.6;
    }
    y += lh * 0.6;
    sec++;
  }
  // 注意の三角を 2 つ
  const tri = (cx: number, cy: number, s: number) =>
    `<path d="M${n(cx)} ${n(cy - s)} L${n(cx + s * 1.1)} ${n(cy + s * 0.8)} L${n(cx - s * 1.1)} ${n(cy + s * 0.8)} Z" fill="#f9c80e" stroke="#1a1a1a" stroke-width="${n(s * 0.12)}" stroke-linejoin="round"/>` +
    `<rect x="${n(cx - s * 0.09)}" y="${n(cy - s * 0.45)}" width="${n(s * 0.18)}" height="${n(s * 0.7)}" fill="#1a1a1a"/><circle cx="${n(cx)}" cy="${n(cy + s * 0.48)}" r="${n(s * 0.1)}" fill="#1a1a1a"/>`;
  const pin = (x: number, yy: number) => `<circle cx="${n(x)}" cy="${n(yy)}" r="9" fill="#2e5fa8"/><circle cx="${n(x - 2.5)}" cy="${n(yy - 2.5)}" r="3" fill="#8fb0e0"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<defs><filter id="blur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${blur}"/></filter>`,
    `<filter id="shadow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="10"/></filter></defs>`,
    // 壁（薄いグレーの板と目地）
    `<g data-part="wall"><rect width="${W}" height="${H}" fill="#d9d6d0"/>`,
    ...Array.from({ length: 6 }, (_, i) => `<line x1="0" y1="${n((H / 6) * i)}" x2="${W}" y2="${n((H / 6) * i)}" stroke="#cbc7c0" stroke-width="2"/>`),
    `</g>`,
    `<rect x="${n(px + 8)}" y="${n(py + 12)}" width="${n(pw)}" height="${n(ph)}" fill="#000" opacity="0.25" filter="url(#shadow)"/>`,
    `<rect data-part="paper" x="${n(px)}" y="${n(py)}" width="${n(pw)}" height="${n(ph)}" fill="#fbfaf6" stroke="#bbb" stroke-width="1"/>`,
    `<g data-part="poster-text" filter="url(#blur)">`,
    ...text,
    tri(px + m + pw * 0.07, py + m + pw * 0.06, pw * 0.035),
    tri(px + pw - m - pw * 0.07, py + m + pw * 0.06, pw * 0.035),
    `</g>`,
    pin(px + 22, py + 22),
    pin(px + pw - 22, py + 22),
    pin(px + 22, py + ph - 22),
    pin(px + pw - 22, py + ph - 22),
    // 「イメージ」（ぼかさない）
    `<g data-part="image-label"><rect x="${n(W - 230)}" y="${n(H - 92)}" width="190" height="56" rx="8" fill="#000" opacity="0.6"/>`,
    `<text x="${n(W - 135)}" y="${n(H - 52)}" font-family="${font}" font-weight="700" font-size="30" fill="#fff" text-anchor="middle">イメージ</text></g>`,
    `</svg>`,
  ].join("");
}

/** ぎざぎざの焦げ跡（種から決まる） */
function scorch(r: () => number, cx: number, cy: number, rx: number, ry: number, k = 18) {
  const pts: string[] = [];
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2;
    const f = 0.62 + r() * 0.5;
    pts.push(`${n(cx + Math.cos(a) * rx * f)} ${n(cy + Math.sin(a) * ry * f)}`);
  }
  return `M${pts.join(" L")} Z`;
}

/** 事故で焼けた作業服のピクトグラム（768 の正方形）。黒とグレーだけ、文字なし */
export function burntJacketSvg(seed = "029-jacket"): string {
  const r = rng(seed);
  const S = 768;
  const lw = 7;
  // 作業服の上着（前から）。左右の袖・胴・えり・ファスナー・胸のポケット・反射の帯
  const body =
    "M276 170 L338 150 Q384 190 430 150 L492 170 L600 236 L664 470 L596 492 L548 330 L548 640 L220 640 L220 330 L172 492 L104 470 L168 236 Z";
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">`,
    `<defs><clipPath id="cloth"><path d="${body}"/></clipPath></defs>`,
    `<g data-part="bg"><rect width="${S}" height="${S}" fill="#ffffff"/></g>`,
    `<g data-part="jacket">`,
    `<path d="${body}" fill="#9a9a9a" stroke="#000" stroke-width="${lw}" stroke-linejoin="round"/>`,
    // えり
    `<path d="M338 150 L360 216 L384 186 L408 216 L430 150" fill="#8a8a8a" stroke="#000" stroke-width="${lw}" stroke-linejoin="round"/>`,
    // ファスナー
    `<line x1="384" y1="190" x2="384" y2="640" stroke="#000" stroke-width="${lw * 0.8}"/>`,
    // 胸のポケット
    `<rect x="250" y="270" width="96" height="78" fill="none" stroke="#000" stroke-width="${lw * 0.7}"/>`,
    `<rect x="422" y="270" width="96" height="78" fill="none" stroke="#000" stroke-width="${lw * 0.7}"/>`,
    // 反射の帯（明るいグレー）
    `<rect x="222" y="470" width="324" height="30" fill="#d8d8d8" stroke="#000" stroke-width="${lw * 0.5}"/>`,
    // 袖口
    `<line x1="104" y1="470" x2="172" y2="492" stroke="#000" stroke-width="${lw}"/><line x1="596" y1="492" x2="664" y2="470" stroke="#000" stroke-width="${lw}"/>`,
    `</g>`,
  ];
  // 焦げ跡: 右の袖から胸にかけてと、左の裾。外側は濃いグレー、中は黒に近いグレー、真ん中は焼けて穴（白に近いグレー）
  const burns: [number, number, number, number][] = [
    [536, 330, 118, 104],
    [600, 420, 56, 62],
    [282, 566, 70, 52],
  ];
  parts.push(`<g data-part="burn" clip-path="url(#cloth)">`);
  for (const [cx, cy, rx, ry] of burns) {
    parts.push(`<path d="${scorch(r, cx, cy, rx, ry)}" fill="#4a4a4a" stroke="#000" stroke-width="${lw * 0.6}" stroke-linejoin="round"/>`);
    parts.push(`<path d="${scorch(r, cx, cy, rx * 0.66, ry * 0.66, 14)}" fill="#262626"/>`);
  }
  parts.push(`</g>`);
  // 焦げ跡の上に服の縁をもう一度引く
  parts.push(`<path d="${body}" fill="none" stroke="#000" stroke-width="${lw}" stroke-linejoin="round"/>`);
  // 焼けて開いた穴（縁の線より上に描く）
  parts.push(`<path data-part="hole" d="${scorch(r, 540, 336, 46, 40, 12)}" fill="#e2e2e2" stroke="#000" stroke-width="${lw * 0.6}" stroke-linejoin="round"/>`);
  // 煙（グレーの曲線 3 本）
  parts.push(`<g data-part="smoke">`);
  for (const [x, h] of [
    [520, 120],
    [560, 150],
    [600, 110],
  ])
    parts.push(`<path d="M${x} ${222 - 10} q -22 ${-h * 0.25} 0 ${-h * 0.5} t 0 ${-h * 0.5}" fill="none" stroke="#7a7a7a" stroke-width="${lw * 0.9}" stroke-linecap="round"/>`);
  parts.push(`</g>`);
  parts.push(`<g data-part="border"><rect x="${lw / 2}" y="${lw / 2}" width="${S - lw}" height="${S - lw}" fill="none" stroke="#000" stroke-width="${lw}"/></g>`);
  parts.push(`</svg>`);
  return parts.join("");
}
