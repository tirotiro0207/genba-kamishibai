// 入口の画面（11/5 作者）。いきなり PIN を聞かず、まず 2 択にする。
// ① 「@ のあと」に会社の名前（英小文字）を入れて進む → その会社の PIN の 2 段へ
// ② ゲストで始める → 架空の会社の公開デモへ
// 名前からテナントを引くのは GET /api/handle/<名前>。会社の名前はコードに書かず、DB の tenants.handle にだけある
import { type FormEvent, useState } from "react";
import { Backdrop } from "./Backdrop";
import "./login.css";

/** 名前から入ったあとに開く画面（発信する側の最初の画面） */
export const AFTER_LOGIN = "issue";

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

  return (
    <>
      <Backdrop />
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
        <a className="big login-guest" href="#/demo" data-testid="login-guest">
          ゲストで始める
        </a>
      </section>
    </>
  );
}
