// ① 時間を計る画面。2 列で並行して計れる。「始める」で見せて計り始め、「分かった」で止めて保存する
import { useCallback, useEffect, useRef, useState } from "react";
import { type Assignment, getTrial, listResponses, nextShown, postResponse, type ResponseRow, type Trial } from "./api";
import { Material } from "./Material";

const fmt = (ms: number) => `${(ms / 1000).toFixed(1)} 秒`;

function Lane({ lane, tenant, trial, rows, reload }: { lane: number; tenant: string; trial: Trial; rows: ResponseRow[]; reload: () => void }) {
  const [pid, setPid] = useState(trial.participants[lane] ?? trial.participants[0]);
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [last, setLast] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const timer = useRef(0);
  const a = trial.assignments.find((x) => x.participant === pid) as Assignment;
  const shown = nextShown(a, "A", rows);

  useEffect(() => () => cancelAnimationFrame(timer.current), []);
  const tick = () => {
    setNow(performance.now());
    timer.current = requestAnimationFrame(tick);
  };
  const begin = () => {
    setErr("");
    setLast(null);
    const t = performance.now();
    setStart(t);
    setNow(t);
    timer.current = requestAnimationFrame(tick);
  };
  const stop = async () => {
    if (start === null) return;
    cancelAnimationFrame(timer.current);
    const ms = Math.round(performance.now() - start);
    setStart(null);
    setLast(ms);
    try {
      await postResponse(tenant, trial.id, { participant: pid, item: "A", ms });
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <section className="lane" data-testid={`lane-${lane}`}>
      <label>
        参加者
        <select value={pid} disabled={start !== null} onChange={(e) => setPid(e.target.value)} data-testid={`lane-${lane}-participant`}>
          {trial.participants.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      {shown === null ? (
        <p className="done">この参加者の項目 A は済み</p>
      ) : start === null ? (
        <>
          <p className="next">次に見せるもの: {shown === "card" ? "カード" : "文"}</p>
          <button className="big" onClick={begin} data-testid={`lane-${lane}-start`}>
            始める
          </button>
        </>
      ) : (
        <>
          <Material shown={shown} item="A" />
          <p className="clock" data-testid={`lane-${lane}-clock`}>
            {fmt(now - start)}
          </p>
          <button className="big go" onClick={stop} data-testid={`lane-${lane}-got`}>
            分かった
          </button>
        </>
      )}
      {last !== null && (
        <p className="saved" data-testid={`lane-${lane}-saved`}>
          保存した: {fmt(last)}
        </p>
      )}
      {err && <p className="err">{err}</p>}
    </section>
  );
}

export function TimeScreen({ tenant, id }: { tenant: string; id: string }) {
  const [trial, setTrial] = useState<Trial | null>(null);
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [err, setErr] = useState("");
  const reload = useCallback(() => {
    listResponses(tenant, id).then(setRows, (e: Error) => setErr(e.message));
  }, [tenant, id]);
  useEffect(() => {
    getTrial(tenant, id).then(setTrial, (e: Error) => setErr(e.message));
    reload();
  }, [tenant, id, reload]);
  if (err) return <p className="err">{err}</p>;
  if (!trial) return <p>読み込み中…</p>;
  return (
    <div className="lanes">
      {[0, 1].map((i) => (
        <Lane key={i} lane={i} tenant={tenant} trial={trial} rows={rows} reload={reload} />
      ))}
    </div>
  );
}
