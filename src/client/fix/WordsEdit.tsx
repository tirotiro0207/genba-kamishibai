// 言葉で直す（11/6）。監修者・作者が、カード全体か 1 コマを選び、「1 コマ目を作業している場面に替えて、への字の顔にして」のように
// 話すか書いて送ると、AI がそのとおりに絵を作り直し、新しい版にする。戻すのは画面の上の「1 つ前の版に戻す」。
// 監修者の画面なので、数字や絵の中身（JSON）は出さない。AI の答えの形が壊れていたときの細かい理由も出さず、言い直しを頼む。
import { useState } from "react";
import type { CardBody } from "../../shared/card";
import { cutFrames } from "../../shared/picto/motion";
import { frameSvg } from "../Safe";

/** 送る先（POST /:id/rework）。frame が null ならカード全体 */
export type SendWords = (text: string, frame: number | null) => Promise<{ version: number; rework: { count: number; left: number } }>;

/** サーバーの断りの文を、監修者に見せる言葉にする。回数と空の頼みはそのまま、ほかは言い直しを頼む */
export function wordsError(message: string): string {
  if (/回まで|頼み|カードが無い|鍵が無い/.test(message)) return message;
  return "うまく作り直せませんでした。言い方を変えて、もう一度送ってください（この失敗は回数に数えません）";
}

export function WordsEdit({ body, version, busy, setBusy, onSend }: { body: CardBody; version: number; busy: boolean; setBusy: (b: boolean) => void; onSend: SendWords }) {
  const [frame, setFrame] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [done, setDone] = useState("");
  const [err, setErr] = useState("");
  if (body.motion.kind !== "keyframes") return <p className="done">この絵は言葉で直せない（動きの HTML）</p>;
  const frames = cutFrames(body.motion.json);
  // 版が変わってコマが減ったら（1 つ前の版に戻したときなど）、選んでいたコマはカード全体に戻す
  const at = frame !== null && frame < frames.length ? frame : null;
  const shown = at === null ? frames.map((_, j) => j) : [at];

  async function send() {
    setBusy(true);
    setErr("");
    setDone("");
    try {
      const out = await onSend(text.trim(), at);
      setDone(`頼みのとおりに作り直し、版 ${out.version} にしました（言葉で直すのは ${out.rework.count} 回目・あと ${out.rework.left} 回）。確かめる AI に見せ直すまで確認待ちです。前の絵に戻すときは、上の「1 つ前の版に戻す」を押す`);
      setText("");
    } catch (e) {
      setErr(wordsError((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fix-words" data-testid="words">
      <nav className="fix-frames" aria-label="直す範囲">
        <button className={`pick${at === null ? " on" : ""}`} onClick={() => setFrame(null)} data-testid="words-scope-all">
          カード全体
        </button>
        {frames.map((f, j) => (
          <button key={f.t} className={`pick${at === j ? " on" : ""}`} onClick={() => setFrame(j)} data-testid={`words-scope-${j}`}>
            {j + 1} コマ目
          </button>
        ))}
      </nav>
      <div className="fix-main">
        <div className={`words-faces${shown.length > 1 ? " many" : ""}`} data-testid="words-faces" data-version={version}>
          {shown.map((j) => (
            <figure key={`${version}-${j}`} className="fix-face still">
              <span dangerouslySetInnerHTML={{ __html: frameSvg(frames[j].frame) }} />
              <figcaption>{j + 1} コマ目</figcaption>
            </figure>
          ))}
        </div>
        <div className="fix-side">
          <label>
            {at === null ? "カード全体を" : `${at + 1} コマ目を`}どう直したいか（キーボードのマイクで話すか、書く）
            <textarea
              className="fix-big"
              rows={7}
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              placeholder={at === null ? "例: 1 コマ目を作業している場面に替えて、への字の顔にして。2 コマ目は吹き出しに熱の絵を入れて" : "例: 人を真剣な顔にして、検電器を盤に当てているところにして"}
              data-testid="words-text"
            />
          </label>
          <button className="big go" disabled={busy || !text.trim()} onClick={send} data-testid="words-send">
            {busy ? "作り直しています（30 秒〜1 分）" : "送る"}
          </button>
          {busy && (
            <p className="done" role="status" data-testid="words-wait">
              作り直しています（30 秒〜1 分）。この画面のまま待ってください
            </p>
          )}
          {done && (
            <p className="saved" data-testid="words-done">
              {done}
            </p>
          )}
          {err && (
            <p className="err" data-testid="words-err">
              {err}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
