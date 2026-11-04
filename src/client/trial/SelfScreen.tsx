// ① を自分で受ける画面（11/5 作者）。参加者が 1 人 1 台の iPad で、項目 A・B を 1 つずつ受ける。
// 組のとおりに、片方はカード、もう片方は元のページ（日本語の原文の画像）。
// 見せるものの上に表紙を重ね、中身が全部読み込み終わるまで「はじめる」を押せない。押すと表紙が紙芝居をめくるように上へ抜け、
// 抜けきった時から「分かった」まで、端末の中の時計で数える。「分かった」のあとは中身を隠して答えを書く。
// 答えは端末の中に置いてから送り、届くまで送り直す
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { type AnswerFields, canSend, packAnswer } from "../../shared/answer-fields";
import { AnswerBoxes } from "./AnswerBoxes";
import { fileUrl, getMaterial, getTrial, listResponses, type MaterialItem, postResponse, type Trial } from "./api";
import { Material } from "./Material";
import { useOutbox } from "./outbox";

type Out = { item: "A" | "B"; ms: number; answer: string };
const sameItem = (a: Out, b: Out) => a.item === b.item;
const blank: AnswerFields = { ja: "", own: "" };
/** 表紙が抜ける長さ。カードの側も文の側も同じ（app.css の .cover と合わせる） */
export const LIFT_MS = 350;

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

/** 表紙と、その下の見せるもの。onStart は表紙が抜けきった時の時計の値 */
function Stage({ cur, tenant, src, onStart }: { cur: MaterialItem; tenant: string; src?: string; onStart: (t0: number) => void }) {
  const [ready, setReady] = useState(false);
  const [lift, setLift] = useState(false);
  const [gone, setGone] = useState<number | null>(null);
  const started = useRef(false);
  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    // 抜けきった次の描画の時から数える
    requestAnimationFrame(() => {
      const t = performance.now();
      setGone(t);
      onStart(t);
    });
  }, [onStart]);
  useEffect(() => {
    if (!lift) return;
    // transitionend が来ないとき（動きを止める設定など）は、長さが過ぎた時に始める
    const t = setTimeout(start, LIFT_MS + 50);
    return () => clearTimeout(t);
  }, [lift, start]);
  return (
    // data-t0 は数え始めた時計の値（画面の通しで、表紙が抜けきった時から数えているかを見る）
    <div className="stage" data-testid="stage" data-started={gone === null ? "false" : "true"} data-t0={gone ?? ""}>
      <Material shown={cur.shown} item={cur.item} tenant={tenant} content={cur} src={src} onShown={() => setReady(true)} />
      {gone === null && (
        <div className={lift ? "cover lift" : "cover"} onTransitionEnd={(e) => e.target === e.currentTarget && start()} data-testid="self-cover">
          <button type="button" className="big" disabled={!ready || lift} onClick={() => setLift(true)} data-testid="self-start">
            {ready ? "はじめる" : "じゅんびちゅう"}
          </button>
        </div>
      )}
    </div>
  );
}

export function SelfScreen({ tenant, id, participant }: { tenant: string; id: string; participant: string }) {
  const [trial, setTrial] = useState<Trial | null>(null);
  const [items, setItems] = useState<MaterialItem[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const [sent, setSent] = useState<Set<string> | null>(null);
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
  const onStart = useCallback((t: number) => {
    t0.current = t;
    setShownAt(t);
  }, []);

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
      {ms === null ? (
        <>
          {urls ? (
            <Stage key={cur.item} cur={cur} tenant={tenant} src={urls[cur.item]} onStart={onStart} />
          ) : (
            <div className="stage" data-testid="stage" data-started="false">
              <div className="cover" data-testid="self-cover">
                <button type="button" className="big" disabled data-testid="self-start">
                  じゅんびちゅう
                </button>
              </div>
            </div>
          )}
          <button type="button" className="big go" disabled={shownAt === null} onClick={got} data-testid="self-got">
            分かった
          </button>
        </>
      ) : (
        // 答えは中身を見ずに書く（文の側で原文を写せないように。カードの側と同じ条件）
        <>
          <AnswerBoxes value={text} onChange={setText} testid="self-text" />
          <button className="big" disabled={!canSend(text)} data-testid="self-submit">
            おくる
          </button>
        </>
      )}
    </form>
  );
}
