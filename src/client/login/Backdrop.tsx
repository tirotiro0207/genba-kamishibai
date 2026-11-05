// 入口の背景（11/5 作者）。正方形の顔のカードを ROWS 行に並べ、行ごとに右・左と交互に流してつなぎ目なく回す。
// カードは白い地に、線だけを色で描く（11/5 作者）。ときどきくるんと裏返り、裏には別の色・別の人が出る。上に薄い黒の幕をかけ、その上に入口のフォームを置く。
// 動きを減らす設定の端末では、流れも裏返りも止める（CSS の prefers-reduced-motion）
import { useEffect, useRef, useState } from "react";
import { randomSide } from "./faces";

/** 画面の高さに収める行の数（作者「10 行くらい」） */
export const ROWS = 10;
/** 裏返る間隔（ミリ秒）の幅。カードごとに乱数で決める */
const FLIP_MIN = 3000,
  FLIP_MAX = 14000;

interface Side {
  face: string;
  color: string;
}
const side = (): Side => randomSide();

function Card() {
  const [sides, setSides] = useState<[Side, Side]>(() => [side(), side()]);
  const [flipped, setFlipped] = useState(false);
  const flippedRef = useRef(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(
        () => {
          flippedRef.current = !flippedRef.current;
          setFlipped(flippedRef.current);
          // 見えなくなった側は、裏返り終わってから別の人に描き替える（次に回ったとき別のキャラクターになる）
          t = setTimeout(() => {
            setSides((s) =>
              flippedRef.current ? [side(), s[1]] : [s[0], side()],
            );
            next();
          }, 800);
        },
        FLIP_MIN + Math.random() * (FLIP_MAX - FLIP_MIN),
      );
    };
    next();
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="bd-card">
      <div className={`bd-inner${flipped ? " flip" : ""}`}>
        {sides.map((s, i) => (
          <div
            key={i}
            className={`bd-side ${i ? "back" : "front"}`}
            style={{ borderColor: s.color }}
          >
            <img src={s.face} alt="" draggable={false} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 画面の幅を埋めるのに要る 1 行のカードの数 */
function useCols() {
  const calc = () => Math.ceil(innerWidth / (innerHeight / ROWS)) + 1;
  const [cols, setCols] = useState(calc);
  useEffect(() => {
    const on = () => setCols(calc());
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return cols;
}

export function Backdrop() {
  const cols = useCols();
  return (
    <div
      className="bd"
      aria-hidden="true"
      style={{ ["--rows" as string]: ROWS }}
      data-testid="login-backdrop"
    >
      {Array.from({ length: ROWS }, (_, r) => (
        // 同じ並びを 2 回続けて、半分ぶん流れたら初めに戻す（つなぎ目が見えない）
        <div
          key={r}
          className={`bd-row ${r % 2 ? "left" : "right"}`}
          style={{ animationDuration: `${70 + ((r * 17) % 30)}s` }}
        >
          {Array.from({ length: cols * 2 }, (_, c) => (
            <Card key={c} />
          ))}
        </div>
      ))}
      <div className="bd-dim" />
    </div>
  );
}
