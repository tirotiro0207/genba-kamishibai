// 入れる画面（032・工程 1）と抜き出しの画面（033・工程 2〜3）。
// 入れる: 話した言葉（端末の音声入力で文字にしたもの）を大きな欄に入れるか、資料を添付する。
// 送る前に、入る文字を行番号付きで画面に出して確かめる。送ると決まりと「どこから」が出て、目で確かめて OK を押す。
import { useEffect, useState } from "react";
import { Slide } from "../motion/Slide";
import "./make.css";

type Source = { kind: "doc"; doc: string; pages: { page: number; lines: number }[] } | { kind: "speech" };
interface From {
  quote: string;
  line: number;
  line_end: number;
  found: boolean;
}
interface Where {
  page: number | null;
  line: number;
}
interface Rule {
  kind: "do" | "dont";
  text: string;
  from: From;
  where: Where;
  reasons: { text: string; from: From; stated: boolean; where: Where }[];
  checklist: boolean;
  reworded: boolean;
}

const api = (tenant: string, path: string) => `/api/t/${encodeURIComponent(tenant)}${path}`;
function headers(tenant: string): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  try {
    const tok = sessionStorage.getItem(`token:${tenant}`);
    if (tok) h.authorization = `Bearer ${tok}`;
    const role = sessionStorage.getItem(`role:${tenant}`);
    if (role) h["x-role"] = role;
  } catch {
    // 保存が使えない端末では、入ったしるし無しで呼ぶ
  }
  return h;
}
async function req<T>(tenant: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(api(tenant, path), { ...init, headers: { ...headers(tenant), ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

const where = (w: Where) => (w.page ? `${w.page} ページ ${w.line} 行` : `${w.line} 行目`);

/** 置き場にある、文字にした資料（031b の pdf/<名前>/index.json）の一覧 */
function useDocs(tenant: string) {
  const [docs, setDocs] = useState<string[]>([]);
  useEffect(() => {
    req<{ files: { path: string }[] }>(tenant, "/files?prefix=pdf/")
      .then((r) => setDocs(r.files.filter((f) => f.path.endsWith("/index.json")).map((f) => f.path.split("/")[1])))
      .catch(() => setDocs([]));
  }, [tenant]);
  return docs;
}

function InputStep({ tenant, onConfirm }: { tenant: string; onConfirm: (text: string, source: Source, focus: string) => void }) {
  const docs = useDocs(tenant);
  const [mode, setMode] = useState<"speech" | "doc">("speech");
  const [speech, setSpeech] = useState("");
  const [doc, setDoc] = useState("");
  const [pages, setPages] = useState("");
  const [focus, setFocus] = useState("");
  const [err, setErr] = useState("");

  async function readFile(f: File) {
    if (/\.(txt|md)$/i.test(f.name) || f.type.startsWith("text/")) {
      setSpeech(await f.text());
      setMode("speech");
      return;
    }
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      // PDF は置き場に入れ、手元のスクリプト（031b）でページの文字にしてから選ぶ
      const name = f.name.replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^[._-]+/, "") || "doc";
      const res = await fetch(api(tenant, `/files/inbox/${name}.pdf`), { method: "PUT", headers: { ...headers(tenant), "content-type": "application/pdf" }, body: f });
      setErr(res.ok ? `PDF を置き場に入れました（inbox/${name}.pdf）。ページの文字にしたあと、「資料から」で選べます` : `PDF を入れられない: ${res.status}`);
      return;
    }
    setErr("文字（.txt）か PDF を添付してください");
  }

  async function next() {
    setErr("");
    if (mode === "speech") {
      const t = speech.trim();
      if (!t) return setErr("文を入れてください");
      return onConfirm(t, { kind: "speech" }, focus);
    }
    const nums = parsePages(pages);
    if (!doc || !nums.length) return setErr("資料とページを選んでください");
    try {
      const got = await Promise.all(nums.map((p) => req<{ lines: { text: string }[] }>(tenant, `/files/pdf/${doc}/p${String(p).padStart(3, "0")}.json`)));
      const lines = got.flatMap((g) => g.lines.map((l) => l.text));
      onConfirm(lines.join("\n"), { kind: "doc", doc, pages: nums.map((p, i) => ({ page: p, lines: got[i].lines.length })) }, focus);
    } catch (e) {
      setErr(`ページを読めない: ${(e as Error).message}`);
    }
  }

  return (
    <section className="make" data-testid="make-input">
      <h1>入れる</h1>
      <div className="make-tabs" role="tablist">
        <button role="tab" aria-selected={mode === "speech"} className={`pick${mode === "speech" ? " on" : ""}`} onClick={() => setMode("speech")} data-testid="mode-speech">
          話す・書く
        </button>
        <button role="tab" aria-selected={mode === "doc"} className={`pick${mode === "doc" ? " on" : ""}`} onClick={() => setMode("doc")} data-testid="mode-doc">
          資料から
        </button>
      </div>
      <Slide k={mode} dir={mode === "doc" ? 1 : -1}>
        {mode === "speech" ? (
          <label>
            キーボードのマイク（音声入力）で話すか、文を書く
            <textarea className="make-big" rows={10} value={speech} onChange={(e) => setSpeech(e.target.value)} placeholder="例: 盤に触る前に、検電器で電気が来ていないか確かめる。感電するから。" data-testid="speech" />
          </label>
        ) : (
          <div className="make-doc">
            <label>
              資料
              <select value={doc} onChange={(e) => setDoc(e.target.value)} data-testid="doc">
                <option value="">選ぶ</option>
                {docs.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ページ（例: 27, 30-31）
              <input value={pages} onChange={(e) => setPages(e.target.value)} data-testid="pages" />
            </label>
          </div>
        )}
      </Slide>
      <label>
        資料を添付する（文字か PDF）
        <input type="file" accept=".txt,.md,.pdf,text/plain,application/pdf" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} data-testid="file" />
      </label>
      <label>
        テーマ（何ページもあるとき、どの決まりを取り出すか。空でもよい）
        <input value={focus} onChange={(e) => setFocus(e.target.value)} data-testid="focus" />
      </label>
      {err && <p className="err">{err}</p>}
      <button className="big" onClick={next} data-testid="to-confirm">
        文字を確かめる
      </button>
    </section>
  );
}

export function parsePages(s: string): number[] {
  const out = new Set<number>();
  for (const part of s.split(/[,、\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:[-〜~](\d+))?$/);
    if (!m) return [];
    const [a, b] = [Number(m[1]), Number(m[2] ?? m[1])];
    if (a < 1 || b < a || b - a > 20) return [];
    for (let p = a; p <= b; p++) out.add(p);
  }
  return [...out].sort((x, y) => x - y);
}

function ConfirmStep({ text, onBack, onSend, busy }: { text: string; onBack: () => void; onSend: () => void; busy: boolean }) {
  const lines = text.split("\n");
  return (
    <section className="make" data-testid="make-confirm">
      <h1>送る前に確かめる</h1>
      <p className="done">音声入力は専門の言葉を聞き違えることがあります。送る文字をここで確かめてください（{lines.length} 行・{text.replace(/\s/g, "").length} 字）。</p>
      <ol className="make-lines" data-testid="confirm-text">
        {lines.map((l, i) => (
          <li key={i}>{l || " "}</li>
        ))}
      </ol>
      <div className="make-nav">
        <button className="big" onClick={onBack} disabled={busy} data-testid="back">
          直す
        </button>
        <button className="big go" onClick={onSend} disabled={busy} data-testid="send">
          {busy ? "取り出しています…" : "送って取り出す"}
        </button>
      </div>
    </section>
  );
}

function ReviewStep({ tenant, id, text, rules, onDone }: { tenant: string; id: string; text: string; rules: Rule[]; onDone: (ok: number[]) => void }) {
  const lines = text.split("\n");
  const [ok, setOk] = useState<Set<number>>(new Set());
  const [lit, setLit] = useState<From | null>(null);
  const [err, setErr] = useState("");
  const toggle = (i: number) => setOk((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set([...s, i])));
  async function save() {
    try {
      const r = await req<{ ok: number[] }>(tenant, `/extract/${id}/ok`, { method: "POST", body: JSON.stringify({ items: [...ok] }) });
      onDone(r.ok);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <section className="make" data-testid="make-review">
      <h1>取り出した決まりを確かめる</h1>
      <div className="make-review">
        <ol className="make-rules" data-testid="rules">
          {rules.map((r, i) => (
            <li key={i} className={`make-rule${ok.has(i) ? " on" : ""}`} data-testid={`rule-${i}`}>
              <label className="make-ok">
                <input type="checkbox" checked={ok.has(i)} onChange={() => toggle(i)} data-testid={`ok-${i}`} />
                <span className="make-kind">{r.kind === "do" ? "やる" : "やらない"}</span>
                <span className="make-text">{r.text}</span>
              </label>
              <button className="make-from" onClick={() => setLit(r.from)} data-testid={`from-${i}`}>
                どこから: {where(r.where)}「{r.from.quote}」{r.from.found ? "" : "（元の文に見つからない）"}
              </button>
              {r.reasons.map((x, j) => (
                <button key={j} className="make-from why" onClick={() => setLit(x.from)}>
                  なぜ: {x.text}（{x.stated ? where(x.where) : "元の文に理由の言葉が無い"}）
                </button>
              ))}
              {(r.checklist || r.reworded) && (
                <p className="make-tags">
                  {r.checklist && <span>手元の✓</span>}
                  {r.reworded && <span>言い換えた</span>}
                </p>
              )}
            </li>
          ))}
        </ol>
        <ol className="make-lines src" data-testid="source">
          {lines.map((l, i) => {
            const on = lit && i + 1 >= lit.line && i + 1 <= lit.line_end;
            return (
              <li key={i} className={on ? "lit" : ""} data-lit={on ? "1" : undefined}>
                {l || " "}
              </li>
            );
          })}
        </ol>
      </div>
      {err && <p className="err">{err}</p>}
      <button className="big go" onClick={save} disabled={!ok.size} data-testid="save-ok">
        OK した {ok.size} 項目で作る
      </button>
    </section>
  );
}

export function MakeScreen({ tenant }: { tenant: string }) {
  const [step, setStep] = useState<"input" | "confirm" | "review" | "done">("input");
  const [text, setText] = useState("");
  const [source, setSource] = useState<Source>({ kind: "speech" });
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [x, setX] = useState<{ id: string; rules: Rule[] } | null>(null);
  const [ok, setOk] = useState<number[]>([]);

  async function send() {
    setBusy(true);
    setErr("");
    try {
      setX(await req<{ id: string; rules: Rule[] }>(tenant, "/extract", { method: "POST", body: JSON.stringify({ text, source, focus: focus || undefined }) }));
      go("review");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const order = ["input", "confirm", "review", "done"];
  const [dir, setDir] = useState(1);
  const go = (s: typeof step) => {
    setDir(order.indexOf(s) < order.indexOf(step) ? -1 : 1);
    setStep(s);
  };

  return (
    <>
      <Slide k={step} dir={dir}>
        {step === "input" && (
          <InputStep
            tenant={tenant}
            onConfirm={(t, s, f) => {
              setText(t);
              setSource(s);
              setFocus(f);
              go("confirm");
            }}
          />
        )}
        {step === "confirm" && <ConfirmStep text={text} busy={busy} onBack={() => go("input")} onSend={send} />}
        {step === "review" && x && (
          <ReviewStep
            tenant={tenant}
            id={x.id}
            text={text}
            rules={x.rules}
            onDone={(o) => {
              setOk(o);
              go("done");
            }}
          />
        )}
        {step === "done" && x && (
          <section className="make" data-testid="make-done">
            <h1>OK しました</h1>
            <p>
              {ok.length} 項目をカードにします（取り出しの番号 {x.id.slice(0, 8)}）。
            </p>
          </section>
        )}
      </Slide>
      {err && <p className="err">{err}</p>}
    </>
  );
}
