// ① を自分で受ける画面（11/5 作者）。参加者が 1 人 1 台の iPad で、項目 A・B を 1 つずつ受ける。
// 組のとおりに、片方はカード、もう片方は元のページ（日本語の原文の画像）。「見る」で出して計り始め、「分かった」で止め、意味を書いて送る
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { getMaterial, getTrial, listResponses, type MaterialItem, postResponse, type ResponseRow, type Trial } from "./api";
import { Material } from "./Material";

export function SelfScreen({ tenant, id, participant }: { tenant: string; id: string; participant: string }) {
  const [trial, setTrial] = useState<Trial | null>(null);
  const [items, setItems] = useState<MaterialItem[] | null>(null);
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [start, setStart] = useState<number | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const t0 = useRef(0);
  const reload = useCallback(() => listResponses(tenant, id).then(setRows, (e: Error) => setErr(e.message)), [tenant, id]);
  useEffect(() => {
    getTrial(tenant, id).then(setTrial, (e: Error) => setErr(e.message));
    getMaterial(tenant, id, participant).then(setItems, (e: Error) => setErr(e.message));
    reload();
  }, [tenant, id, participant, reload]);

  if (err) return <p className="err">{err}</p>;
  if (!trial || !items) return <p>読み込み中…</p>;
  if (trial.design !== "cross") return <p className="err">この回は、1 人がカードと文を 1 つずつ受ける形（交差の回）ではない</p>;
  if (!trial.participants.includes(participant)) return <p className="err">この回の参加者ではない: {participant}</p>;
  const done = new Set(rows.filter((r) => r.participant === participant).map((r) => r.item));
  const cur = items.find((x) => !done.has(x.item));
  if (!cur)
    return (
      <p className="done" data-testid="self-done">
        おわりです。ありがとうございました
      </p>
    );

  const show = () => {
    t0.current = performance.now();
    setStart(t0.current);
  };
  const got = () => setMs(Math.round(performance.now() - t0.current));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (ms === null || !text.trim() || busy) return;
    setBusy(true);
    try {
      await postResponse(tenant, id, { participant, item: cur.item, ms, answer: text.trim() });
      setStart(null);
      setMs(null);
      setText("");
      await reload();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const n = items.findIndex((x) => x.item === cur.item) + 1;
  return (
    <form className="answer" onSubmit={submit} data-testid="self" data-item={cur.item}>
      <p className="who">
        {n} / {items.length}
      </p>
      {start === null ? (
        <button type="button" className="big" onClick={show} data-testid="self-show">
          見る
        </button>
      ) : (
        <>
          <Material shown={cur.shown} item={cur.item} tenant={tenant} content={cur} />
          {ms === null ? (
            <button type="button" className="big go" onClick={got} data-testid="self-got">
              分かった
            </button>
          ) : (
            <>
              <label>
                何をすればいいと思いますか
                <textarea value={text} disabled={busy} onChange={(e) => setText(e.target.value)} rows={4} data-testid="self-text" />
              </label>
              <button className="big" disabled={busy || !text.trim()} data-testid="self-submit">
                おくる
              </button>
            </>
          )}
        </>
      )}
    </form>
  );
}
