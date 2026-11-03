// 会社のテナントに PIN で入る小さな部品（038）。入ったしるしを sessionStorage の token:<テナント> に残し、
// ほかの画面（req）がそれを付けて API を呼ぶ。PIN そのものはどこにも残さない。
// 会社のテナントは、テナントの PIN のあとに役割の PIN でも入る（052 の続き）。役割のしるしは role:<テナント> に残す。
import { type FormEvent, useCallback, useEffect, useState } from "react";
import "./pin.css";

export const tokenKey = (tenant: string) => `token:${tenant}`;
export const roleKey = (tenant: string) => `role:${tenant}`;

/** API の返したことばが「PIN で入ってください」「役割で入ってください」なら true（tenantGuard の 401・roleRequiredGate の 403） */
export const needsPin = (message: string) => message.includes("PIN で入って") || message.includes("役割で入って");

/** 監修者と教育担当（発行・監査の画面）、監修者だけ（署名の画面） */
export const REVIEWERS = [
  { value: "supervisor.1", label: "監修者 1" },
  { value: "supervisor.2", label: "監修者 2" },
  { value: "trainer.1", label: "教育担当" },
] as const;
export const SUPERVISORS = REVIEWERS.slice(0, 2);

/**
 * テナントの PIN が要るか（会社のテナントで、入ったしるしが無いか期限切れ）を /me で調べる。
 * 発行・署名・監査の画面は、要るときだけ下の 2 段の部品を出し、要らなければ今までの役を選ぶ欄を出す（088 の続き）
 */
export function useNeedsTenantPin(tenant: string): [boolean | null, () => void] {
  const [need, setNeed] = useState<boolean | null>(null);
  const check = useCallback(() => {
    const h: Record<string, string> = {};
    try {
      const tok = sessionStorage.getItem(tokenKey(tenant));
      if (tok) h.authorization = `Bearer ${tok}`;
    } catch {
      // 保存が使えない端末では、しるし無しで調べる
    }
    fetch(`/api/t/${encodeURIComponent(tenant)}/me`, { headers: h })
      .then(async (r) => setNeed(!r.ok && needsPin(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "")))
      .catch(() => setNeed(false));
  }, [tenant]);
  useEffect(check, [check]);
  return [need, check];
}

/** 画面で選べる役割。新入社員は閲覧の画面から入る */
export const STAFF = [
  { value: "author.1", label: "作者" },
  { value: "supervisor.1", label: "監修者 1" },
  { value: "supervisor.2", label: "監修者 2" },
  { value: "trainer.1", label: "教育担当" },
] as const;

const has = (key: string) => {
  try {
    return !!sessionStorage.getItem(key);
  } catch {
    return false;
  }
};

/** roles に選べる役割（value は「役割.番号」）。1 つなら選ぶ欄を出さない */
export function TenantPin({ tenant, onDone, roles = STAFF }: { tenant: string; onDone: () => void; roles?: readonly { value: string; label: string }[] }) {
  const [step, setStep] = useState<"tenant" | "role">(() => (has(tokenKey(tenant)) ? "role" : "tenant"));
  const [who, setWho] = useState<string>(roles[0].value);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function enter(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const base = `/api/t/${encodeURIComponent(tenant)}`;
      const headers: Record<string, string> = { "content-type": "application/json" };
      let res: Response;
      if (step === "tenant") res = await fetch(`${base}/session`, { method: "POST", headers, body: JSON.stringify({ pin }) });
      else {
        const [role, slot] = who.split(".");
        headers.authorization = `Bearer ${sessionStorage.getItem(tokenKey(tenant)) ?? ""}`;
        res = await fetch(`${base}/login`, { method: "POST", headers, body: JSON.stringify({ role, slot: Number(slot), pin }) });
      }
      const b = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      // テナントの入室の期限が切れていたら、テナントの PIN からやり直す
      if (step === "role" && res.status === 401 && b.error?.includes("PIN で入って")) {
        sessionStorage.removeItem(tokenKey(tenant));
        setStep("tenant");
        throw new Error("入り直してください");
      }
      if (!res.ok || !b.token) throw new Error(b.error ?? `HTTP ${res.status}`);
      try {
        sessionStorage.setItem(step === "tenant" ? tokenKey(tenant) : roleKey(tenant), b.token);
      } catch {
        throw new Error("この端末では入ったしるしを残せない");
      }
      setPin("");
      if (step === "tenant" && !has(roleKey(tenant))) setStep("role");
      else onDone();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pin" onSubmit={enter} data-testid="tenant-pin" data-step={step}>
      <h1>{step === "tenant" ? "会社のテナントに入る" : "役割で入る"}</h1>
      {step === "role" && roles.length > 1 && (
        <label>
          役割
          <select value={who} onChange={(e) => setWho(e.target.value)} data-testid="tenant-pin-role">
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        {step === "tenant" ? "PIN" : `${roles.find((r) => r.value === who)?.label ?? ""}の PIN`}
        <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" inputMode="numeric" autoComplete="off" data-testid="tenant-pin-input" />
      </label>
      <button className="big go" disabled={busy || !pin} data-testid="tenant-pin-enter">
        入る
      </button>
      {err && <p className="err">{err}</p>}
    </form>
  );
}
