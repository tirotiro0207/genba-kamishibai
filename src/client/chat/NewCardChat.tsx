// 新しいカードを作るチャット（11/5 作者）。#/t/<テナント>/new（始める）と #/t/<テナント>/new/<チャット>（続き）。
// 下の欄に、資料（PDF・Word・文字のファイル）を添付し、自然な言葉で指示を書いて送る。送るたびに、添付した資料ぜんぶから決まりを取り出し直して返事にする。
// 返事の決まりに印を付けて「選んだ決まりでカードを作る」を押すと、1 つずつ下書きのカードになる（今までの /extract の OK と作成を使う）
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { req } from "../make/MakeScreen";
import { ACCEPT, ACCEPT_LABEL, type Attached, readAttachment } from "./files";
import "./chat.css";

type Msg = { role: "user"; text: string; files: string[]; at: string } | { role: "assistant"; text: string; extraction?: string; rules?: number; at: string };
interface Chat {
  id: string;
  messages: Msg[];
  files: { name: string; chars: number }[];
}
interface Rule {
  kind: "do" | "dont";
  text: string;
  where: { page: number | null; line: number };
  reasons: { text: string; stated: boolean }[];
}

const home = (tenant: string) => `#/t/${encodeURIComponent(tenant)}/home`;

function Rules({ tenant, id, latest }: { tenant: string; id: string; latest: boolean }) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [on, setOn] = useState<number[]>([]);
  const [busy, setBusy] = useState("");
  // 作り終えた決まりの番号。途中で失敗（鍵切れ・502・回数制限）しても、残りだけを作り直せるように覚えておく
  const [done, setDone] = useState<number[]>([]);
  const [oked, setOked] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    // 11/7 作者: 最初から全部に印を付けておき、作らないものだけ外してもらう
    req<{ rules: Rule[] }>(tenant, `/extract/${id}`).then((x) => {
      setRules(x.rules);
      setOn(x.rules.map((_, i) => i));
    }, (e: Error) => setErr(e.message));
  }, [tenant, id]);
  if (err && !rules) return <p className="err">{err}</p>;
  if (!rules) return <p className="chat-wait">読み込み中…</p>;
  if (!rules.length) return null;
  const made = done.length;
  const left = on.filter((i) => !done.includes(i));
  const make = async () => {
    setErr("");
    try {
      if (!oked) {
        await req(tenant, `/extract/${id}/ok`, { method: "POST", body: JSON.stringify({ items: on }) });
        setOked(true);
      }
      let k = done.length;
      for (const item of left) {
        setBusy(`カードを作っています（${k + 1} / ${on.length}）`);
        await req(tenant, `/extract/${id}/make`, { method: "POST", body: JSON.stringify({ item }) });
        k += 1;
        setDone((xs) => [...xs, item]);
      }
      setBusy("");
    } catch (e) {
      setBusy("");
      setErr((e as Error).message);
    }
  };
  return (
    <div className={`chat-rules${latest ? "" : " old"}`} data-testid={`chat-rules-${id}`}>
      <ul>
        {rules.map((r, i) => (
          <li key={i}>
            <label>
              <input type="checkbox" checked={on.includes(i)} disabled={!!busy || oked} onChange={(e) => setOn((xs) => (e.target.checked ? [...xs, i].sort((a, b) => a - b) : xs.filter((x) => x !== i)))} data-testid={`chat-rule-${i}`} />
              <span className={`chat-kind ${r.kind}`}>{r.kind === "do" ? "する" : "しない"}</span>
              <span className="chat-rule-text">{r.text}</span>
            </label>
            <span className="chat-where">{r.where.page ? `${r.where.page} ページ ${r.where.line} 行目` : `${r.where.line} 行目`}{r.reasons.length ? `・理由 ${r.reasons.map((x) => x.text).join("／")}` : ""}</span>
          </li>
        ))}
      </ul>
      {made > 0 && !busy && (
        <p className="chat-done" data-testid="chat-made">
          下書きのカードを {made} 枚作りました。<a href={home(tenant)}>カードの管理へ</a>
        </p>
      )}
      {/* 全部できるまでは押せるボタンを残す。途中で失敗したら、残りだけを作り直す */}
      {(on.length === 0 || left.length > 0) && (
        <button className="big go chat-make" disabled={!on.length || !!busy} onClick={make} data-testid="chat-make">
          {busy || (!on.length ? "カードにする決まりにチェックを付けてください" : made > 0 ? `残りの ${left.length} 枚を作り直す` : `これらのカードを作成する（${on.length} 枚）`)}
        </button>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}

export function NewCardChat({ tenant, chatId }: { tenant: string; chatId?: string }) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attached[]>([]);
  const [reading, setReading] = useState(0);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const pick = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatId) {
      setChat(null);
      return;
    }
    req<Chat>(tenant, `/chats/${chatId}`).then(setChat, (e: Error) => setErr(e.message));
  }, [tenant, chatId]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [chat?.messages.length, sending]);

  const attach = async (list: FileList | null) => {
    if (!list?.length) return;
    setErr("");
    for (const f of Array.from(list)) {
      setReading((n) => n + 1);
      try {
        const a = await readAttachment(tenant, f);
        setFiles((xs) => [...xs, a]);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setReading((n) => n - 1);
      }
    }
    if (pick.current) pick.current.value = "";
  };

  const send = async () => {
    if ((!text.trim() && !files.length) || sending || reading) return;
    setErr("");
    setSending(true);
    try {
      const id = chat?.id ?? (await req<Chat>(tenant, "/chats", { method: "POST", body: "{}" })).id;
      const next = await req<Chat>(tenant, `/chats/${id}/messages`, { method: "POST", body: JSON.stringify({ text: text.trim(), files }) });
      setChat(next);
      setText("");
      setFiles([]);
      if (!chatId) history.replaceState(null, "", `#/t/${encodeURIComponent(tenant)}/new/${id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  // Enter は改行。Ctrl（⌘）+ Enter で送る
  const key = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void send();
    }
  };

  const msgs = chat?.messages ?? [];
  const lastExtraction = [...msgs].reverse().find((m) => m.role === "assistant" && m.extraction) as { extraction?: string } | undefined;
  return (
    <div className="chat" data-testid="chat">
      <header className="chat-head">
        <a href={home(tenant)} className="chat-back" data-testid="chat-back">← カードの管理</a>
        <h1>新しいカード</h1>
        {chat && chat.files.length > 0 && <span className="chat-files-count">資料 {chat.files.length} 件</span>}
      </header>
      <div className="chat-log" data-testid="chat-log">
        {msgs.length === 0 && (
          <div className="chat-hello">
            <p>資料を添付するか、カードにしたい決まりを書いてください。</p>
            <p className="chat-sub">{ACCEPT_LABEL}を添付できます（貼り紙や注意書きの紙は、写真を撮ってそのまま添付できます）。送ると、カードにする決まりを箇条書きで返します。送ったあとも「この決まりは外して」「理由も入れて」のように、言葉で直していけます。</p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`} data-testid={`chat-msg-${i}`}>
            {m.role === "user" && m.files.length > 0 && (
              <div className="chat-chips">
                {m.files.map((f) => (
                  <span key={f} className="chat-chip">{/\.(jpe?g|png|webp|gif)$/i.test(f) ? "🖼" : "📄"} {f}</span>
                ))}
              </div>
            )}
            {m.text && <p>{m.text}</p>}
            {m.role === "assistant" && m.extraction && <Rules tenant={tenant} id={m.extraction} latest={m.extraction === lastExtraction?.extraction} />}
          </div>
        ))}
        {sending && <div className="chat-msg assistant chat-wait" data-testid="chat-thinking">資料を読んで、決まりを取り出しています…</div>}
        <div ref={end} />
      </div>
      <div className="chat-compose">
        {(files.length > 0 || reading > 0) && (
          <div className="chat-chips">
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="chat-chip" data-testid="chat-attached">
                📄 {f.name}
                <button aria-label={`${f.name} を外す`} onClick={() => setFiles((xs) => xs.filter((_, k) => k !== i))}>×</button>
              </span>
            ))}
            {reading > 0 && <span className="chat-chip wait">読み込み中…</span>}
          </div>
        )}
        <div className="chat-row">
          <button className="chat-attach" onClick={() => pick.current?.click()} aria-label="ファイルを添付" title={ACCEPT_LABEL} data-testid="chat-attach">
            ＋
          </button>
          <input ref={pick} type="file" accept={ACCEPT} multiple hidden onChange={(e) => void attach(e.target.files)} data-testid="chat-file" />
          <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={key} rows={2} placeholder="例: 高所作業の決まりだけカードにして" data-testid="chat-text" />
          <button className="chat-send" onClick={() => void send()} disabled={(!text.trim() && !files.length) || sending || reading > 0} data-testid="chat-send">
            送る
          </button>
        </div>
        {err && <p className="err" data-testid="chat-err">{err}</p>}
      </div>
    </div>
  );
}
