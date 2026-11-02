// 回を作る画面。参加者の ID を並べ、種は空なら自動で決まる
import { type FormEvent, useState } from "react";
import { createTrial, type Trial } from "./api";

export function NewTrial({ tenant }: { tenant: string }) {
  const [ids, setIds] = useState("");
  const [seed, setSeed] = useState("");
  const [made, setMade] = useState<Trial | null>(null);
  const [err, setErr] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      setMade(await createTrial(tenant, ids.split(/[\s,、]+/).filter(Boolean), seed.trim()));
    } catch (e2) {
      setErr((e2 as Error).message);
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
      <button className="big" data-testid="new-submit">
        回を作る
      </button>
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
            <a href={`#/t/${tenant}/trial/${made.id}/grade/g1`}>③ 採点者 1</a> ・ <a href={`#/t/${tenant}/trial/${made.id}/grade/g2`}>③ 採点者 2</a>
          </p>
        </div>
      )}
    </form>
  );
}
