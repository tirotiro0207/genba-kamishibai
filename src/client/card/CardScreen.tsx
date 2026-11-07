// カードの画面（037）。3〜4 コマを紙芝居のように 1 コマずつ送る。絵の面は文字 0 字で、番号や帯は面の外に置く。
// 絵をタップすると「守ること・なぜ・言葉」が出る。署名の前は「未承認の下書き」、元の文に無い理由を足した枚は「AI 下書き」の帯を出す。
// 作る人が「監修者に確認」の印を付けた枚は、その理由を帯の下に出す（039）。同じ会社の前の修正を手本にした下書きは、その日付と誰（役割）を出す（087）。
// 確かめる AI の証拠が無いうちは「確認待ち」で OK を押せない（047・Check.tsx）。
// コマを送るときは、同じ動きの JSON をコマの間だけ 0.35 秒で再生する（076a）。「動きを減らす」設定では飛ぶ。
import { useEffect, useRef, useState } from "react";
import { type CardBody, type CardStatus, STATUS_LABEL } from "../../shared/card";
import { type UsedExemplar, usedLine } from "../../shared/exemplars";
import { cutFrames, frameAt, type MotionJson } from "../../shared/picto/motion";
import { type Frame } from "../../shared/picto/scene";
import { frameSvg } from "../Safe";
import { req } from "../make/MakeScreen";
import { reducedMotion, SLIDE_MS } from "../motion/Slide";
import { needsPin, TenantPin } from "../pin/TenantPin";
import { Check, type CheckedCard } from "./Check";
import { Frames } from "../read/ReadScreen";
import { TextEdit } from "./TextEdit";
import "./card.css";
import { Ruby } from "../Ruby";

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

/** 「監修者に確認」の印。署名済み・停止の枚には出さない */
function Ask({ card }: { card: CardView }) {
  if (!card.ask || card.status === "signed" || card.status === "stopped") return null;
  return (
    <p className="card-ask" data-testid="card-ask">
      <strong>監修者に確認</strong>
      <span>{card.ask}</span>
    </p>
  );
}

/** 脚本の無い枚の印（11/6）。11/5 より前の作り方のカードには見せ場・山場の脚本が無いので、絵に山場が無い理由をここで示す */
function NoScript({ card }: { card: CardView }) {
  if (card.body.script) return null;
  return (
    <p className="card-note" data-testid="card-noscript">
      脚本なし（11/5 より前の作り方）。見せ場・山場の脚本が無いので、作り直すときは新しい作り方で作り直す
    </p>
  );
}

