// 入口の画面（11/5 作者）。いきなり PIN を聞かず、まず 2 択にする。
// ① 「@ のあと」に会社の名前（英小文字）を入れて進む → その会社の PIN の 2 段へ
// ② ゲストで動作確認する（11/7 作者）→ その人だけの使い捨ての置き場を作り、作者の役で入って作る側の画面へ（見る側は出さない）
// 名前からテナントを引くのは GET /api/handle/<名前>。会社の名前はコードに書かず、DB の tenants.handle にだけある
import { type FormEvent, useState } from "react";
import { Backdrop } from "./Backdrop";
import "./login.css";

/** 名前から入ったあとに開く画面（発信する側の最初の画面） */
export const AFTER_LOGIN = "home";

export function LoginScreen() {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function go(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/handle/${encodeURIComponent(handle)}`);
      const b = (await res.json().catch(() => ({}))) as {
        tenant?: string;
        error?: string;
      };
      if (!res.ok || !b.tenant)
        throw new Error(b.error ?? `HTTP ${res.status}`);
      location.hash = `#/t/${encodeURIComponent(b.tenant)}/${AFTER_LOGIN}`;
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ゲストで動作確認する（11/7）。置き場を作り、作者の役で入る（練習用の置き場なので PIN は要らない）
  async function asGuest() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/guest", { method: "POST" });
      const b = (await res.json().catch(() => ({}))) as { tenant?: string; error?: string };
      if (!res.ok || !b.tenant) throw new Error(b.error ?? `HTTP ${res.status}`);
      const lr = await fetch(`/api/t/${encodeURIComponent(b.tenant)}/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "author", slot: 1 }) });
      const l = (await lr.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!lr.ok || !l.token) throw new Error(l.error ?? `HTTP ${lr.status}`);
      try {
        sessionStorage.setItem(`role:${b.tenant}`, l.token);
      } catch {
        // 保存が使えない端末は、ホームで役を選び直す
      }
      location.hash = `#/t/${encodeURIComponent(b.tenant)}/${AFTER_LOGIN}`;
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <Backdrop />
      {/* 入口の全部を 1 つの枠で包む（11/7 作者）。枠はログインしたあとの画面と同じ、黒のすりガラス */}
      <section className="login" data-testid="login">
        <h1>現場の紙芝居</h1>
        <form onSubmit={go} className="login-form">
          <label htmlFor="login-handle">ユーザー</label>
          <div className="login-handle">
            <span aria-hidden="true">@</span>
            <input
              id="login-handle"
              value={handle}
              onChange={(e) =>
                setHandle(
                  e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                )
              }
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              data-testid="login-handle"
            />
          </div>
          <button
            className="big go"
            disabled={busy || !handle}
            data-testid="login-go"
          >
            進む
          </button>
          {err && <p className="err">{err}</p>}
        </form>
        <p className="login-or">または</p>
        <button type="button" className="big login-guest" disabled={busy} onClick={() => void asGuest()} data-testid="login-guest">
          ゲストで動作確認する
        </button>
        <p className="login-note">ゲストは、あなただけの試しの置き場で、カードとキャラクターを作る側の画面を試せます（会社のカードは見えません）</p>
      </section>
    </>
  );
}
