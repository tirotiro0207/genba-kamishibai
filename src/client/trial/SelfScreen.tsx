// ① を自分で受ける画面（11/5 作者）。参加者が 1 人 1 台の iPad で、項目 A・B を 1 つずつ受ける。
// 組のとおりに、片方はカード、もう片方は元のページ（日本語の原文の画像）。
// 会場の回線に左右されないように、2 問分の絵と画像を最初に全部読み込み、終わるまで「見る」を押せない。
// 時間は絵か画像が画面に出た時から「分かった」まで、端末の中の時計で数える。答えは端末の中に置いてから送り、届くまで送り直す
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { type AnswerFields, canSend, packAnswer } from "../../shared/answer-fields";
import { AnswerBoxes } from "./AnswerBoxes";
import { fileUrl, getMaterial, getTrial, listResponses, type MaterialItem, postResponse, type Trial } from "./api";
import { Material } from "./Material";
import { useOutbox } from "./outbox";

type Out = { item: "A" | "B"; ms: number; answer: string };
const sameItem = (a: Out, b: Out) => a.item === b.item;
const blank: AnswerFields = { ja: "", own: "" };

/** 文の側のページの画像を、先に全部読み込んで描ける形にしておく */
async function preload(tenant: string, items: MaterialItem[]) {
  const urls: Record<string, string> = {};
  for (const x of items) {
    if (x.shown !== "text" || !x.page) continue;
    const u = await fileUrl(tenant, x.page);
    const img = new Image();
    img.src = u;
    await img.decode();
    urls[x.item] = u;
  }
  return urls;
}

export function SelfScreen({ tenant, id, participant }: { tenant: string; id: string; participant: string }) {
  const [trial, setTrial] = useState<Trial | null>(null);
  const [items, setItems] = useState<MaterialItem[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const [sent, setSent] = useState<Set<string> | null>(null);
  const [showing, setShowing] = useState(false);
  const [shownAt, setShownAt] = useState<number | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [text, setText] = useState<AnswerFields>(blank);
  const [err, setErr] = useState("");
  const t0 = useRef(0);
  useEffect(() => {
    getTrial(tenant, id).then(setTrial, (e: Error) => setErr(e.message));
    listResponses(tenant, id).then(
      (rs) => setSent(new Set(rs.filter((r) => r.participant === participant).map((r) => r.item))),
      (e: Error) => setErr(e.message),
    );
    getMaterial(tenant, id, participant).then(
      (xs) => {
        setItems(xs);
        preload(tenant, xs).then(setUrls, (e: Error) => setErr(e.message));
      },
      (e: Error) => setErr(e.message),
    );
  }, [tenant, id, participant]);
  const send = useCallback(
    async (e: Out) => {
      try {
        await postResponse(tenant, id, { participant, item: e.item, ms: e.ms, answer: e.answer });
      } catch (x) {
        // 409 は、前に送った答えがもう届いている（返事だけが落ちた）。同じ答えを 2 つ入れない
        if ((x as { status?: number }).status !== 409) throw x;
      }
      setSent((s) => new Set([...(s ?? []), e.item]));
    },
    [tenant, id, participant],
  );
  const out = useOutbox<Out>(`gk-out:${tenant}:${id}:${participant}`, send, sameItem);

  if (err) return <p className="err">{err}</p>;
  if (!trial || !items || !sent) return <p>読み込み中…</p>;
  if (trial.design !== "cross") return <p className="err">この回は、1 人がカードと文を 1 つずつ受ける形（交差の回）ではない</p>;
  if (!trial.participants.includes(participant)) return <p className="err">この回の参加者ではない: {participant}</p>;
  const done = new Set([...sent, ...out.pending.map((p) => p.item)]);
  const cur = items.find((x) => !done.has(x.item));
  const banner = out.pending.length > 0 && (
    <p className="err" data-testid="self-pending">
      まだ おくれて いません（{out.pending.length}）{" "}
      <button type="button" onClick={() => void out.flush()} data-testid="self-resend">
        もう いちど おくる
      </button>
    </p>
  );
  if (!cur)
    return (
      <div className="answer">
        {banner}
        <p className="done" data-testid="self-done">
          おわりです。ありがとうございました
        </p>
      </div>
    );

  const got = () => setMs(Math.round(performance.now() - t0.current));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ms === null || !canSend(text)) return;
    out.add({ item: cur.item, ms, answer: packAnswer(text) });
    setShowing(false);
    setShownAt(null);
    setMs(null);
    setText(blank);
  };

  const n = items.findIndex((x) => x.item === cur.item) + 1;
  return (
    <form className="answer" onSubmit={submit} data-testid="self" data-item={cur.item}>
      {banner}
      <p className="who">
        {n} / {items.length}
      </p>
      {!showing ? (
        <button type="button" className="big" disabled={!urls} onClick={() => setShowing(true)} data-testid="self-show">
          {urls ? "見る" : "じゅんびちゅう"}
        </button>
      ) : (
        <>
          <Material
            key={cur.item}
            shown={cur.shown}
            item={cur.item}
            tenant={tenant}
            content={cur}
            src={urls?.[cur.item]}
            onShown={() => {
              t0.current = performance.now();
              setShownAt(t0.current);
            }}
          />
          {ms === null ? (
            <button type="button" className="big go" disabled={shownAt === null} onClick={got} data-testid="self-got">
              分かった
            </button>
          ) : (
            <>
              <AnswerBoxes value={text} onChange={setText} testid="self-text" />
              <button className="big" disabled={!canSend(text)} data-testid="self-submit">
                おくる
              </button>
            </>
          )}
        </>
      )}
    </form>
  );
}
