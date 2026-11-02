// 紙芝居の切り替え（076a・仕様 §3b）。k が変わると、今の画面の写しが紙芝居の絵を抜くようにスッと横へ動き、下から次の画面が出る。
// 戻るときは、前の画面が横から差し込まれる。動きは 0.35 秒で、写しは押せない（下の画面はすぐ操作できる）。
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
  private run = 0;

  getSnapshotBeforeUpdate(prev: Props): HTMLElement | null {
    if (prev.k === this.props.k || reducedMotion() || !this.box.current) return null;
    return copyOf(this.box.current);
  }

  componentDidUpdate(_: Props, __: unknown, snap: HTMLElement | null) {
    const layer = this.layer.current;
    const box = this.box.current;
    if (!snap || !layer || !box) return;
    layer.replaceChildren();
    const run = ++this.run;
    const back = (this.props.dir ?? 1) < 0;
    // 進む: 古い画面の写しを上に置いて抜く。戻る: 新しい画面の写しを横から差し込み、終わったら本物を見せる
    const piece = back ? copyOf(box) : snap;
    piece.className = `slide-piece ${back ? "slide-in" : "slide-out"}`;
    piece.style.animationDuration = `${SLIDE_MS}ms`;
    if (back) {
      // 差し込む間は、本物の上に前の画面の写しを敷き、その上へ差し込む
      snap.className = "slide-piece slide-under";
      layer.appendChild(snap);
    }
    layer.appendChild(piece);
    layer.dataset.moving = back ? "in" : "out";
    // 続けて押したときは、前の動きの後片付けで今の動きを消さない
    const done = () => {
      if (run !== this.run) return;
      layer.replaceChildren();
      delete layer.dataset.moving;
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
