// 描けない絵や、画面の中の思わぬ失敗で、画面全体が白くならないための守り。
// 保存のあとで確かめ方が厳しくなった古いカードは、renderFrame が「数字が範囲の外」で投げる。読む側はここで受け止める。
import { Component, type ReactNode } from "react";
import { type Frame, renderFrame, SIZE } from "../shared/picto/scene";

/** 描けないコマの代わりに出す絵（灰色の四角と一言） */
const brokenSvg = (size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" data-broken="1"><rect width="${size}" height="${size}" fill="#eee"/><text x="${size / 2}" y="${size / 2}" text-anchor="middle" font-size="${Math.round(size / 18)}" fill="#555">この絵は描けない</text></svg>`;

/** コマを SVG にする。描けないときは投げずに、代わりの絵を返す */
export function frameSvg(frame: Frame | undefined, size = SIZE): string {
  if (!frame) return brokenSvg(size);
  try {
    return renderFrame(frame, size).svg;
  } catch (e) {
    console.warn("コマを描けない", e);
    return brokenSvg(size);
  }
}

/** 画面の中で投げられても、白くせずに一言と戻る道を出す。key を変えると、もう一度描き直す */
export class ScreenGuard extends Component<{ children: ReactNode; home?: string }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { err: e instanceof Error ? e.message : String(e) };
  }
  componentDidCatch(e: unknown) {
    console.error("画面を描けない", e);
  }
  render() {
    if (this.state.err === null) return this.props.children;
    return (
      <section className="err-screen" data-testid="screen-error">
        <p className="err">この画面を描けませんでした（{this.state.err}）</p>
        <button className="pick" onClick={() => this.setState({ err: null })} data-testid="screen-error-retry">
          もう一度描く
        </button>
        {this.props.home && (
          <a className="pick" href={this.props.home}>
            ホームに戻る
          </a>
        )}
      </section>
    );
  }
}
