// 絵だけの 8 枚（059）。教育担当が前もって勘を書く画面と、参加者が絵だけを見て意味を答える画面。
// 見せる順番は参加者ごとにサーバーが種から決める。答えが入り始めたら勘は書けない（記入の日時が結果より前になる）
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Frames } from "../read/ReadScreen";
import { getMyPictures, getPictures, listTenantCards, type PictureCard, type PicturesView, postForecast, postPictureAnswer, setPictureCards } from "./api";
import "./pictures.css";

const MAX = 8;

/** 回で見せるカードを選ぶ（勘の記入の前だけ） */
function ChooseCards({ tenant, id, onDone }: { tenant: string; id: string; onDone: () => void }) {
  const [all, setAll] = useState<{ id: string; rule: string }[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    listTenantCards(tenant).then((cs) => setAll(cs.filter((c) => c.body.motion.kind === "keyframes").map((c) => ({ id: c.id, rule: c.body.rule }))), (e: Error) => setErr(e.message));
  }, [tenant]);
  const toggle = (cid: string) => setPicked((p) => (p.includes(cid) ? p.filter((x) => x !== cid) : p.length < MAX ? [...p, cid] : p));
  const save = () => setPictureCards(tenant, id, picked).then(onDone, (e: Error) => setErr(e.message));
  if (err) return <p className="err">{err}</p>;
  if (!all) return <p>読み込み中…</p>;
  return (
    <div className="pic-choose" data-testid="pic-choose">
      <p>絵だけで見せるカードを {MAX} 枚まで選んでください（{picked.length} 枚）</p>
      <ul>
        {all.map((c) => (
          <li key={c.id}>
            <label>
              <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} data-testid="pic-choose-card" />
              {c.rule}
            </label>
          </li>
        ))}
      </ul>
      <button type="button" className="big" disabled={!picked.length} onClick={save} data-testid="pic-choose-save">
        この {picked.length} 枚にする
      </button>
    </div>
  );
}

/** 教育担当の勘: 8 枚ごとに、新入社員の何 % が絵だけで正しく答えるかを前もって書く */
export function ForecastScreen({ tenant, id }: { tenant: string; id: string }) {
  const [v, setV] = useState<PicturesView | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState("");
  const reload = useCallback(() => getPictures(tenant, id).then(setV, (e: Error) => setErr(e.message)), [tenant, id]);
  useEffect(() => {
    reload();
  }, [reload]);
  if (err) return <p className="err">{err}</p>;
  if (!v) return <p>読み込み中…</p>;
  if (!v.cards.length) return <ChooseCards tenant={tenant} id={id} onDone={reload} />;
  const locked = v.answers > 0;
  const last = new Map(v.forecasts.map((f) => [f.card_id, f]));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      for (const c of v.cards) {
        const s = draft[c.id];
        if (s === undefined || s === "") continue;
        await postForecast(tenant, id, c.id, Number(s));
      }
      setDraft({});
      setSaved(new Date().toLocaleString("ja-JP"));
      await reload();
    } catch (e2) {
      setErr((e2 as Error).message);
    }
  };
  const filled = v.cards.filter((c) => last.has(c.id)).length;
  return (
    <form className="forecast" onSubmit={save} data-testid="forecast" data-locked={locked}>
      <h1>教育担当の勘</h1>
      <p className="pic-lead">新入社員が絵だけを見て、決まりを正しく答えられる割合を、カードごとに予想して書いてください。答えが始まると書けなくなります。</p>
      <p className="pic-meta" data-testid="forecast-count">
        書いた {filled} / {v.cards.length} 枚 ・ 絵だけの答え {v.answers} 件{locked ? " ・ 答えが始まったので締め切り" : ""}
      </p>
      <ol className="forecast-list">
        {v.cards.map((c) => {
          const f = last.get(c.id);
          return (
            <li key={c.id} data-testid="forecast-card">
              <Frames motion={c.motion} />
              <p className="forecast-rule">{c.rule}</p>
              <label>
                正しく答える割合
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  inputMode="numeric"
                  disabled={locked}
                  value={draft[c.id] ?? (f ? String(f.rate) : "")}
                  onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                  data-testid="forecast-rate"
                />
                %
              </label>
              {f && (
                <span className="forecast-at" data-testid="forecast-at">
                  記入 {new Date(f.created_at).toLocaleString("ja-JP")}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {!locked && (
        <button className="big" data-testid="forecast-save">
          勘を残す
        </button>
      )}
      {saved && <p className="pic-meta">残した {saved}</p>}
      {v.items.length > 0 && (
        <section className="pic-items" data-testid="pic-items">
          {/* 元のページは全員に日本語の原文で見せる（11/5 作者）。訳は確かめた人がいないので出さない。vi はデータに残す */}
          <h2>2 項目の元のページ（日本語の原文・このテナントの中だけ）</h2>
          {v.items.map((it) => (
            <p key={it.item}>
              項目 {it.item}: {it.ja ?? "（まだ）"}
            </p>
          ))}
        </section>
      )}
    </form>
  );
}

/** 参加者: 絵だけを 1 枚ずつ見て、何をしなさいと言っているかを書く */
export function PictureAnswerScreen({ tenant, id, participant }: { tenant: string; id: string; participant: string }) {
  const [cards, setCards] = useState<PictureCard[] | null>(null);
  const [answered, setAnswered] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = useCallback(
    () =>
      getMyPictures(tenant, id, participant).then((r) => {
        setCards(r.cards);
        setAnswered(r.answered);
      }, (e: Error) => setErr(e.message)),
    [tenant, id, participant],
  );
  useEffect(() => {
    reload();
  }, [reload]);
  if (err) return <p className="err">{err}</p>;
  if (!cards) return <p>読み込み中…</p>;
  const next = cards.find((c) => !answered.includes(c.id));
  if (!next)
    return (
      <p className="done" data-testid="pic-done">
        絵の答えは全部済み。ありがとうございました
      </p>
    );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await postPictureAnswer(tenant, id, participant, text.trim());
      setText("");
      await reload();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="answer pic-answer" onSubmit={submit} data-testid="pic-answer" data-card={next.id}>
      <p className="who">
        参加者 {participant} ・ {answered.length + 1} / {cards.length} 枚
      </p>
      <Frames key={next.id} motion={next.motion} />
      <label>
        この絵は、何をしなさいと言っていますか
        <textarea value={text} disabled={busy} onChange={(e) => setText(e.target.value)} rows={3} data-testid="pic-text" />
      </label>
      <button className="big" disabled={busy || !text.trim()} data-testid="pic-submit">
        答える
      </button>
    </form>
  );
}
