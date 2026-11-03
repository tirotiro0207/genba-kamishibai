// 公開デモの入口（093b）。架空の会社だけを見せる。「完成品を見る」は署名済みのカードの閲覧へ、
// 「その場で作る」は入れた文から 1 枚の下書きを作る（同じ所から 1 日 3 回まで・1 回 1 枚まで）。API キーは要らない。
// 「時間を計って答える」「絵だけで答える」は、見る人が新入社員と同じように試して、新入社員の匿名の結果と並べる（094）
import { useState } from "react";
import "./demo.css";

const SAMPLE = "脚立の上で作業するときは、もう 1 人が下で脚立を押さえる。\n脚立が倒れると、落ちて大けがをするから。";
const MAX = 1000;

export function DemoScreen() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(SAMPLE);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [made, setMade] = useState<string | null>(null);

  async function make() {
    setBusy(true);
    setErr("");
    setMade(null);
    try {
      const res = await fetch("/api/demo/make", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? `HTTP ${res.status}`);
      setMade(body.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="demo" data-testid="demo">
      <h1>現場の紙芝居</h1>
      <p className="demo-lead">架空の電気工事会社のデモです。資料の決まりを、文字の無い絵のカードにします。</p>
      <div className="demo-doors">
        <a className="big go" href="#/t/demo/read" data-testid="demo-view">
          完成品を見る
        </a>
        <button type="button" className="big" onClick={() => setOpen(true)} disabled={open} data-testid="demo-make-open">
          その場で作る
        </button>
      </div>
      <div className="demo-doors">
        <a className="big" href="#/demo/time" data-testid="demo-try-time">
          時間を計って答える
        </a>
        <a className="big" href="#/demo/picture" data-testid="demo-try-picture">
          絵だけで答える
        </a>
      </div>
      {open && (
        <div className="lane demo-make">
          <label>
            決まりを書いた文（{text.length} / {MAX} 字）
            <textarea rows={5} value={text} maxLength={MAX} onChange={(e) => setText(e.target.value)} data-testid="demo-text" />
          </label>
          <p className="done">同じ所からは 1 日 3 回まで。1 回で作るのは、最初の決まりの 1 枚だけです。1 分ほどかかります。</p>
          <button type="button" className="big go" onClick={make} disabled={busy || !text.trim()} data-testid="demo-make">
            {busy ? "作っています…" : "カードを作る"}
          </button>
          {err && <p className="err" role="alert">{err}</p>}
          {made && (
            <p className="saved">
              できました（AI の下書き・署名はまだ）。 <a href={`#/t/demo/card/${made}`} data-testid="demo-made">作ったカードを見る</a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
