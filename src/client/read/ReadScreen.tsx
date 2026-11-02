// 新入社員の閲覧画面（028）。署名済みのカードだけを 1 枚ずつ送って見る。絵（3〜4 コマ）が先、文は下
import { useEffect, useState } from "react";
import type { CardMotion } from "../../shared/card";
import { cutFrames } from "../../shared/picto/motion";
import { renderFrame } from "../../shared/picto/scene";

interface ReadCard {
  id: string;
  rule: string;
  why: string;
  words: { ja: string; vi: string } | null;
  motion: CardMotion;
  frames: { t: number; png?: string }[];
}

function Frames({ motion }: { motion: CardMotion }) {
  if (motion.kind === "keyframes") {
    return (
      <div className="read-frames" data-testid="read-frames">
        {cutFrames(motion.json).map(({ t, frame }, i) => (
          <figure key={t} className="read-frame">
            <span className="read-n">{i + 1}</span>
            {/* 自前の描き方で作った SVG */}
            <div dangerouslySetInnerHTML={{ __html: renderFrame(frame).svg }} />
          </figure>
        ))}
      </div>
    );
  }
  // AI が書いた動きの HTML は、スクリプトを動かさない枠の中で見せる
  return <iframe className="read-html" sandbox="" srcDoc={motion.html} title="動き" data-testid="read-frames" />;
}

export function ReadScreen({ tenant }: { tenant: string }) {
  const [cards, setCards] = useState<ReadCard[] | null>(null);
  const [i, setI] = useState(0);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/t/${encodeURIComponent(tenant)}/read/cards`)
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
        setCards((b as { cards: ReadCard[] }).cards);
      })
      .catch((e: Error) => setErr(e.message));
  }, [tenant]);

  if (err) return <p className="err">{err}</p>;
  if (!cards) return <p>読み込み中…</p>;
  if (cards.length === 0) return <p className="done" data-testid="read-empty">まだカードがありません</p>;
  const c = cards[Math.min(i, cards.length - 1)];
  return (
    <article className="read" data-testid="read-card" data-card={c.id}>
      <p className="read-pos" data-testid="read-pos">
        {i + 1} / {cards.length}
      </p>
      <Frames motion={c.motion} />
      <section className="read-text">
        <p className="read-rule">{c.rule}</p>
        <p className="read-why">なぜ: {c.why}</p>
        {c.words && (
          <>
            <p className="read-words">{c.words.ja}</p>
            <p className="read-words" lang="vi">
              {c.words.vi}
            </p>
          </>
        )}
      </section>
      <nav className="read-nav">
        <button className="big" disabled={i === 0} onClick={() => setI(i - 1)} data-testid="read-prev">
          ← まえ
        </button>
        <button className="big go" disabled={i >= cards.length - 1} onClick={() => setI(i + 1)} data-testid="read-next">
          つぎ →
        </button>
      </nav>
    </article>
  );
}
