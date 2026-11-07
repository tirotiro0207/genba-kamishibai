// ログインしたあとの画面の背景（11/7 作者）。黒い地に、「Genba-Kamishibai v1.0」の縁取りの字を斜め 45 度の段にして流す。
// 入口の画面はカードが並んで色が多いのに、ログインしたあとは地が平らで急に地味になる。録画の大半はログインしたあとの画面なので、ここの見た目を入口に合わせる。
// - 字は SVG で描く（11/7 作者「SVG で表現したらもっとくっきり見える」）。HTML の字を傾けて動かすと、画面の合成で字がぼやけて見えた
// - 縁の色は入口のカードの線と同じ組（login/palette.ts の LINE_COLORS）から、字の並びごとに替える
// - 段ごとに流れる向きを交互にする（1 段目は右から左、2 段目は左から右…）。字が画面の対角を渡り切る秒は flowTune.ts の cross（作者が決めた 73 秒）で、段ごとに少しずらす
//   （段の半分の長さは対角より長いので、1 周の秒は対角との比で延ばす）
// - 段の中は同じ並びを 2 回つなぎ、半分動いたら頭に戻すので切れ目が出ない
// - 動きを減らす設定のときは止めて置くだけ（app.css）
// - 上に入口と同じ黒い膜をかぶせ、字が後ろで動いているように見せる
// - 2〜3 秒に 1 回、画面に見えている字のうち 4〜5 か所を、ネオン管のようにピカピカと瞬かせる（11/7 作者「電気工事のメッセージも込めて」）。
//   光らせるのは単語 1 つ（Genba・Kamishibai・v1.0 のどれか）。同じ回に光らせる段は、間に 2 段以上あける
//   React を描き直さず、選んだ字と光に印（flick）を付けて CSS の動きで瞬かせ、終わったら外す。動きを減らす設定のときはしない
// - 縁はネオンのように光らせる（11/7 作者）。縁の色の線をぼかした光を、字の下に敷く。光のにじみは flowTune.ts の glow
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flowTune, onFlowTune } from "./flowTune";
import { LINE_COLORS } from "./login/palette";

export const FLOW_TEXT = "Genba-Kamishibai v1.0";
const FONT = 46;
/** 段の高さ（字の大きさ＋段の間） */
const LINE = 72;

/** 段 r の i 番目の並びの縁の色。隣の段と同じ色が縦にそろわないよう、段ごとにずらす */
export const flowColor = (r: number, i: number) => LINE_COLORS[(r * 7 + i * 11) % LINE_COLORS.length];

/** 字を単語ごとに分けて描く。瞬かせるときは単語 1 つ（data-w）に印を付ける */
const Words = () => (
  <>
    <tspan data-w="0">Genba</tspan>-<tspan data-w="1">Kamishibai</tspan> <tspan data-w="2">v1.0</tspan>
  </>
);

const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });

