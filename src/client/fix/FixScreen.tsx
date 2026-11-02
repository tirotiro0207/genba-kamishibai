// 枠と指示の画面（044a・工程 7）。監修者が直したいコマを選び、指かマウスで直したい部分を枠で囲む。
// 「ここをこうしたい」は大きな欄に書くか、端末の音声入力（キーボードのマイク）で話す。送る前に、枠と文字を並べて確かめてから送る。
// 送った依頼は監査の記録 ④ に残る。その 1 枚の作り直しは 044b でつなぐ。
import { useEffect, useRef, useState } from "react";
import type { CardBody } from "../../shared/card";
import { boxFrom, FIX_BOX_MIN, type FixBox } from "../../shared/fix";
import { cutFrames } from "../../shared/picto/motion";
import { renderFrame } from "../../shared/picto/scene";
import { req } from "../make/MakeScreen";
import { Slide } from "../motion/Slide";
import "./fix.css";

interface CardView {
  id: string;
  status: string;
  version: number;
  body: CardBody;
}

const pct = (b: FixBox) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` });

/** コマの絵の上に枠を描く。押して引いて離すと枠になる（指でもマウスでも同じ） */
function DrawBox({ svg, box, onBox }: { svg: string; box: FixBox | null; onBox: (b: FixBox | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<[number, number] | null>(null);
  const [live, setLive] = useState<FixBox | null>(null);
  const at = (e: React.PointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  return (
    <div
      ref={ref}
      className="fix-face"
      data-testid="fix-face"
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // 捕まえられない指（作った出来事など）は、枠の上だけで追う
        }
        start.current = at(e);
        setLive(boxFrom(start.current, start.current));
      }}
      onPointerMove={(e) => start.current && setLive(boxFrom(start.current, at(e)))}
      onPointerUp={(e) => {
        if (!start.current) return;
        const b = boxFrom(start.current, at(e));
        start.current = null;
        setLive(null);
        // 触れただけの小さい枠は描かなかったことにする
        onBox(b.w >= FIX_BOX_MIN && b.h >= FIX_BOX_MIN ? b : box);
      }}
      onPointerCancel={() => {
        start.current = null;
        setLive(null);
      }}
    >
      <span dangerouslySetInnerHTML={{ __html: svg }} />
      {(live ?? box) && <i className={`fix-box${live ? " live" : ""}`} style={pct((live ?? box)!)} data-testid="fix-box" />}
    </div>
  );
}

export function FixScreen({ tenant, cardId }: { tenant: string; cardId: string }) {
  const [card, setCard] = useState<CardView | null>(null);
  const [err, setErr] = useState("");
  const [at, setAt] = useState(0);
  const [box, setBox] = useState<FixBox | null>(null);
  const [text, setText] = useState("");
  const [step, setStep] = useState<"draw" | "confirm" | "sent">("draw");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ n: number; version: number } | null>(null);
  useEffect(() => {
    req<CardView>(tenant, `/cards/${encodeURIComponent(cardId)}`)
      .then(setCard)
      .catch((e: Error) => setErr(e.message));
  }, [tenant, cardId]);

  if (err && !card) return <p className="err">{err}</p>;
  if (!card) return <p>読み込み中…</p>;
  const b = card.body;
  if (b.motion.kind !== "keyframes") return <p className="done">この絵は枠で直せない（動きの HTML）</p>;
  const frames = cutFrames(b.motion.json);
  const svg = renderFrame(frames[at].frame).svg;
  const ready = box && text.trim();

  async function send() {
    setBusy(true);
    setErr("");
    try {
      setSent(await req<{ n: number; version: number }>(tenant, `/cards/${encodeURIComponent(cardId)}/fix`, { method: "POST", body: JSON.stringify({ frame: at, box, text: text.trim() }) }));
      setStep("sent");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="fix" data-testid="fix" data-card={card.id}>
      <Slide k={step} dir={step === "draw" ? -1 : 1}>
        {step === "draw" && (
          <section className="fix-step" data-testid="fix-draw">
            <h1>直したい部分を枠で囲む</h1>
            <nav className="fix-frames" aria-label="コマ">
              {frames.map((f, j) => (
                <button
                  key={f.t}
                  className={`pick${j === at ? " on" : ""}`}
                  onClick={() => {
                    setAt(j);
                    setBox(null);
                  }}
                  data-testid={`fix-frame-${j}`}
                >
                  {j + 1} コマ目
                </button>
              ))}
            </nav>
            <div className="fix-main">
              <DrawBox svg={svg} box={box} onBox={setBox} />
              <div className="fix-side">
                <p className="done">{box ? "枠を描きました。描き直すときは、もう一度なぞる" : "指かマウスで、直したい部分を斜めになぞる"}</p>
                <label>
                  ここをこうしたい（キーボードのマイクで話すか、書く）
                  <textarea className="fix-big" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="例: 検電器をもっと盤に近づけて、当てているのが分かるように" data-testid="fix-text" />
                </label>
                <button className="big" disabled={!ready} onClick={() => setStep("confirm")} data-testid="fix-to-confirm">
                  {box ? (text.trim() ? "文字を確かめる" : "直したいことを書く") : "先に枠を描く"}
                </button>
              </div>
            </div>
          </section>
        )}
        {step === "confirm" && box && (
          <section className="fix-step" data-testid="fix-confirm">
            <h1>この内容で送りますか</h1>
            <div className="fix-main">
              <div className="fix-face still">
                <span dangerouslySetInnerHTML={{ __html: svg }} />
                <i className="fix-box" style={pct(box)} />
              </div>
              <div className="fix-side">
                <p className="done">
                  {at + 1} コマ目・枠の中（左から {Math.round(box.x * 100)}%、上から {Math.round(box.y * 100)}%）
                </p>
                <blockquote className="fix-quote" data-testid="fix-quote">
                  {text.trim()}
                </blockquote>
                <p className="done">{text.trim().length} 字。音声入力の聞き違いが無いかを確かめてください</p>
                <div className="fix-nav">
                  <button className="big" onClick={() => setStep("draw")} data-testid="fix-back">
                    ← 戻って直す
                  </button>
                  <button className="big go" disabled={busy} onClick={send} data-testid="fix-send">
                    {busy ? "送っています…" : "この内容で送る"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
        {step === "sent" && sent && (
          <section className="fix-step" data-testid="fix-sent">
            <h1>直しの依頼を残しました</h1>
            <p>
              版 {sent.version} の {at + 1} コマ目への依頼を、監査の記録 ④ 人の直し（{sent.n} 行目）に残しました。
            </p>
            <a className="big" href={`#/t/${encodeURIComponent(tenant)}/audit/${encodeURIComponent(card.id)}`} data-testid="fix-audit">
              記録を見る
            </a>
          </section>
        )}
      </Slide>
      {err && <p className="err">{err}</p>}
    </article>
  );
}
