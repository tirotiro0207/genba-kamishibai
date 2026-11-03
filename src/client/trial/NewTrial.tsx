// 回を作る画面。参加者の ID を並べ、種は空なら自動で決まる
import { type FormEvent, useState } from "react";
import { createTrial, type Trial } from "./api";

export function NewTrial({ tenant }: { tenant: string }) {
  const [ids, setIds] = useState("");
  const [seed, setSeed] = useState("");
  const [made, setMade] = useState<Trial | null>(null);
  const [err, setErr] = useState("");
  const list = ids.split(/[\s,、]+/).filter(Boolean);
  const dup = list.length !== new Set(list).size;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      setMade(await createTrial(tenant, list, seed.trim()));
    } catch (e2) {
      // サーバーの入力の検査のことば（participants は…）はそのまま出さない（総点検の 4）
      const m = (e2 as Error).message;
      setErr(m.startsWith("participants") ? "参加者の ID を、重ならないように 1〜200 人まで並べてください" : m);
    }
  };
  return (
    <form className="answer" onSubmit={submit}>
      <label>
        参加者の ID（空白か読点で区切る）
        <textarea value={ids} onChange={(e) => setIds(e.target.value)} rows={3} data-testid="new-ids" />
      </label>
      <label>
        種（空なら自動）
        <input value={seed} onChange={(e) => setSeed(e.target.value)} data-testid="new-seed" />
      </label>
      {/* 参加者の ID が空か重なっていれば押せない（総点検の 4） */}
      <button className="big" disabled={!list.length || dup} data-testid="new-submit">
        回を作る
      </button>
      {!list.length && <p className="hint">参加者の ID を 1 つ以上書くと、回を作れます</p>}
      {dup && <p className="err">同じ参加者の ID が 2 回あります</p>}
      {err && <p className="err">{err}</p>}
      {made && (
        <div data-testid="new-made">
          <p>種: {made.seed}</p>
          <p>
            <a href={`#/t/${tenant}/trial/${made.id}/time`} data-testid="new-time-link">
              ① 時間を計る
            </a>
          </p>
          <ul>
            {made.participants.map((p) => (
              <li key={p}>
                <a href={`#/t/${tenant}/trial/${made.id}/answer/${encodeURIComponent(p)}`}>② {p} が答える</a>
              </li>
            ))}
          </ul>
          <p>
            <a href={`#/t/${tenant}/trial/${made.id}/forecast`} data-testid="new-forecast-link">
              教育担当の勘（絵だけの 8 枚を選んで、答えの前に書く）
            </a>
          </p>
          <ul>
            {made.participants.map((p) => (
              <li key={p}>
                <a href={`#/t/${tenant}/trial/${made.id}/pictures/${encodeURIComponent(p)}`}>絵だけ: {p} が答える</a>
              </li>
            ))}
          </ul>
          <p>
            <a href={`#/t/${tenant}/trial/${made.id}/grade/g1`}>③ 採点者 1</a> ・ <a href={`#/t/${tenant}/trial/${made.id}/grade/g2`}>③ 採点者 2</a>
          </p>
        </div>
      )}
    </form>
  );
}
