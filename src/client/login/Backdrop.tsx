// 入口の背景（11/5 作者）。正方形の顔のカードを ROWS 行に並べ、行ごとに右・左と交互に流してつなぎ目なく回す。
// カードは白い地に、線だけを色で描く（11/5 作者）。ときどきくるんと裏返り、裏には別の色・別の人が出る（表と裏は最初に全部決める。deal）。上に薄い黒の幕をかけ、その上に入口のフォームを置く。
// 動きを減らす設定の端末では、流れも裏返りも止める（CSS の prefers-reduced-motion）
import { useEffect, useMemo, useState } from "react";
import { useNeonFlicker } from "../neonFlick";
import { sideIn } from "./faces";
import { nearJobs, pickColor, resetGrid, setShown, setShownJob } from "./palette";

/** 画面の高さに収める行の数（作者「10 行くらい」） */
export const ROWS = 10;
/** 裏返る間隔（ミリ秒）の幅。カードごとに乱数で決める。
 * 11/7: 白い地を明るくし縁を光らせたら、回るカードが多く、早く見えた（作者）。3〜14 秒（平均 8.5 秒）から 12〜40 秒（平均 26 秒）にし、回る数を約 3 分の 1 にした */
const FLIP_MIN = 12000,
  FLIP_MAX = 40000;

interface Side {
  /** 線の色で焼いた PNG（焼き上がるまでは空。空の間は白い面だけ） */
  face: Promise<string>;
  color: string;
  /** 職業 */
  job: string;
}
interface Plan {
  front: Side;
  back: Side;
}

/**
 * 帯の全部のカードの表と裏を、最初に 1 回だけ決めて焼き始める（11/7 作者「円柱のように 1 本の帯にして、表と裏を全部先に作っておき、裏返すだけにする」）。
 * 前は帯を 2 回つないで流しているのに、後ろ半分が別のカードだったため、1 周して頭に戻るときにカードがいっせいに替わって見えた。
 * また裏返る直前に隠れた側を描き直していた。今は 1 本の帯（cols 枚）を 2 回並べ、裏返しても絵は描き直さない。
 * 色と職業は、隣（帯を輪につないだ左右 3 枚と上下の行の同じ位置）の表とも裏とも重ならないように配る。表と裏のどちらが見えていても隣と重ならない
 */
function deal(cols: number): Plan[][] {
  resetGrid(ROWS, cols);
  const near = (r: number, c: number) => {
    const out: [number, number][] = [];
    for (let d = -3; d <= 3; d++) if (d) out.push([r, (c + d + cols) % cols]);
    for (const rr of [r - 1, r + 1]) if (rr >= 0 && rr < ROWS) out.push([rr, c]);
    return out;
  };
  // 表を全部配る（palette.ts の表が隣の表を見る）
  const fronts: Side[][] = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const color = pickColor(r, c);
      setShown(r, c, color);
      const s = sideIn(color, nearJobs(r, c));
      setShownJob(r, c, s.job);
      return s;
    }),
  );
  // 裏を配る。隣の表は palette.ts の表から、隣の裏と自分の表は avoid で避ける
  const backs: Side[][] = Array.from({ length: ROWS }, () => []);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < cols; c++) {
      const nb = near(r, c)
        .map(([rr, cc]) => backs[rr]?.[cc])
        .filter((x): x is Side => !!x);
      const color = pickColor(r, c, [fronts[r][c].color, ...nb.map((x) => x.color)]);
      backs[r][c] = sideIn(color, [...nearJobs(r, c), fronts[r][c].job, ...nb.map((x) => x.job)]);
    }
  return fronts.map((row, r) => row.map((front, c) => ({ front, back: backs[r][c] })));
}

function Face({ side, back }: { side: Side; back?: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    side.face.then((u) => alive && setUrl(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [side]);
  return (
    <div className={`bd-side ${back ? "back" : "front"}`} style={{ borderColor: side.color, color: side.color }} data-job={side.job}>
      {url && <img src={url} alt="" draggable={false} />}
    </div>
  );
}

function Card({ plan, flipped }: { plan: Plan; flipped: boolean }) {
  return (
    <div className="bd-card">
      <div className={`bd-inner${flipped ? " flip" : ""}`}>
        <Face side={plan.front} />
        <Face side={plan.back} back />
      </div>
    </div>
  );
}

/** 1 行の帯。cols 枚を 2 回並べ、半分ぶん流れたら初めに戻す（前半と後半は同じカードなので、戻ってもつなぎ目が見えない）。裏返しは同じカードの 2 つの写しが一緒に回る */
function Row({ r, plans }: { r: number; plans: Plan[] }) {
  const [flipped, setFlipped] = useState<boolean[]>(() => plans.map(() => false));
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const next = (c: number) => {
      timers[c] = setTimeout(
        () => {
          setFlipped((f) => f.map((x, i) => (i === c ? !x : x)));
          next(c);
        },
        FLIP_MIN + Math.random() * (FLIP_MAX - FLIP_MIN),
      );
    };
    plans.forEach((_, c) => next(c));
    return () => timers.forEach(clearTimeout);
  }, [plans]);
  return (
    <div className={`bd-row ${r % 2 ? "left" : "right"}`} style={{ animationDuration: `${70 + ((r * 17) % 30)}s` }}>
      {[0, 1].flatMap((copy) => plans.map((p, c) => <Card key={`${copy}-${c}`} plan={p} flipped={!!flipped[c]} />))}
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
  // 帯の全部のカードの表と裏を、幅が変わって 1 行の枚数が変わったときだけ配り直す
  const plans = useMemo(() => deal(cols), [cols]);
  // 11/7: ログインしたあとの背景とそろえ、カードもときどきネオン管のように瞬かせる（選び方は neonFlick.ts）
  useNeonFlicker(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".bd-row")).flatMap((row, r) =>
      Array.from(row.querySelectorAll<HTMLElement>(".bd-card")).map((el) => ({ els: [el], row: r, rect: el.getBoundingClientRect() })),
    ),
  );
  return (
    <div className="bd" aria-hidden="true" style={{ ["--rows" as string]: ROWS }} data-testid="login-backdrop">
      {plans.map((row, r) => (
        <Row key={`${cols}-${r}`} r={r} plans={row} />
      ))}
      <div className="bd-dim" />
    </div>
  );
}
