// 見る人が答える公開デモ（094）。架空の会社の署名済みのカードで、見る人も新入社員と同じ 2 つを試す。
// 「時間を計って答える」は絵を見せて「分かった」までの秒を計り、「絵だけで答える」は絵だけを見て意味を書く。答えると決まりの文が出て、新入社員の匿名の結果と並ぶ。
// 見る人の答えはどこにも送らない（この端末の画面に出すだけ）。新入社員の結果は本物が入るまで作りものの数で、画面にそう出す
import { useEffect, useRef, useState } from "react";
import { FAKE_PUBLIC, type PublicResults, pictureRate, placeTime } from "../../shared/public-results";
import type { CardMotion } from "../../shared/card";
import { Frames } from "../read/ReadScreen";
import "./demo.css";

interface DemoCard {
  id: string;
  rule: string;
  why: string;
  motion: CardMotion;
}

type Mode = "time" | "picture";
const RESULTS: PublicResults = FAKE_PUBLIC;
const sec = (ms: number) => `${(ms / 1000).toFixed(1)} 秒`;

function useDemoCards() {
  const [cards, setCards] = useState<DemoCard[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("/api/t/demo/read/cards")
      .then(async (r) => {
        const b = (await r.json()) as { cards?: DemoCard[]; error?: string };
        if (!r.ok || !b.cards) throw new Error(b.error ?? `HTTP ${r.status}`);
        setCards(b.cards.filter((c) => c.motion.kind === "keyframes"));
      })
      .catch((e: Error) => setErr(e.message));
  }, []);
  return { cards, err };
}

function FakeNote() {
  return RESULTS.fake ? (
    <p className="try-fake" data-testid="try-fake">
      仮の数字です（新入社員の結果は、本物を入れる前の作りものの数）
    </p>
  ) : null;
}

/** 時間を計って答える: 「見る」で絵を出して計り始め、「分かった」で止める */
function TimeTry({ card }: { card: DemoCard }) {
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [you, setYou] = useState<number | null>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const begin = () => {
    const t = performance.now();
    setYou(null);
    setStart(t);
    setNow(t);
    const tick = () => {
      setNow(performance.now());
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (start === null) return;
    cancelAnimationFrame(raf.current);
    setYou(Math.round(performance.now() - start));
    setStart(null);
  };
  if (you === null && start === null)
    return (
      <div className="try-step">
        <p>絵のカードが出たら、何をしなさいと言っているかが分かったところで「分かった」を押してください。</p>
        <button type="button" className="big go" onClick={begin} data-testid="try-begin">
          見る
        </button>
      </div>
    );
  if (start !== null)
    return (
      <div className="try-step">
        <Frames motion={card.motion} />
        <p className="try-timer" data-testid="try-timer">{sec(now - start)}</p>
        <button type="button" className="big go" onClick={stop} data-testid="try-stop">
          分かった
        </button>
      </div>
    );
  const place = placeTime(you!, RESULTS);
  const label = { you: "あなた", card: "新入社員（カード）", text: "新入社員（文）" } as const;
  return (
    <div className="try-step">
      <Frames motion={card.motion} />
      <p className="try-rule" data-testid="try-rule">
        決まり: <b>{card.rule}</b>
      </p>
      <ol className="try-rank" data-testid="try-rank">
        {place.rows.map((r) => (
          <li key={r.who} className={r.who === "you" ? "try-you" : ""} data-who={r.who}>
            <span>{label[r.who]}</span>
            <b>{sec(r.ms)}</b>
          </li>
        ))}
      </ol>
      <p className="try-meta">新入社員は {RESULTS.time.n} 人の真ん中の人の秒です</p>
      <FakeNote />
      <button type="button" className="big" onClick={begin} data-testid="try-again">
        もう一度
      </button>
    </div>
  );
}

/** 絵だけで答える: 絵を見て意味を書き、決まりの文と見比べて、合っていたかを自分で付ける */
function PictureTry({ card }: { card: DemoCard }) {
  const [answer, setAnswer] = useState("");
  const [shown, setShown] = useState(false);
  const [self, setSelf] = useState<boolean | null>(null);
  const rate = pictureRate(RESULTS);
  return (
    <div className="try-step">
      <Frames motion={card.motion} />
      {!shown ? (
        <>
          <label>
            この絵は、何をしなさいと言っていますか
            <textarea rows={3} value={answer} maxLength={300} onChange={(e) => setAnswer(e.target.value)} data-testid="try-answer" />
          </label>
          <button type="button" className="big go" onClick={() => setShown(true)} disabled={!answer.trim()} data-testid="try-submit">
            答える
          </button>
        </>
      ) : (
        <>
          <p className="try-rule" data-testid="try-rule">
            決まり: <b>{card.rule}</b>
          </p>
          <p className="try-yours">あなたの答え: {answer}</p>
          {self === null ? (
            <div className="try-self">
              <span>決まりと見比べて</span>
              <button type="button" className="big" onClick={() => setSelf(true)} data-testid="try-right">
                合っていた
              </button>
              <button type="button" className="big" onClick={() => setSelf(false)} data-testid="try-wrong">
                違っていた
              </button>
            </div>
          ) : (
            <p className="try-compare" data-testid="try-compare">
              あなた: <b>{self ? "合っていた" : "違っていた"}</b> ／ 新入社員: <b>{rate ?? "—"}%</b> が合っていた（{RESULTS.picture.n} 人）
            </p>
          )}
          {self !== null && (
            <ul className="try-groups" data-testid="try-groups">
              {RESULTS.groups.map((g) => (
                <li key={g.group}>
                  {g.group}: <b>{Math.round((g.correct / g.n) * 100)}%</b>（{g.n} 人）
                </li>
              ))}
            </ul>
          )}
          <FakeNote />
        </>
      )}
    </div>
  );
}

export function TryScreen({ mode }: { mode: Mode }) {
  const { cards, err } = useDemoCards();
  const [k, setK] = useState(0);
  if (err) return <p className="err" role="alert">{err}</p>;
  if (!cards) return null;
  if (!cards.length) return <p className="done">見せられるカードがまだありません</p>;
  const card = cards[k % cards.length];
  return (
    <section className="demo try" data-testid="try" data-mode={mode}>
      <h1>{mode === "time" ? "時間を計って答える" : "絵だけで答える"}</h1>
      <p className="demo-lead">新入社員も同じように答えました。あなたの答えは、どこにも送りません。</p>
      {mode === "time" ? <TimeTry key={card.id} card={card} /> : <PictureTry key={card.id} card={card} />}
      <div className="demo-doors">
        <button type="button" onClick={() => setK((x) => x + 1)} data-testid="try-next">
          別のカード
        </button>
        <a href="#/">入口へ戻る</a>
      </div>
    </section>
  );
}
