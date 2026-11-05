// 入口の背景（11/5 作者）。正方形の顔のカードを ROWS 行に並べ、行ごとに右・左と交互に流してつなぎ目なく回す。
// カードは白い地に、線だけを色で描く（11/5 作者）。ときどきくるんと裏返り、裏には別の色・別の人が出る。上に薄い黒の幕をかけ、その上に入口のフォームを置く。
// 動きを減らす設定の端末では、流れも裏返りも止める（CSS の prefers-reduced-motion）
import { useEffect, useMemo, useRef, useState } from "react";
import { sideIn } from "./faces";
import { pickColor, resetGrid, setShown } from "./palette";

/** 画面の高さに収める行の数（作者「10 行くらい」） */
export const ROWS = 10;
/** 裏返る間隔（ミリ秒）の幅。カードごとに乱数で決める */
const FLIP_MIN = 3000,
  FLIP_MAX = 14000;

interface Side {
  /** 線の色で焼いた PNG（焼き上がるまでは空。空の間は白い面だけ） */
  face: string;
  color: string;
}
/** 片面を作り、マスクが焼き上がったら渡す */
async function makeSide(color: string): Promise<Side> {
  const s = sideIn(color);
  return { face: await s.face, color };
}

function Card({ r, c }: { r: number; c: number }) {
  const [sides, setSides] = useState<[Side, Side]>(() => {
    const color = pickColor(r, c);
    setShown(r, c, color);
    return [{ face: "", color }, { face: "", color }];
  });
  const [flipped, setFlipped] = useState(false);
  const flippedRef = useRef(false);
  const sidesRef = useRef(sides);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    let alive = true;
    const put = (ns: [Side, Side]) => {
      sidesRef.current = ns;
      setSides(ns);
    };
    // 表の絵は焼き上がりしだい出す
    makeSide(sidesRef.current[0].color).then((f) => alive && put([f, sidesRef.current[1]]));
    const next = () => {
      t = setTimeout(
        async () => {
          // 裏返る直前に、そのときの隣（左右 3 枚と上下の行）を見て色を決め、隠れた側を別の人に描き直す。
          // 前もって決めておくと、待つ間に隣が同じ色へ裏返ってしまう（11/5 の測りで、20 秒で隣同士が 13 か所そろった）
          const showing = flippedRef.current ? 1 : 0;
          const color = pickColor(r, c, [sidesRef.current[showing].color]);
          setShown(r, c, color);
          const fresh = await makeSide(color);
          if (!alive) return;
          const s = sidesRef.current;
          put(showing ? [fresh, s[1]] : [s[0], fresh]);
          // 描き直した絵が入ってから回す
          t = setTimeout(() => {
            flippedRef.current = !flippedRef.current;
            setFlipped(flippedRef.current);
            next();
          }, 60);
        },
        FLIP_MIN + Math.random() * (FLIP_MAX - FLIP_MIN),
      );
    };
    next();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);
  return (
    <div className="bd-card">
      <div className={`bd-inner${flipped ? " flip" : ""}`}>
        {sides.map((s, i) => (
          <div key={i} className={`bd-side ${i ? "back" : "front"}`} style={{ borderColor: s.color }}>
            {s.face && <img src={s.face} alt="" draggable={false} />}
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
  // 行ごとの今見えている色の表を、カードを配る前に作り直す（幅が変わって 1 行の枚数が変わったときも）
  useMemo(() => resetGrid(ROWS, cols * 2), [cols]);
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
            <Card key={`${cols}-${c}`} r={r} c={c} />
          ))}
        </div>
      ))}
      <div className="bd-dim" />
    </div>
  );
}
