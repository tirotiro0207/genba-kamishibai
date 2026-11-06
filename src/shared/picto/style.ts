// 絵柄の決まりの検査（014）。正式な絵の SVG がピクトグラムの決まり（計画 1b）を守っているかを見る。
//
// - 色は黒とグレー（R=G=B）だけ。例外は、禁止の赤（data-part="prohibit" の中）と、
//   新人の白いヘルメット（data-part="helmet-new" の中）と、背景・吹き出しの中の白（data-part="bg" / "bubble" の中）
// - 絵の面に文字を置かない（text・tspan・foreignObject・image を使わない）。「？」「✓」は線と点の図形で描く
// - 色だけで強調しない: 赤と白を例外の外で使うと落ちる。強調は線の太さ・大きさ・明暗・枠で出す
//
// data-part は SVG の中だけの印で、確かめる AI に渡す PNG には残らない（006b）。

export const RED_PARTS = new Set(["prohibit"]);
export const WHITE_PARTS = new Set(["helmet-new", "bg", "bubble", "figure"]);

const FORBIDDEN_TAGS = ["text", "tspan", "textPath", "foreignObject", "image", "font", "glyph"];
const NAMED: Record<string, string> = { black: "#000000", white: "#ffffff", gray: "#808080", grey: "#808080", red: "#ff0000" };

/** 色の文字列を #rrggbb にする。none・transparent・currentColor は null */
export function normColor(v: string): string | null {
  const s = v.trim().toLowerCase();
  if (s === "none" || s === "transparent" || s === "") return null;
  if (NAMED[s]) return NAMED[s];
  let m = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  m = s.match(/^#([0-9a-f]{6})$/);
  if (m) return `#${m[1]}`;
  m = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (m) return `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("")}`;
  return `?${s}`; // 読めない色（url(#grad) なども含む）
}

const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export const isGray = (c: string) => {
  const [r, g, b] = rgb(c);
  return r === g && g === b && c !== "#ffffff";
};
export const isWhite = (c: string) => c === "#ffffff";
/** 禁止の赤: 赤みが強く、緑と青が低い */
export const isRed = (c: string) => {
  const [r, g, b] = rgb(c);
  return r >= 160 && g <= 80 && b <= 80;
};

/**
 * 決まりに合わないところの一覧（空なら通る）。
 * 本体の作る流れ（maker.ts・worker）では呼ばない: 確かめる AI に渡す前の門ではなく、絵柄の決まりは描く側の作り（色と線の決まった部品）で守る。
 * これはテストと scripts で、描く側が決まりを破っていないかを確かめる道具
 */
export function checkStyle(svg: string): string[] {
  const errs: string[] = [];
  const parts: (string | null)[] = []; // 開いている要素ごとの data-part
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  // 要素の外の文字（タグの間の文字）も文字として断る
  const outside = svg.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, "").trim();
  if (outside) errs.push(`絵の面に文字: ${outside.slice(0, 20)}`);
  while ((m = tagRe.exec(svg))) {
    const [, close, tag, attrs, selfClose] = m;
    if (close) {
      parts.pop();
      continue;
    }
    if (FORBIDDEN_TAGS.includes(tag)) errs.push(`使えない要素 <${tag}>`);
    const part = attrs.match(/\sdata-part="([^"]*)"/)?.[1] ?? null;
    const inside = new Set([...parts, part].filter((p): p is string => !!p));
    const colors: string[] = [];
    for (const a of attrs.matchAll(/\s(fill|stroke|stop-color|color)="([^"]*)"/g)) colors.push(a[2]);
    const style = attrs.match(/\sstyle="([^"]*)"/)?.[1];
    if (style) for (const a of style.matchAll(/(fill|stroke|stop-color|color)\s*:\s*([^;]+)/g)) colors.push(a[2]);
    for (const raw of colors) {
      const c = normColor(raw);
      if (c === null || c === "#000000" || (c.startsWith("#") && isGray(c))) continue;
      if (c.startsWith("?")) errs.push(`読めない色 ${raw}（<${tag}>）`);
      else if (isWhite(c)) {
        if (![...inside].some((p) => WHITE_PARTS.has(p))) errs.push(`白は新人のヘルメット・背景・吹き出しの中だけ（<${tag}>）`);
      } else if (isRed(c)) {
        if (![...inside].some((p) => RED_PARTS.has(p))) errs.push(`赤は禁止の印の中だけ（<${tag}>）`);
      } else errs.push(`黒・グレー以外の色 ${raw}（<${tag}>）`);
    }
    if (!selfClose) parts.push(part);
  }
  return errs;
}
