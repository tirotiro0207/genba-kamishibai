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
import { useNeonFlicker } from "./neonFlick";

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
  // 画面に見えている単語（光の字と組で動く）を候補にして、ネオン管のように瞬かせる（選び方は neonFlick.ts）
  useNeonFlicker(() => {
    const root = svg.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<SVGTSpanElement>("text.flow-bd-text tspan[data-w]")).flatMap((t) => {
      const row = t.closest<SVGGElement>("g[data-r]");
      if (!row) return [];
      const i = (t.parentElement as unknown as SVGTextElement).dataset.i;
      const glow = row.querySelector(`text.flow-bd-glow[data-i="${i}"] tspan[data-w="${t.dataset.w}"]`);
      return [{ els: glow ? [t, glow] : [t], row: Number(row.dataset.r), rect: t.getBoundingClientRect() }];
    });
  });
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
