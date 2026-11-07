// 小物 1 つの見本の絵（11/7 アセットのタブ）。元の絵と差し替えの絵を同じ大きさ・同じ置き方で描き、前と後を並べられるようにする。
// Claude に渡す元の絵も、ここで 0〜100 の正方形の形にする
import { setPropOverrides, propOverrideKinds, propOverride } from "./prop-override";
import { BUBBLES, ON_FLOOR, PROP_KINDS, type PropKind, propsSvg } from "./props";

/** 場面の中でしか形にならない物（吹き出し・天井まで届く綱・床の端）は、アセットとして一覧に出さない */
const SKIP = new Set<string>(["anchor_line", "edge"]);
export const ASSET_KINDS: PropKind[] = PROP_KINDS.filter((k) => !BUBBLES.has(k) && !SKIP.has(k));
export const isAssetKind = (k: unknown): k is PropKind => typeof k === "string" && (ASSET_KINDS as string[]).includes(k);

const CANVAS = 200;
const at = (kind: PropKind) => (ON_FLOOR.has(kind) ? { x: 0.5, y: 0.75 } : { x: 0.5, y: 0.5 });

/** 登録をいったん差し替えて描き、元に戻す（描くのは同期なので、ほかの描き方と混ざらない） */
function withOverride<T>(kind: PropKind, swap: string | null, f: () => T): T {
  const saved = new Map(propOverrideKinds().map((k) => [k, propOverride(k)!]));
  const next = new Map(saved);
  if (swap === null) next.delete(kind);
  else next.set(kind, swap);
  setPropOverrides(next);
  try {
    return f();
  } finally {
    setPropOverrides(saved);
  }
}

/**
 * 見本の SVG（160×160 の枠）。swap が undefined なら今の登録のまま、null なら元の絵、文字ならその差し替えの絵で描く
 */
export function propPreviewSvg(kind: PropKind, swap?: string | null): string {
  const draw = () => propsSvg([{ kind, at: at(kind), size: 0.5 }], [], CANVAS);
  const body = swap === undefined ? draw() : withOverride(kind, swap, draw);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 20 160 160" width="160" height="160">${body}</svg>`;
}

/** Claude に見せる元の絵: 0〜100 の正方形に置き直した SVG（差し替えと同じ座標） */
export function propBaseSquareSvg(kind: PropKind): string {
  const body = withOverride(kind, null, () => propsSvg([{ kind, at: at(kind), size: 0.5 }], [], CANVAS));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g transform="translate(-50 -50)">${body}</g></svg>`;
}

export const floorProp = (kind: PropKind) => ON_FLOOR.has(kind);
