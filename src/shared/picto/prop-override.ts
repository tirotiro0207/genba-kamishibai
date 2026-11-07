// 小物の差し替え（11/7 作者「アセットをプロンプトで直す・画像を添付して直す」）。
// テナントごとに、作者か監修者が決めた小物の絵（SVG）を登録しておくと、カードの絵を描くとき（propsSvg）に元の絵の代わりに使う。
// 差し替えの絵は 0〜100 の正方形の中に描く。床に置く小物は正方形の下の真ん中が置き場所、ほかは真ん中が置き場所。
// Claude が作った SVG をそのまま画面に入れないように、使ってよい要素と属性だけを残す（sanitizePropSvg）。
// このファイルは props.ts を読み込まない（props.ts から読まれるので、輪にしない）

/** 差し替えの登録: 小物の種類 → 0〜100 の正方形の中の SVG の中身（<svg> の外枠は除いたもの） */
const overrides = new Map<string, string>();

/** テナントに入ったときに、そのテナントで決めた差し替えを全部入れ直す（前のテナントの分は消える） */
export function setPropOverrides(map: Record<string, string> | Map<string, string>) {
  overrides.clear();
  for (const [k, v] of map instanceof Map ? map : Object.entries(map)) if (v) overrides.set(k, v);
}
export const clearPropOverrides = () => overrides.clear();
export const propOverride = (kind: string): string | undefined => overrides.get(kind);
export const propOverrideKinds = () => [...overrides.keys()];

const TAGS = new Set(["g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
const ATTRS = new Set([
  "d", "x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "points", "transform",
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-miterlimit",
  "fill-rule", "opacity", "fill-opacity", "stroke-opacity",
]);
/** 属性の値に使ってよい字（数・色・パスの命令・変形）。url( や javascript: のような物は入らない */
const VALUE_RE = /^[#\w\s.,()+-]*$/;
const MAX_LEN = 60_000;

/**
 * 差し替えの SVG を、使ってよい要素と属性だけに絞る。<svg> の外枠・文字・<script>・<image>・<foreignObject>・
 * イベントの属性・url( を含む値は全部落とす。中身が何も残らなければ空の文字を返す
 */
export function sanitizePropSvg(svg: string): string {
  const src = svg.slice(0, MAX_LEN).replace(/<!--[\s\S]*?-->/g, "");
  const out: string[] = [];
  const open: string[] = [];
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  // 外した要素（使えない要素）の中身は丸ごと捨てる
  let skipDepth = 0;
  while ((m = tagRe.exec(src))) {
    const [, close, rawTag, attrs, self] = m;
    const tag = rawTag.toLowerCase();
    if (tag === "svg") continue;
    const ok = TAGS.has(tag);
    if (close) {
      if (!ok) {
        if (skipDepth > 0) skipDepth--;
        continue;
      }
      if (skipDepth === 0 && open[open.length - 1] === tag) {
        open.pop();
        out.push(`</${tag}>`);
      }
      continue;
    }
    if (!ok) {
      if (!self) skipDepth++;
      continue;
    }
    if (skipDepth > 0) continue;
    const kept: string[] = [];
    for (const a of attrs.matchAll(/([a-zA-Z][\w:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      const name = a[1].toLowerCase();
      const value = a[3] ?? a[4] ?? "";
      if (!ATTRS.has(name) || !VALUE_RE.test(value) || /url\s*\(|expression|javascript/i.test(value)) continue;
      kept.push(`${name}="${value}"`);
    }
    const head = `<${tag}${kept.length ? ` ${kept.join(" ")}` : ""}`;
    if (self) out.push(`${head}/>`);
    else {
      out.push(`${head}>`);
      open.push(tag);
    }
  }
  while (open.length) out.push(`</${open.pop()}>`);
  const body = out.join("");
  return /<(path|rect|circle|ellipse|line|polyline|polygon)\b/.test(body) ? body : "";
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * 差し替えの絵を、置き場所 c（px）・大きさ s（px）・向き d に置く。floor なら c が正方形の下の真ん中。
 * 向きが逆（d < 0）なら左右を返す
 */
export function placeOverride(body: string, [cx, cy]: [number, number], s: number, d: number, floor: boolean): string {
  const top = floor ? cy - s : cy - s / 2;
  return `<g transform="translate(${r2(cx)} ${r2(top)}) scale(${((d < 0 ? -1 : 1) * s / 100).toFixed(4)} ${(s / 100).toFixed(4)}) translate(-50 0)">${body}</g>`;
}
