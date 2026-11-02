// 紙芝居の切り替え（076a・仕様 §3b）。k が変わると、今の画面の写しが紙芝居の絵を抜くようにスッと横へ動き、下から次の画面が出る。
// 戻るときは、前の画面が横から差し込まれる。動きは 0.35 秒で、写しは押せない（下の画面はすぐ操作できる）。
// 凝った部分（076b）: 抜くときは紙が少し持ち上がって影が濃くなり、引っかかってから速く抜ける（速さの緩急）。下の画面は影から明るくなる。
// 続けて押すと、前の紙が抜けきる前に次の紙が重なって動く。
// 端末の「動きを減らす」設定のときは動かさずに切り替える。
import { Component, createRef, type ReactNode, useEffect, useState } from "react";
import "./slide.css";

export const SLIDE_MS = 350;
const REDUCE = "(prefers-reduced-motion: reduce)";

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia(REDUCE).matches;

/** 「動きを減らす」設定を見て、変わったら追う */
export function useReducedMotion() {
  const [on, setOn] = useState(reducedMotion);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const q = matchMedia(REDUCE);
    const ch = () => setOn(q.matches);
    q.addEventListener("change", ch);
    return () => q.removeEventListener("change", ch);
  }, []);
  return on;
}

interface Props {
  /** 画面の名前。変わったときだけ動く */
  k: string;
  /** -1 は戻る（前の画面を差し込む）。ほかは進む（今の画面を抜く） */
  dir?: number;
  children: ReactNode;
}

/** 動く写しを作る。テストの印・id・入力を外し、読み上げと操作の対象から外す */
function copyOf(el: HTMLElement): HTMLElement {
  const c = el.cloneNode(true) as HTMLElement;
  for (const n of [c, ...Array.from(c.querySelectorAll<HTMLElement>("[data-testid],[id]"))]) {
    n.removeAttribute("data-testid");
    n.removeAttribute("id");
  }
  c.setAttribute("aria-hidden", "true");
  c.inert = true;
  return c;
}

export class Slide extends Component<Props> {
  private box = createRef<HTMLDivElement>();
  private layer = createRef<HTMLDivElement>();

  getSnapshotBeforeUpdate(prev: Props): HTMLElement | null {
    if (prev.k === this.props.k || reducedMotion() || !this.box.current) return null;
    return copyOf(this.box.current);
  }

  componentDidUpdate(_: Props, __: unknown, snap: HTMLElement | null) {
    const layer = this.layer.current;
    const box = this.box.current;
    if (!snap || !layer || !box) return;
    const back = (this.props.dir ?? 1) < 0;
    const kind = back ? "in" : "out";
    // 1 回の動きを 1 つの組にまとめる。続けて押すと組が重なり、前の紙が抜けきる前に次の紙が動く（076b）
    const group = document.createElement("div");
    group.className = "slide-run";
    group.dataset.kind = kind;
    const dim = document.createElement("i");
    dim.className = `slide-dim ${back ? "dim-in" : "dim-out"}`;
    // 進む: 古い画面の写しを上に置いて抜く。抜けた下の本物は少し影から明るくなり、わずかに沈んでから落ち着く
    // 戻る: 新しい画面の写しを横から差し込み、終わったら本物を見せる。下の前の画面は影に入る
    const piece = back ? copyOf(box) : snap;
    piece.className = `slide-piece ${back ? "slide-in" : "slide-out"}`;
    for (const el of [piece, dim]) el.style.animationDuration = `${SLIDE_MS}ms`;
    if (back) {
      snap.className = "slide-piece slide-under";
      for (const el of [snap, dim, piece]) group.appendChild(el);
    } else {
      for (const el of [dim, piece]) group.appendChild(el);
      box.animate?.([{ transform: "scale(0.985)" }, { transform: "none" }], { duration: SLIDE_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
    }
    layer.appendChild(group);
    layer.dataset.moving = kind;
    const done = () => {
      if (!group.isConnected) return;
      group.remove();
      // まだ動いている組が残っていれば、その向きを出す
      const last = layer.lastElementChild as HTMLElement | null;
      if (last) layer.dataset.moving = last.dataset.kind;
      else delete layer.dataset.moving;
    };
    piece.addEventListener("animationend", done, { once: true });
    // 画面が隠れていて動きが走らないときも残さない
    setTimeout(done, SLIDE_MS + 150);
  }

  render() {
    return (
      <div className="slide">
        <div ref={this.box} className="slide-box">
          {this.props.children}
        </div>
        <div ref={this.layer} className="slide-layer" data-testid="slide-layer" />
      </div>
    );
  }
}