export function FlowBackdrop() {
  const [size, setSize] = useState(viewport);
  // 字の並び 1 つの幅（描いてから測る。字の形は端末の字体で変わるため）
  const [pitch, setPitch] = useState(0);
  const probe = useRef<SVGTextElement>(null);
  // 字の間と速さ（flowTune.ts。字の間は字の大きさに対する比で、11/7 作者「今の空白の半分ぐらい」で 0.7）
  const [tune, setTune] = useState(flowTune);
  useEffect(() => onFlowTune(setTune), []);
  const [textW, setTextW] = useState(0);
  useLayoutEffect(() => {
    setTextW(probe.current?.getComputedTextLength() ?? 0);
  }, []);
  useEffect(() => {
    if (textW > 0) setPitch(textW + tune.gap * FONT);
  }, [textW, tune.gap]);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    const tick = () => {
      const root = svg.current;
      if (root) {
        // 画面の中に見えている単語（光の字と組で動く）から、4〜5 個を選ぶ。選んだ段の上下 2 段は、その回はもう選ばない
        // 光が画面の片隅に固まらないよう、画面を 6 つの区画（横長は横 3×縦 2、縦長は横 2×縦 3）に分け、1 つの区画からは 1 個だけ選ぶ（11/7 作者「バランスよく」）
        const W = window.innerWidth;
        const H = window.innerHeight;
        const [cols, rowsN] = W >= H ? [3, 2] : [2, 3];
        const cellOf = (b: DOMRect) => {
          const cx = (b.left + b.right) / 2;
          const cy = (b.top + b.bottom) / 2;
          if (cx < 0 || cy < 0 || cx >= W || cy >= H) return -1;
          return Math.floor((cy / H) * rowsN) * cols + Math.floor((cx / W) * cols);
        };
        const seen = Array.from(root.querySelectorAll<SVGTSpanElement>("text.flow-bd-text tspan[data-w]"))
          .map((t) => ({ t, cell: cellOf(t.getBoundingClientRect()) }))
          .filter((x) => x.cell >= 0);
        const n = 4 + Math.floor(Math.random() * 2);
        const used: number[] = [];
        const cells = new Set<number>();
        while (used.length < n && seen.length) {
          const { t, cell } = seen.splice(Math.floor(Math.random() * seen.length), 1)[0];
          const row = t.closest<SVGGElement>("g[data-r]");
          const r = Number(row?.dataset.r);
          if (!row || cells.has(cell) || used.some((u) => Math.abs(u - r) < 3)) continue;
          used.push(r);
          cells.add(cell);
          const i = (t.parentElement as unknown as SVGTextElement).dataset.i;
          const glow = row.querySelector(`text.flow-bd-glow[data-i="${i}"] tspan[data-w="${t.dataset.w}"]`);
          for (const el of [t, glow]) {
            if (!el) continue;
            el.classList.remove("flick");
            void el.getBoundingClientRect();
            el.classList.add("flick");
            el.addEventListener("animationend", () => el.classList.remove("flick"), { once: true });
          }
        }
      }
      timer = window.setTimeout(tick, 2000 + Math.random() * 1000);
    };
    timer = window.setTimeout(tick, 1500);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const on = () => setSize(viewport());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const diag = Math.hypot(size.w, size.h);
  const rows = Math.ceil(diag / LINE) + 2;
  // 1 段の半分（字の並びを perHalf 個）は、画面の対角より長くする。段は対角の左端から始め、半分動いても右端まで字が残るようにする
  // （11/7 作者「文字がなくなる瞬間をなくしてほしい」。前は段の真ん中から始めていて、動き終わりに右側が空いていた）
  const perHalf = pitch > 0 ? Math.ceil(diag / pitch) + 1 : 0;
  const half = pitch * perHalf;
  return (
    <div className="flow-bd" aria-hidden="true" data-testid="flow-backdrop">
      <svg ref={svg} className="flow-bd-svg" width={size.w} height={size.h}>
        <text ref={probe} className="flow-bd-text" x={-9999} y={-9999}>
          {FLOW_TEXT}
        </text>
        <defs>
          <filter id="flow-neon" x="-5%" y="-100%" width="110%" height="300%">
            <feGaussianBlur stdDeviation={tune.glow} />
          </filter>
        </defs>
        {pitch > 0 && (
          <g transform={`translate(${size.w / 2} ${size.h / 2}) rotate(-45)`}>
            {Array.from({ length: rows }, (_, r) => (
              <g key={r} transform={`translate(${-diag / 2} ${(r - rows / 2) * LINE})`}>
                <g data-r={r} className={`flow-bd-row ${r % 2 === 0 ? "to-left" : "to-right"}`} style={{ ["--shift" as string]: `${-half}px`, animationDuration: `${(half / diag) * tune.cross * (1 + (r % 3) * 0.15)}s` }}>
                  {tune.glow > 0 && (
                    <g filter="url(#flow-neon)">
                      {Array.from({ length: perHalf * 2 }, (_, i) => (
                        <text key={i} data-i={i} className="flow-bd-glow" x={i * pitch} stroke={flowColor(r, i % perHalf)}>
                          <Words />
                        </text>
                      ))}
                    </g>
                  )}
                  {Array.from({ length: perHalf * 2 }, (_, i) => (
                    <text key={i} data-i={i} className="flow-bd-text" x={i * pitch} stroke={flowColor(r, i % perHalf)}>
                      <Words />
                    </text>
                  ))}
                </g>
              </g>
            ))}
          </g>
        )}
      </svg>
      <div className="flow-bd-dim" />
    </div>
  );
}
