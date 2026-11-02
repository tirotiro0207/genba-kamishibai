// ② 自由に答える画面。端末ごとに参加者を 1 人決め、同時に答えられる
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { getTrial, listResponses, nextShown, postResponse, type ResponseRow, type Trial } from "./api";
import { Material } from "./Material";

export function AnswerScreen({ tenant, id, participant }: { tenant: string; id: string; participant: string }) {
  const [trial, setTrial] = useState<Trial | null>(null);
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => listResponses(tenant, id).then(setRows, (e: Error) => setErr(e.message)), [tenant, id]);
  useEffect(() => {
    getTrial(tenant, id).then(setTrial, (e: Error) => setErr(e.message));
    reload();
  }, [tenant, id, reload]);

  if (err) return <p className="err">{err}</p>;
  if (!trial) return <p>読み込み中…</p>;
  const a = trial.assignments.find((x) => x.participant === participant);
  if (!a) return <p className="err">この回の参加者ではない: {participant}</p>;
  const shown = nextShown(a, "B", rows);
  if (shown === null)
    return (
      <p className="done" data-testid="answer-done">
        答えは全部済み。ありがとうございました
      </p>
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await postResponse(tenant, id, { participant, item: "B", answer: text.trim() });
      setText("");
      await reload();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="answer" onSubmit={submit}>
      <p className="who">参加者 {participant}</p>
      <Material shown={shown} item="B" />
      <label>
        何をすればいいと思いますか
        <textarea value={text} disabled={busy} onChange={(e) => setText(e.target.value)} rows={4} data-testid="answer-text" />
      </label>
      <button className="big" disabled={busy || !text.trim()} data-testid="answer-submit">
        答える
      </button>
    </form>
  );
}
