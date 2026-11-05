// 入口の背景のカードの線の色と、色の配り方（11/5 作者）。
// 色は 10 の系統 × 3 段（あざやか・濃い・くすみ）＝ 30 色で、どの系統も同じ数にした（ピンク・赤だけが多くならない）。
// 3 段の明るさと鮮やかさは、作者が渡したピンク（#E54197・#9F1960・#D66D87）に合わせ、ほかの系統は OKLCH で色相だけを回して作った。
// 作者が渡した色は、合う系統の段にそのまま入れた（入れなかったのは #CE1B6C・#D13F68。ピンク・赤の系統が 3 つを超えるため）。
// 11/5 の直し: 白い地で見づらい蛍光の色（#E1FB64・#D5DB37・#72E0EB・#89E1B9）と明るすぎる黄を外し、黄・黄緑・緑・青緑は明るさ 0.68 以下で作り直した。
// 配り方: 隣（左右 3 枚と上下の行の同じ位置）に同じ系統を置かない（薄いピンクと濃いピンクを並べない）。さらに色の距離（OKLab）が
// MIN_DIST より近い色も避ける（系統の境の赤とピンクなど）。同じ行で同じ系統がそろわないよう、その行でいちばん使われていない系統から選ぶ。
// 行は流れる速さが違うので、上下の重なりは配るときと裏返るときにしか見られない（流れたあとの上下は保てない）
export const FAMILIES: Record<string, readonly string[]> = {
  pink: ["#E54197", "#9F1960", "#D66D87"],
  red: ["#E2113B", "#A51E24", "#A16356"],
  orange: ["#C96805", "#8B4501", "#E4A466"],
  yellow: ["#B99305", "#816501", "#A68931"],
  yellowGreen: ["#7C9205", "#536304", "#788A37"],
  green: ["#059A46", "#00672D", "#50A064"],
  teal: ["#029393", "#036262", "#3B9D9D"],
  blue: ["#0083FC", "#0159AE", "#5894E0"],
  indigo: ["#7F6AFC", "#5644B4", "#8B85DE"],
  purple: ["#BE4ECF", "#6C1272", "#69396C"],
};
export const LINE_COLORS = Object.values(FAMILIES).flat();
const FAMILY_OF = new Map(Object.entries(FAMILIES).flatMap(([f, xs]) => xs.map((x) => [x, f] as const)));

/** 隣どうしで避ける色の近さ（OKLab の距離） */
export const MIN_DIST = 0.12;

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const LAB = new Map(LINE_COLORS.map((x) => [x, oklab(x)]));
/** 2 つの色の距離（OKLab） */
export function colorDist(x: string, y: string): number {
  const [a, b] = [LAB.get(x) ?? oklab(x), LAB.get(y) ?? oklab(y)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** 左右の何枚先まで同じ系統を避けるか */
const NEAR = 3;

/** 行 → 位置 → 今見えている色（無い所は空） */
const grid: string[][] = [];

export function resetGrid(rows: number, cols: number) {
  grid.length = 0;
  for (let r = 0; r < rows; r++) grid.push(Array.from({ length: cols }, () => ""));
}

export function setShown(r: number, c: number, color: string) {
  if (grid[r]) grid[r][c] = color;
}

const random = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/** (r, c) のカードに配る色。avoid はほかに避けたい色（同じカードの今見えている色） */
export function pickColor(r: number, c: number, avoid: string[] = []): string {
  const row = grid[r] ?? [];
  const n = row.length;
  const near = [...avoid];
  for (let d = -NEAR; d <= NEAR; d++) if (d && n && row[(c + d + n) % n]) near.push(row[(c + d + n) % n]);
  for (const rr of [r - 1, r + 1]) if (grid[rr]?.[c]) near.push(grid[rr][c]);
  const nearFam = new Set(near.map((x) => FAMILY_OF.get(x)));
  // その行の系統ごとの数と色ごとの数
  const famUsed = new Map<string, number>();
  const colUsed = new Map<string, number>();
  row.forEach((x, i) => {
    if (!x || i === c) return;
    famUsed.set(FAMILY_OF.get(x) ?? "", (famUsed.get(FAMILY_OF.get(x) ?? "") ?? 0) + 1);
    colUsed.set(x, (colUsed.get(x) ?? 0) + 1);
  });
  const far = (x: string) => near.every((y) => colorDist(x, y) >= MIN_DIST);
  // 系統も距離も守れる色 → 系統だけ守れる色 → 全部、の順に候補を広げる
  const tiers = [LINE_COLORS.filter((x) => !nearFam.has(FAMILY_OF.get(x)) && far(x)), LINE_COLORS.filter((x) => !nearFam.has(FAMILY_OF.get(x))), LINE_COLORS];
  const from = tiers.find((t) => t.length) ?? LINE_COLORS;
  // いちばん使われていない系統 → その中でいちばん使われていない色
  const famCount = (x: string) => famUsed.get(FAMILY_OF.get(x) ?? "") ?? 0;
  const fMin = Math.min(...from.map(famCount));
  const byFam = from.filter((x) => famCount(x) === fMin);
  const cMin = Math.min(...byFam.map((x) => colUsed.get(x) ?? 0));
  return random(byFam.filter((x) => (colUsed.get(x) ?? 0) === cMin));
}
