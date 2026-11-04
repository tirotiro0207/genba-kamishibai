// 新入社員の閲覧画面（028）。署名済みのカードだけを 1 枚ずつ送って見る。絵（3〜4 コマ）が先、文は下
// カードを送るときは、紙芝居の絵を抜くように今のカードが動く（076a）
// 会社のテナントは、テナントの PIN と新入社員の役割の PIN で入る（088 の残り）。見た印は役割と端末の単位で送り、名前は集めない
import { useEffect, useState } from "react";
import type { CardMotion } from "../../shared/card";
import { cutFrames } from "../../shared/picto/motion";
import { renderFrame } from "../../shared/picto/scene";
import { Slide } from "../motion/Slide";
import { needsPin, PinGate, roleKey, TenantPin, tokenKey } from "../pin/TenantPin";

const NEWHIRE = [{ value: "newhire.1", label: "新入社員" }] as const;

/** 入ったしるし（会社のテナント）と役割のしるし */
function headers(tenant: string): Record<string, string> {
  const h: Record<string, string> = {};
  try {
    const tok = sessionStorage.getItem(tokenKey(tenant));
    if (tok) h.authorization = `Bearer ${tok}`;
    const role = sessionStorage.getItem(roleKey(tenant));
    if (role) h["x-role"] = role;
  } catch {
    // 保存が使えない端末では、しるし無しで送る
  }
  return h;
}

/** この端末の番号（乱数 16 文字）。見た人を端末の単位で数えるためだけに使い、人の名前とは結び付けない */
function deviceId(): string | undefined {
  try {
    let d = localStorage.getItem("device");
    if (!d) {
      d = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("device", d);
    }
    return d;
  } catch {
    return undefined;
  }
}

interface ReadCard {
  id: string;
  rule: string;
  why: string;
  words: { ja: string } | null;
  motion: CardMotion;
  frames: { t: number; png?: string }[];
}

export function Frames({ motion }: { motion: CardMotion }) {
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

/** 会社のテナントでは、入ったしるしがそろってからカードを読み込む（入る前に 401 を出さない。総点検の 9） */
export function ReadScreen({ tenant }: { tenant: string }) {
  return (
    <PinGate tenant={tenant} roles={NEWHIRE}>
      <ReadCards tenant={tenant} />
    </PinGate>
  );
}

function ReadCards({ tenant }: { tenant: string }) {
  const [cards, setCards] = useState<ReadCard[] | null>(null);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const go = (d: number) => {
    setDir(d);
    setI((x) => x + d);
  };
  const [err, setErr] = useState("");
  const [tries, setTries] = useState(0);
  useEffect(() => {
    setErr("");
    fetch(`/api/t/${encodeURIComponent(tenant)}/read/cards`, { headers: headers(tenant) })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
        setCards((b as { cards: ReadCard[] }).cards);
      })
      .catch((e: Error) => setErr(e.message));
  }, [tenant, tries]);

  // 1 枚が画面に出たら、見た印を送る（発行の画面の「見た人」になる）。送れなくても閲覧は止めない
  const shown = cards && cards.length ? cards[Math.min(i, cards.length - 1)].id : null;
  useEffect(() => {
    if (!shown) return;
    // 役割で入っていれば、そのしるしと端末の番号で記録する（無ければ役割なしの閲覧として残る）
    fetch(`/api/t/${encodeURIComponent(tenant)}/read/cards/${encodeURIComponent(shown)}/seen`, {
      method: "POST",
      headers: { ...headers(tenant), "content-type": "application/json" },
      body: JSON.stringify({ device: deviceId() }),
    }).catch(() => undefined);
  }, [tenant, shown]);

  if (err && needsPin(err)) return <TenantPin tenant={tenant} roles={NEWHIRE} onDone={() => setTries((t) => t + 1)} />;
  if (err) return <p className="err">{err}</p>;
  if (!cards) return <p>読み込み中…</p>;
  if (cards.length === 0) return <p className="done" data-testid="read-empty">まだカードがありません</p>;
  const c = cards[Math.min(i, cards.length - 1)];
  return (
    <article className="read" data-testid="read-card" data-card={c.id}>
      <p className="read-pos" data-testid="read-pos">
        {i + 1} / {cards.length}
      </p>
      <Slide k={c.id} dir={dir}>
        <Frames motion={c.motion} />
        <section className="read-text">
          <p className="read-rule">{c.rule}</p>
          <p className="read-why">なぜ: {c.why}</p>
          {c.words && (
            <p className="read-words">{c.words.ja}</p>
          )}
        </section>
      </Slide>
      <nav className="read-nav">
        <button className="big" disabled={i === 0} onClick={() => go(-1)} data-testid="read-prev">
          ← まえ
        </button>
        <button className="big go" disabled={i >= cards.length - 1} onClick={() => go(1)} data-testid="read-next">
          つぎ →
        </button>
      </nav>
    </article>
  );
}
