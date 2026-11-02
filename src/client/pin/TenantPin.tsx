// 会社のテナントに PIN で入る小さな部品（038）。入ったしるしを sessionStorage の token:<テナント> に残し、
// ほかの画面（req）がそれを付けて API を呼ぶ。PIN そのものはどこにも残さない。
import { type FormEvent, useState } from "react";
import "./pin.css";

export const tokenKey = (tenant: string) => `token:${tenant}`;

/** API の返したことばが「PIN で入ってください」なら true（tenantGuard の 401） */
export const needsPin = (message: string) => message.includes("PIN で入って");

export function TenantPin({ tenant, onDone }: { tenant: string; onDone: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function enter(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/t/${encodeURIComponent(tenant)}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) });
      const b = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok || !b.token) throw new Error(b.error ?? `HTTP ${res.status}`);
      try {
        sessionStorage.setItem(tokenKey(tenant), b.token);
      } catch {
        throw new Error("この端末では入ったしるしを残せない");
      }
      setPin("");
      onDone();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pin" onSubmit={enter} data-testid="tenant-pin">
      <h1>会社のテナントに入る</h1>
      <label>
        PIN
        <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" inputMode="numeric" autoComplete="off" data-testid="tenant-pin-input" />
      </label>
      <button className="big go" disabled={busy || !pin} data-testid="tenant-pin-enter">
        入る
      </button>
      {err && <p className="err">{err}</p>}
    </form>
  );
}
