// カードの画面（037）。3〜4 コマを紙芝居のように 1 コマずつ送る。絵の面は文字 0 字で、番号や帯は面の外に置く。
// 絵をタップすると「守ること・なぜ・言葉」が出る。署名の前は「未承認の下書き」、元の文に無い理由を足した枚は「AI 下書き」の帯を出す。
import { useEffect, useState } from "react";
import { type CardBody, type CardStatus, STATUS_LABEL } from "../../shared/card";
import { cutFrames } from "../../shared/picto/motion";
import { renderFrame } from "../../shared/picto/scene";
import "./card.css";

interface CardView {
  id: string;
  status: CardStatus;
  version: number;
  body: CardBody;
}

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

export function CardScreen({ tenant, cardId }: { tenant: string; cardId: string }) {
  const [card, setCard] = useState<CardView | null>(null);
  const [err, setErr] = useState("");
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    fetch(`/api/t/${encodeURIComponent(tenant)}/cards/${encodeURIComponent(cardId)}`)
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
        setCard(b as CardView);
      })
      .catch((e: Error) => setErr(e.message));
  }, [tenant, cardId]);

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

  if (err) return <p className="err">{err}</p>;
  if (!card) return <p>読み込み中…</p>;
  const b = card.body;
  const at = Math.min(i, Math.max(n - 1, 0));
  return (
    <article className="card" data-testid="card" data-card={card.id} data-status={card.status}>
      <Band card={card} />
      {b.motion.kind === "keyframes" ? (
        // 絵の面。ここには文字を置かない（番号は下の点で示す）
        <button className="card-face" onClick={() => setOpen((o) => !o)} aria-label="絵（タップで文を出す）" data-testid="card-face" data-frame={at}>
          <span dangerouslySetInnerHTML={{ __html: renderFrame(frames[at].frame).svg }} />
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
          <button className="card-show" onClick={() => setOpen(false)} data-testid="card-hide">
            閉じる
          </button>
        </section>
      )}
    </article>
  );
}
