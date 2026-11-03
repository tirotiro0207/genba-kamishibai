// 時計 2 つ（095）。① 分かるまでの時間を、カード（絵）と文で 2 つの時計に並べる。動画の転の終わりでは、この画面だけを映す。
// 2 つの針は同時に動き始め、それぞれ中央値の秒で止まる。#/t/<テナント>/trial/<回>/clocks は本物の答え、回が sample なら作りものの数。
import { useEffect, useRef, useState } from "react";
import { type Clocks, clockTimes, FAKE_CLOCKS } from "../../shared/clocks";
import { listResponses } from "./api";
import "./clocks.css";

const R = 90;

function Dial({ label, ms, elapsed, testid }: { label: string; ms: number | null; elapsed: number; testid: string }) {
  const shown = ms === null ? 0 : Math.min(elapsed, ms);
  const done = ms !== null && elapsed >= ms;
  const deg = (shown / 1000) * 6;
  return (
    <figure className="clock" data-testid={testid} data-ms={ms ?? ""} data-done={done}>
      <svg viewBox="-100 -100 200 200" role="img" aria-label={`${label} ${ms === null ? "まだ" : `${(ms / 1000).toFixed(1)} 秒`}`}>
        <circle r={R} className="clock-face" />
        {Array.from({ length: 60 }, (_, i) => (
          <line key={i} x1="0" y1={-R + (i % 5 ? 4 : 2)} x2="0" y2={-R + (i % 5 ? 9 : 16)} transform={`rotate(${i * 6})`} className={i % 5 ? "clock-tick" : "clock-tick5"} />
        ))}
        {/* 経った秒の扇 */}
        {shown > 0 && <path d={arc(deg)} className="clock-sweep" />}
        <line x1="0" y1="10" x2="0" y2={-R + 14} transform={`rotate(${deg})`} className="clock-hand" />
        <circle r="5" className="clock-pin" />
      </svg>
      <figcaption>
        <span className="clock-label">{label}</span>
        <b className="clock-sec">{ms === null ? "—" : `${(shown / 1000).toFixed(1)} 秒`}</b>
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

export function ClocksScreen({ tenant, id }: { tenant: string; id: string }) {
  const [c, setC] = useState<Clocks | null>(id === "sample" ? FAKE_CLOCKS : null);
  const [err, setErr] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [run, setRun] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (id === "sample") return;
    listResponses(tenant, id).then((rows) => setC(clockTimes(rows)), (e: Error) => setErr(e.message));
  }, [tenant, id]);
  // 2 つの針を同時に動かし始め、長いほうが止まるまで回す
  useEffect(() => {
    if (!c) return;
    const end = Math.max(c.card.median_ms ?? 0, c.text.median_ms ?? 0);
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
  const empty = c.card.median_ms === null && c.text.median_ms === null;
  return (
    <section className="clocks" data-testid="clocks" data-fake={c.fake}>
      <h1>分かるまでの時間</h1>
      <div className="clocks-row">
        <Dial label="カード" ms={c.card.median_ms} elapsed={elapsed} testid="clock-card" />
        <Dial label="文" ms={c.text.median_ms} elapsed={elapsed} testid="clock-text" />
      </div>
      <p className="clocks-note">
        真ん中の人の秒（カード {c.card.n} 人・文 {c.text.n} 人）
        {c.fake && <span className="clocks-fake" data-testid="clocks-fake">作りものの数（本物の結果を入れる前）</span>}
      </p>
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
