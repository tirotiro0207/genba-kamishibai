// 枠と指示の画面（044a・工程 7）。監修者が直したいコマを選び、指かマウスで直したい部分を枠で囲む。
// 「ここをこうしたい」は大きな欄に書くか、端末の音声入力（キーボードのマイク）で話す。送る前に、枠と文字を並べて確かめてから送る。
// 送った依頼は監査の記録 ④ に残る。続けて「この 1 枚を作り直す」で、枠に入った部品だけを作り直す（044b。1 枚 5 回まで）。
// 「言葉で直す」（11/6）では、部品を選ばずに、カード全体か 1 コマを話すか書いて作り直す（WordsEdit.tsx）。
import { useEffect, useRef, useState } from "react";
import type { CardBody } from "../../shared/card";
import { boxFrom, FIX_BOX_MIN, type FixBox } from "../../shared/fix";
import { cutFrames, type MotionJson } from "../../shared/picto/motion";
import { renderFrame } from "../../shared/picto/scene";
import { req } from "../make/MakeScreen";
import { Slide } from "../motion/Slide";
import { TouchEdit } from "./TouchEdit";
import { WordsEdit } from "./WordsEdit";
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
  const [redone, setRedone] = useState<{ version: number; redo: { parts: string[]; count: number; left: number } } | null>(null);
  // 直し方（11/6）: なぞって AI に頼むか、指で部品を動かすか、言葉でカード全体か 1 コマを直すか
  const [mode, setMode] = useState<"ask" | "touch" | "words">("ask");
  const [note, setNote] = useState("");
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

  async function redo() {
    setBusy(true);
    setErr("");
    try {
      const out = await req<CardView & { redo: { parts: string[]; count: number; left: number } }>(tenant, `/cards/${encodeURIComponent(cardId)}/redo`, { method: "POST", body: JSON.stringify({ n: sent!.n }) });
      setCard(out);
      setRedone(out);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // 指で動かした絵を保存する（版が 1 つ上がり、④ に前後が残る）
  async function saveTouch(json: MotionJson, reason: string) {
    setBusy(true);
    setErr("");
    try {
      const out = await req<CardView>(tenant, `/cards/${encodeURIComponent(cardId)}`, { method: "PUT", body: JSON.stringify({ card: { ...card!.body, motion: { kind: "keyframes", json } }, reason }) });
      setCard(out);
      setNote(`版 ${out.version} にしました。直しの記録 ④ に前後が残り、確かめる AI に見せ直すまで確認待ちです`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // 言葉で直す（11/6）。作り直した絵が出て版が上がる。戻すのは「1 つ前の版に戻す」
  async function sendWords(words: string, frame: number | null) {
    const out = await req<CardView & { rework: { count: number; left: number } }>(tenant, `/cards/${encodeURIComponent(cardId)}/rework`, { method: "POST", body: JSON.stringify({ text: words, frame }) });
    setCard(out);
    setNote("");
    return out;
  }

  // 1 つ前の版に戻す（11/6）。戻すのも直しの 1 つで、④ に理由・直した人・日時が残る（記録は消さない）
  async function undo() {
    setBusy(true);
    setErr("");
    try {
      const out = await req<CardView>(tenant, `/cards/${encodeURIComponent(cardId)}/undo`, { method: "POST", body: JSON.stringify({}) });
      setCard(out);
      setBox(null);
      setRedone(null);
      setNote(`1 つ前の版の中身に戻し、版 ${out.version} にしました（直しの記録 ④ に残りました）`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const undoBar = (
    <div className="fix-undo">
      <span className="done" data-testid="fix-version">
        今は版 {card.version}
      </span>
      <button className="pick" disabled={busy || card.version <= 1} onClick={undo} data-testid="fix-undo">
        ↶ 1 つ前の版に戻す
      </button>
    </div>
  );

  return (
    <article className="fix" data-testid="fix" data-card={card.id}>
      <Slide k={step} dir={step === "draw" ? -1 : 1}>
        {step === "draw" && (
          <section className="fix-step" data-testid="fix-draw">
            <h1>{mode === "ask" ? "直したい部分を枠で囲む" : mode === "touch" ? "部品をタップして、指で動かす" : "どう直したいかを、言葉で伝える"}</h1>
            {undoBar}
            <nav className="fix-frames" aria-label="直し方">
              <button className={`pick${mode === "ask" ? " on" : ""}`} onClick={() => setMode("ask")} data-testid="fix-mode-ask">
                なぞって AI に頼む
              </button>
              <button className={`pick${mode === "touch" ? " on" : ""}`} onClick={() => setMode("touch")} data-testid="fix-mode-touch">
                指で動かす
              </button>
              <button className={`pick${mode === "words" ? " on" : ""}`} onClick={() => setMode("words")} data-testid="fix-mode-words">
                言葉で直す
              </button>
              <a className="card-show" href={`#/t/${encodeURIComponent(tenant)}/pose/${encodeURIComponent(card.id)}`} data-testid="fix-to-pose">
                つまみで角度まで動かす
              </a>
            </nav>
            {note && (
              <p className="saved" data-testid="fix-note">
                {note}
              </p>
            )}
            {mode !== "words" && (
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
            )}
            {mode === "words" ? (
              <WordsEdit body={b} version={card.version} busy={busy} setBusy={setBusy} onSend={sendWords} />
            ) : mode === "touch" ? (
              <TouchEdit key={`${card.version}-${at}`} body={b} at={at} busy={busy} onSave={saveTouch} />
            ) : (
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
            )}
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
            {redone ? (
              <>
                <div className="fix-face still fix-redone" data-testid="fix-redone" data-version={redone.version}>
                  <span dangerouslySetInnerHTML={{ __html: svg }} />
                </div>
                <p>
                  枠に入った部品だけを作り直し、版 {redone.version} にしました（{redone.redo.count} 回目・あと {redone.redo.left} 回）。確かめる AI に見せ直すまで確認待ちです。
                </p>
                <a className="big go" href={`#/t/${encodeURIComponent(tenant)}/card/${encodeURIComponent(card.id)}`} data-testid="fix-to-card">
                  カードを見る
                </a>
                <button
                  className="big"
                  disabled={busy}
                  onClick={async () => {
                    await undo();
                    setStep("draw");
                  }}
                  data-testid="fix-redo-undo"
                >
                  作り直す前に戻す
                </button>
              </>
            ) : (
              <button className="big go" disabled={busy} onClick={redo} data-testid="fix-redo">
                {busy ? "作り直しています…" : "この 1 枚を作り直す"}
              </button>
            )}
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
