// ネオン管のようなピカピカ（11/7 作者）。入口の背景（login/Backdrop.tsx）とログインしたあとの背景（FlowBackdrop.tsx）で同じ選び方をする。
// - 2〜3 秒に 1 回、画面に見えているもののうち 4〜5 個に印（flick）を付け、CSS の動きで瞬かせ、終わったら外す
// - 同じ回に光らせる段は、間に 2 段以上あける（作者「同じ列で光らせない」）
// - 画面を 6 つの区画（横長は横 3×縦 2、縦長は横 2×縦 3）に分け、1 つの区画からは 1 個だけ（作者「片隅に固まらず、バランスよく」）
// - 動きを減らす設定のときはしない
import { useEffect } from "react";

export interface FlickCandidate {
  /** 瞬かせる要素（光の写しなど、組で動かすものも含める） */
  els: Element[];
  /** 段の番号 */
  row: number;
  /** 画面での位置 */
  rect: DOMRect;
}

/** 段の間（この数より近い段は、同じ回に選ばない） */
const ROW_GAP = 3;

/** 候補から n 個を、段と区画が重ならないように乱数で選ぶ */
export function pickSpread(items: FlickCandidate[], n: number, W = window.innerWidth, H = window.innerHeight): FlickCandidate[] {
  const [cols, rows] = W >= H ? [3, 2] : [2, 3];
  const cellOf = (b: DOMRect) => {
    const cx = (b.left + b.right) / 2;
    const cy = (b.top + b.bottom) / 2;
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return -1;
    return Math.floor((cy / H) * rows) * cols + Math.floor((cx / W) * cols);
  };
  const pool = items.map((x) => ({ x, cell: cellOf(x.rect) })).filter((p) => p.cell >= 0);
  const out: FlickCandidate[] = [];
  const cells = new Set<number>();
  while (out.length < n && pool.length) {
    const { x, cell } = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    if (cells.has(cell) || out.some((o) => Math.abs(o.row - x.row) < ROW_GAP)) continue;
    out.push(x);
    cells.add(cell);
  }
  return out;
}

/** 要素に flick を付け直し、動きが終わったら外す */
export function flick(el: Element) {
  el.classList.remove("flick");
  void el.getBoundingClientRect();
  el.classList.add("flick");
  el.addEventListener("animationend", () => el.classList.remove("flick"), { once: true });
}

/** 2〜3 秒に 1 回、候補を集めて 4〜5 個を瞬かせる */
export function useNeonFlicker(collect: () => FlickCandidate[]) {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    const tick = () => {
      for (const c of pickSpread(collect(), 4 + Math.floor(Math.random() * 2))) for (const el of c.els) flick(el);
      timer = window.setTimeout(tick, 2000 + Math.random() * 1000);
    };
    timer = window.setTimeout(tick, 1500);
    return () => window.clearTimeout(timer);
    // collect は描き直しのたびに変わるが、要素は毎回 DOM から集めるので、最初の 1 つで足りる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
