// 時計 2 つ（095）。① 分かるまでの時間を、カード（絵）と文で 2 つの時計に並べる。動画の転の終わりでは、この画面だけを映す。
// 2 つの針は同時に動き始め、それぞれ中央値の秒で止まる。#/t/<テナント>/trial/<回>/clocks は本物の答え、回が sample か答えが 0 件なら仮の数字。
// 交差の回は項目 A・B を行に分ける（理由は shared/clocks.ts の crossClockRows）
import { useEffect, useRef, useState } from "react";
import { dialPaint, FACE, formatSec } from "../../shared/clock-laps";
import { type ClockRow, clockTimes, crossClockRows, FAKE_CLOCKS, noAnswers } from "../../shared/clocks";
import { getSummary, listResponses } from "./api";
import "./clocks.css";

const R = 90;

function Dial({ label, ms, elapsed, testid }: { label: string; ms: number | null; elapsed: number; testid: string }) {
  const shown = ms === null ? 0 : Math.min(elapsed, ms);
  const done = ms !== null && elapsed >= ms;
  // 60 秒を超えたら周ごとに塗りを濃くする（色の並びは shared/clock-laps.ts の LAP_FILLS）
  const p = dialPaint(shown);
  return (
    <figure className="clock" data-testid={testid} data-ms={ms ?? ""} data-done={done} data-lap={p.lap}>
      <svg viewBox="-100 -100 200 200" role="img" aria-label={`${label} ${ms === null ? "まだ" : formatSec(ms)}`}>
        <circle r={R} className="clock-face" fill={FACE} />
        {/* 前の周は丸ごと 1 色、その上に今の周の扇。どちらも透かさない */}
        {p.lap > 1 && <circle r={R - 2} fill={p.under} data-testid={`${testid}-under`} />}
        {shown > 0 && <path d={arc(p.deg)} fill={p.sweep} data-testid={`${testid}-sweep`} />}
        {Array.from({ length: 60 }, (_, i) => (
          <line key={i} x1="0" y1={-R + (i % 5 ? 4 : 2)} x2="0" y2={-R + (i % 5 ? 9 : 16)} transform={`rotate(${i * 6})`} stroke={shown > 0 && i * 6 < p.deg ? p.tickOn : p.tickOff} className={i % 5 ? "clock-tick" : "clock-tick5"} />
        ))}
        <line x1="0" y1="10" x2="0" y2={-R + 14} transform={`rotate(${p.deg})`} stroke={p.hand} className="clock-hand" data-testid={`${testid}-hand`} />
        <circle r="5" fill={p.hand} />
      </svg>
      <figcaption>
        <span className="clock-label">{label}</span>
        <b className="clock-sec">{ms === null ? "—" : formatSec(shown)}</b>
        {p.lap > 1 && (
          <small className="clock-lap" data-testid={`${testid}-lap`}>
            {p.lap} 周目
          </small>
        )}
      </figcaption>
    </figure>
  );
}

/** 12 時から deg 度までの扇 */
function arc(deg: number) {
  const d = Math.min(deg, 359.9);
  const rad = ((d - 90) * Math.PI) / 180;
  const r = R - 2;
  return `M0 0 L0 ${-r} A${r} ${r} 0 ${d > 180 ? 1 : 0} 1 ${(r * Math.cos(rad)).toFixed(2)} ${(r * Math.sin(rad)).toFixed(2)} Z`;
}

interface View {
  rows: ClockRow[];
  /** 仮の数字なら true */
  fake: boolean;
}

// 仮の数字（FAKE_CLOCKS）を 1 行の画面にしたもの
const FAKE_VIEW: View = { rows: [{ item: "A", card: FAKE_CLOCKS.card, text: FAKE_CLOCKS.text }], fake: true };

/** 前からの回（順番の回）は今までどおり、答えの一覧から項目 A の中央値を出す */
async function orderView(tenant: string, id: string): Promise<View> {
  const c = clockTimes(await listResponses(tenant, id));
  return { rows: [{ item: "A", card: c.card, text: c.text }], fake: false };
}

// 交差の回は /summary の欄（まとめた数）から読む。答えが 0 件の回は仮の数字を出す。国籍ごとの数はこの画面には出さない
async function loadView(tenant: string, id: string): Promise<View> {
  if (id === "sample") return FAKE_VIEW;
  try {
    const s = await getSummary(tenant, id);
    return noAnswers(s.all) ? FAKE_VIEW : { rows: crossClockRows(s.all), fake: false };
  } catch (e) {
    // 前からの回は /summary が 400 を返す
    if ((e as { status?: number }).status === 400) return orderView(tenant, id);
    throw e;
  }
}

export function ClocksScreen({ tenant, id }: { tenant: string; id: string }) {
  const [c, setC] = useState<View | null>(id === "sample" ? FAKE_VIEW : null);
  const [err, setErr] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [run, setRun] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (id === "sample") return;
    loadView(tenant, id).then(setC, (e: Error) => setErr(e.message));
  }, [tenant, id]);
  // すべての針を同時に動かし始め、いちばん長いものが止まるまで回す
  useEffect(() => {
    if (!c) return;
    const end = Math.max(...c.rows.flatMap((r) => [r.card.median_ms ?? 0, r.text.median_ms ?? 0]));
    const t0 = performance.now();
    const tick = () => {
      const e = performance.now() - t0;
      setElapsed(e);
      if (e < end) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [c, run]);

  if (err) return <p className="err" role="alert">{err}</p>;
  if (!c) return null;
  // 答えが 0 件の回は針を動かす元の数が無い。0 件と出し、「もう一度」は押せなくする（総点検の 7）
  const empty = c.rows.every((r) => r.card.median_ms === null && r.text.median_ms === null);
  const multi = c.rows.length > 1;
  return (
    <section className={`clocks${multi ? " clocks-multi" : ""}`} data-testid="clocks" data-fake={c.fake}>
      <h1>分かるまでの時間</h1>
      {c.rows.map((r) => {
        // 1 行だけの画面は今までの名前、2 行のときは項目の名前を付ける
        const tid = (s: string) => (multi ? `clock-${r.item}-${s}` : `clock-${s}`);
        return (
          <div key={r.item} className="clocks-block" data-testid={multi ? `clocks-item-${r.item}` : undefined}>
            {multi && <h2 className="clocks-item">項目 {r.item}</h2>}
            <div className="clocks-row">
              <Dial label="カード" ms={r.card.median_ms} elapsed={elapsed} testid={tid("card")} />
              <Dial label="文" ms={r.text.median_ms} elapsed={elapsed} testid={tid("text")} />
            </div>
            <p className="clocks-note">真ん中の人の秒（カード {r.card.n} 人・文 {r.text.n} 人）</p>
          </div>
        );
      })}
      {c.fake && (
        <p className="clocks-note">
          <span className="clocks-fake" data-testid="clocks-fake">仮の数字（本物の結果を入れる前）</span>
        </p>
      )}
      {empty && (
        <p className="clocks-note" data-testid="clocks-empty">
          この回はまだ答えが 0 件なので、時計は動きません
        </p>
      )}
      <button type="button" className="clocks-again" disabled={empty} onClick={() => setRun((x) => x + 1)} data-testid="clocks-again">
        もう一度
      </button>
    </section>
  );
}
