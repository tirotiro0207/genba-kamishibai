// カードの画面（037）。3〜4 コマを紙芝居のように 1 コマずつ送る。絵の面は文字 0 字で、番号や帯は面の外に置く。
// 絵をタップすると「守ること・なぜ・言葉」が出る。署名の前は「未承認の下書き」、元の文に無い理由を足した枚は「AI 下書き」の帯を出す。
// 確かめる AI の証拠が無いうちは「確認待ち」で OK を押せない（047・Check.tsx）。
// コマを送るときは、同じ動きの JSON をコマの間だけ 0.35 秒で再生する（076a）。「動きを減らす」設定では飛ぶ。
import { useEffect, useRef, useState } from "react";
import { type CardBody, type CardStatus, STATUS_LABEL } from "../../shared/card";
import { cutFrames, frameAt, type MotionJson } from "../../shared/picto/motion";
import { type Frame, renderFrame } from "../../shared/picto/scene";
import { req } from "../make/MakeScreen";
import { reducedMotion, SLIDE_MS } from "../motion/Slide";
import { needsPin, TenantPin } from "../pin/TenantPin";
import { Check, type CheckedCard } from "./Check";
import "./card.css";

type CardView = CheckedCard;

/** 状態ごとの帯。署名済みには帯を出さない。署名の前（確認待ち・OK も）は「未承認の下書き」と出し、状態は添える */
function Band({ card }: { card: CardView }) {
  if (card.status === "signed") return null;
  const ai = card.status === "ai_draft";
  const stopped = card.status === "stopped";
  const head = ai || stopped ? STATUS_LABEL[card.status] : STATUS_LABEL.draft;
  const note = ai
    ? "未承認の下書き。元の文に無い理由を AI が書いています。人が確かめるまで使わないでください"
    : stopped
      ? "このカードは止めています"
      : `${card.status === "draft" ? "" : `${STATUS_LABEL[card.status]}。`}まだ署名されていません`;
  return (
    <p className={`card-band${ai ? " ai" : ""}`} data-testid="card-band" data-status={card.status}>
      <strong>{head}</strong>
      <span>{note}</span>
    </p>
  );
}

/** 今のコマの時刻 t へ、前のコマの時刻から動きを再生して進む。動いている間は moving が true */
function usePlay(json: MotionJson | null, t: number | undefined): { frame: Frame | null; moving: boolean } {
  const [view, setView] = useState<{ frame: Frame | null; moving: boolean }>({ frame: null, moving: false });
  const from = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!json || t === undefined) return;
    const t0 = from.current;
    from.current = t;
    if (t0 === undefined || t0 === t || reducedMotion()) {
      setView({ frame: frameAt(json, t), moving: false });
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const u = Math.min((now - start) / SLIDE_MS, 1);
      const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      setView({ frame: frameAt(json, t0 + (t - t0) * e), moving: u < 1 });
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      setView({ frame: frameAt(json, t), moving: false });
    };
  }, [json, t]);
  return view;
}

export function CardScreen({ tenant, cardId }: { tenant: string; cardId: string }) {
  const [card, setCard] = useState<CardView | null>(null);
  const [err, setErr] = useState("");
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    // 入ったしるし（会社のテナント）と役割のしるしを付けて読む（038）
    setErr("");
    req<CardView>(tenant, `/cards/${encodeURIComponent(cardId)}`)
      .then(setCard)
      .catch((e: Error) => setErr(e.message));
  }, [tenant, cardId, tries]);

  const frames = card?.body.motion.kind === "keyframes" ? cutFrames(card.body.motion.json) : [];
  const n = frames.length;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, Math.max(n - 1, 0)));
      if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [n]);

  const at = Math.min(i, Math.max(n - 1, 0));
  const play = usePlay(card?.body.motion.kind === "keyframes" ? card.body.motion.json : null, frames[at]?.t);

  if (err && needsPin(err)) return <TenantPin tenant={tenant} onDone={() => setTries((t) => t + 1)} />;
  if (err) return <p className="err">{err}</p>;
  if (!card) return <p>読み込み中…</p>;
  const b = card.body;
  return (
    <article className="card" data-testid="card" data-card={card.id} data-status={card.status}>
      <Band card={card} />
      {b.motion.kind === "keyframes" ? (
        // 絵の面。ここには文字を置かない（番号は下の点で示す）
        <button className="card-face" onClick={() => setOpen((o) => !o)} aria-label="絵（タップで文を出す）" data-testid="card-face" data-frame={at} data-moving={play.moving ? "1" : undefined}>
          <span dangerouslySetInnerHTML={{ __html: renderFrame(play.frame ?? frames[at].frame).svg }} />
        </button>
      ) : (
        // AI が書いた動きの HTML は、スクリプトを動かさない枠の中で見せる
        <iframe className="card-html" sandbox="" srcDoc={b.motion.html} title="動き" data-testid="card-face" />
      )}
      {n > 0 && (
        <nav className="card-nav">
          <button className="big" disabled={at === 0} onClick={() => setI(at - 1)} data-testid="card-prev" aria-label="まえのコマ">
            ←
          </button>
          <ol className="card-dots" data-testid="card-dots" aria-label={`${at + 1} / ${n} コマ`}>
            {frames.map((f, j) => (
              <li key={f.t} className={j === at ? "on" : ""}>
                <button onClick={() => setI(j)} aria-label={`${j + 1} コマ目`} />
              </li>
            ))}
          </ol>
          <button className="big go" disabled={at >= n - 1} onClick={() => setI(at + 1)} data-testid="card-next" aria-label="つぎのコマ">
            →
          </button>
        </nav>
      )}
      <Check tenant={tenant} card={card} onChange={setCard} />
      {!open && (
        <button className="card-show" onClick={() => setOpen(true)} data-testid="card-show">
          文を見る
        </button>
      )}
      {open && (
        <section className="card-text" data-testid="card-text">
          <p className="card-rule">
            <span>守ること</span>
            {b.rule}
          </p>
          <p className="card-why">
            <span>なぜ</span>
            {b.why}
          </p>
          {b.words && (
            <div className="card-words" data-testid="card-words">
              <span>言葉</span>
              <p>{b.words.ja}</p>
              <p lang="vi">{b.words.vi.normalize("NFC")}</p>
            </div>
          )}
          <a className="card-show" href={`#/t/${encodeURIComponent(tenant)}/route/${encodeURIComponent(card.id)}`} data-testid="card-route">
            経路を見る（部品 → 元の文）
          </a>
          {card.status !== "signed" && card.status !== "stopped" && (
            <a className="card-show" href={`#/t/${encodeURIComponent(tenant)}/fix/${encodeURIComponent(card.id)}`} data-testid="card-fix">
              枠で囲んで直す
            </a>
          )}
          <button className="card-show" onClick={() => setOpen(false)} data-testid="card-hide">
            閉じる
          </button>
        </section>
      )}
    </article>
  );
}