/** 手本にしたもの（087・§5 L7）。この下書きを作るときに渡した、同じ会社の前の修正か署名済みのカードの日付と誰（役割） */
function Used({ tenant, card }: { tenant: string; card: CardView }) {
  const [used, setUsed] = useState<UsedExemplar[]>([]);
  // 読めなかったとき（403・500・回線）は、手本が無いのと見分けられるように小さく出す
  const [fail, setFail] = useState("");
  useEffect(() => {
    req<{ used: UsedExemplar[] }>(tenant, `/cards/${encodeURIComponent(card.id)}/exemplars`)
      .then((r) => {
        setUsed(Array.isArray(r.used) ? r.used : []);
        setFail("");
      })
      .catch((e: Error) => {
        setUsed([]);
        setFail(e.message);
      });
  }, [tenant, card.id]);
  const line = usedLine(used);
  if (card.status === "signed" || card.status === "stopped") return null;
  if (fail)
    return (
      <p className="card-note" data-testid="card-used-fail">
        手本にしたものを読めませんでした（{fail}）
      </p>
    );
  if (!line) return null;
  return (
    <p className="card-ask" data-testid="card-used" data-count={used.length}>
      <span>{line}</span>
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
  // 役割（11/7 作者: 署名済み・止めたカードを直せるのは監修者だけ）。読めなければ null のまま（直す口は出さず、置き場の 403 に任せる）
  const [role, setRole] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    req<{ role: string | null }>(tenant, "/me").then((m) => setRole(m.role), () => setRole(null));
  }, [tenant, tries]);
  // 見せ方（11/6 作者「横一列の紙芝居 4 コマでも見られるように」）。スライド（1 コマずつ送る）と 4 コマ（横 1 列）を切り替える
  const [layout, setLayout] = useState<"slide" | "strip">(() => {
    try {
      return localStorage.getItem("card-layout") === "strip" ? "strip" : "slide";
    } catch {
      return "slide";
    }
  });
  const pickLayout = (v: "slide" | "strip") => {
    setLayout(v);
    try {
      localStorage.setItem("card-layout", v);
    } catch {
      // 残せない端末は、開くたびにスライドから
    }
  };
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
  const locked = (card.status === "signed" || card.status === "stopped") && role !== "supervisor";
  return (
    <article className={`card${layout === "strip" ? " card-wide" : ""}`} data-testid="card" data-card={card.id} data-status={card.status}>
      <Band card={card} />
      <Ask card={card} />
      <Used tenant={tenant} card={card} />
      <NoScript card={card} />
      {card.verify?.dangerous && card.status !== "signed" && card.status !== "stopped" && (
        // 危険の印（048）は絵の面の外に置く。絵の面は 0 字のまま
        <p className="card-danger" data-testid="card-danger" role="alert">
          <strong>危険</strong>
          <span>危ない行為をしてよいと読める絵です。直して確かめ直すまで OK できません</span>
        </p>
      )}
      {!locked && <TextEdit tenant={tenant} card={card} onSaved={setCard} />}
      {b.motion.kind === "keyframes" && (
        <div className="av-seg card-layout" role="tablist" aria-label="見せ方">
          <button role="tab" aria-selected={layout === "slide"} className={layout === "slide" ? "on" : ""} onClick={() => pickLayout("slide")} data-testid="card-layout-slide">
            スライド（1 コマずつ）
          </button>
          <button role="tab" aria-selected={layout === "strip"} className={layout === "strip" ? "on" : ""} onClick={() => pickLayout("strip")} data-testid="card-layout-strip">
            4 コマ（横 1 列）
          </button>
        </div>
      )}
      {layout === "strip" && b.motion.kind === "keyframes" ? (
        <div className="card-strip" data-testid="card-strip">
          <Frames motion={b.motion} />
        </div>
      ) : b.motion.kind === "keyframes" ? (
        // 絵の面。ここには文字を置かない（番号は下の点で示す）
        <button className="card-face" onClick={() => setOpen((o) => !o)} aria-label="絵（タップで文を出す）" data-testid="card-face" data-frame={at} data-moving={play.moving ? "1" : undefined}>
          <span dangerouslySetInnerHTML={{ __html: frameSvg(play.frame ?? frames[at]?.frame) }} />
        </button>
      ) : (
        // AI が書いた動きの HTML は、スクリプトを動かさない枠の中で見せる
        <iframe className="card-html" sandbox="" srcDoc={b.motion.html} title="動き" data-testid="card-face" />
      )}
      {n > 0 && layout === "slide" && (
        <nav className="card-nav" data-testid="card-nav">
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
      {/* 絵の直し方の入口（11/6 作者「プロンプトで直す・つまみで直すが見つからない」）。前は「文を見る」を開かないと出なかった */}
      {locked && (
        <p className="card-note" data-testid="card-locked-note">
          {card.status === "signed" ? "署名済み" : "止めた"}のカードを直せるのは監修者だけです
        </p>
      )}
      {!locked && <nav className="card-fixes" aria-label="絵を直す" data-testid="card-fixes">
        <span>絵を直す</span>
        <a className="pick" href={`#/t/${encodeURIComponent(tenant)}/fix/${encodeURIComponent(card.id)}/words`} data-testid="card-fix-words">
          言葉（プロンプト）で直す
        </a>
        <a className="pick" href={`#/t/${encodeURIComponent(tenant)}/fix/${encodeURIComponent(card.id)}/ask`} data-testid="card-fix-ask">
          枠で囲んで AI に頼む
        </a>
        <a className="pick" href={`#/t/${encodeURIComponent(tenant)}/fix/${encodeURIComponent(card.id)}/touch`} data-testid="card-fix-touch">
          指で動かす
        </a>
        <a className="pick" href={`#/t/${encodeURIComponent(tenant)}/pose/${encodeURIComponent(card.id)}`} data-testid="card-fix-pose">
          つまみで角度まで動かす
        </a>
        {/* 折りたたみ（元のページが 1 枚・0 字にたたまれる）へも、カードから行けるように（前はホームからだけ） */}
        <a className="pick" href={`#/t/${encodeURIComponent(tenant)}/fold/${encodeURIComponent(card.id)}`} data-testid="card-to-fold">
          折りたたみを見る
        </a>
      </nav>}
      {/* 公開デモのカードは見るだけ（置き場が確かめ・確認を 403 で断る）。押せないボタンは出さない */}
      {tenant === "demo" ? (
        <p className="card-note" data-testid="card-check-demo">
          公開デモのカードは見るだけです。確かめる AI に見せる・確認に回すのは、会社のテナントの中で行います
        </p>
      ) : (
        <Check tenant={tenant} card={card} onChange={setCard} />
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
              {/* やさしい日本語だけを出す（11/5 作者）。監修者が確かめられない訳は出さない。vi はデータに残す */}
              <p>
                <Ruby text={b.words.ja} />
              </p>
            </div>
          )}
          <a className="card-show" href={`#/t/${encodeURIComponent(tenant)}/route/${encodeURIComponent(card.id)}`} data-testid="card-route">
            経路を見る（部品 → 元の文）
          </a>
          {/* 署名済み・停止のカードも直せる（11/5 作者）。直すと新しい版の下書きになり、署名が外れる */}
          {!locked && (
            <a className="card-show" href={`#/t/${encodeURIComponent(tenant)}/fix/${encodeURIComponent(card.id)}`} data-testid="card-fix">
              枠で囲んで直す
            </a>
          )}
          {card.status === "signed" && !locked && <p className="card-note" data-testid="card-fix-note">直すと署名が外れて新しい版の下書きになり、前の版には回収の知らせが出ます。配るには、確かめ直して署名し直します。</p>}
          <button className="card-show" onClick={() => setOpen(false)} data-testid="card-hide">
            閉じる
          </button>
        </section>
      )}
    </article>
  );
}
