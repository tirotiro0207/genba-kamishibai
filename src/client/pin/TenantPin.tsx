// 会社のテナントに PIN で入る小さな部品（038）。入ったしるしを sessionStorage の token:<テナント> に残し、
// ほかの画面（req）がそれを付けて API を呼ぶ。PIN そのものはどこにも残さない。
// 会社のテナントは、テナントの PIN のあとに役割の PIN でも入る（052 の続き）。役割のしるしは role:<テナント> に残す。
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { Backdrop } from "../login/Backdrop";
import { RolePicker } from "./RolePicker";
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

/** 入ったしるし（テナントの PIN）と役割のしるしを付けた見出し。しるしが無ければ付けない */
export function authHeaders(tenant: string): Record<string, string> {
  const h: Record<string, string> = {};
  try {
    const tok = sessionStorage.getItem(tokenKey(tenant));
    if (tok) h.authorization = `Bearer ${tok}`;
    const role = sessionStorage.getItem(roleKey(tenant));
    if (role) h["x-role"] = role;
  } catch {
    // 保存が使えない端末では、しるし無しで呼ぶ
  }
  return h;
}

/**
 * テナントの PIN の段が要るか（会社のテナントで、入ったしるしが無いか期限切れか、役割のしるしが無い）を GET /session で調べる。
 * /session はいつも 200 で答えるので、入る前に 401 を出さない（総点検の 9）。
 * 発行・署名・監査の画面（088 の続き）と、閲覧・回答の記録の画面（総点検の 2・9）が使う
 */
export function useNeedsTenantPin(tenant: string): [boolean | null, () => void] {
  const [need, setNeed] = useState<boolean | null>(null);
  const check = useCallback(() => {
    const h = authHeaders(tenant);
    fetch(`/api/t/${encodeURIComponent(tenant)}/session`, { headers: h })
      .then(async (r) => {
        const b = (await r.json().catch(() => ({}))) as { pin?: boolean; valid?: boolean };
        setNeed(!!b.pin && (!b.valid || !h["x-role"]));
      })
      .catch(() => setNeed(false));
  }, [tenant]);
  useEffect(check, [check]);
  return [need, check];
}

/** 会社のテナントでは、入ったしるしがそろうまで 2 段の PIN の画面を出し、そろったら中身を出す */
export function PinGate({ tenant, roles, children }: { tenant: string; roles?: readonly { value: string; label: string }[]; children: ReactNode }) {
  const [need, check] = useNeedsTenantPin(tenant);
  if (need === null) return <p>読み込み中…</p>;
  if (need) return <TenantPin tenant={tenant} roles={roles} onDone={check} />;
  return <>{children}</>;
}

/** 画面で選べる役割。新入社員は閲覧の画面から入る */
export const STAFF = [
  { value: "author.1", label: "作者" },
  { value: "supervisor.1", label: "監修者 1" },
  { value: "supervisor.2", label: "監修者 2" },
  { value: "trainer.1", label: "教育担当" },
] as const;
/** 新入社員（11/6 作者）。選んで「次へ」を押すと、ID と PIN を入れる段に進む */
export const NEWHIRE = [{ value: "newhire.1", label: "新入社員" }] as const;
/** 入口（ホーム）で選べる役割。作る側と新入社員 */
export const ENTRY = [...STAFF, ...NEWHIRE] as const;
/** 入ったしるしを両方消して入口に戻る（11/6 作者「ログアウトができるかどうか」）。PIN そのものは残していない */
export function logout(tenant: string) {
  try {
    sessionStorage.removeItem(roleKey(tenant));
    sessionStorage.removeItem(tokenKey(tenant));
  } catch {
    // 保存が使えない端末は、閉じれば消える
  }
  location.hash = `#/t/${encodeURIComponent(tenant)}/home`;
  location.reload();
}
/** 新入社員だけが見る画面 */
export const studentHome = (tenant: string) => `#/t/${encodeURIComponent(tenant)}/student`;

const has = (key: string) => {
  try {
    return !!sessionStorage.getItem(key);
  } catch {
    return false;
  }
};

/** roles に選べる役割（value は「役割.番号」）。1 つなら選ぶ欄を出さない */
export function TenantPin({ tenant, onDone, roles = STAFF }: { tenant: string; onDone: () => void; roles?: readonly { value: string; label: string }[] }) {
  const [step, setStep] = useState<"tenant" | "role" | "student">(() => (has(tokenKey(tenant)) ? (roles.length === 1 && roles[0].value.startsWith("newhire") ? "student" : "role") : "tenant"));
  const [who, setWho] = useState<string>(roles[0].value);
  // 新入社員の ID（11/6 作者）。student_V_1 の形。前もって作らず、入ったときにその場で決まる
  const [student, setStudent] = useState("");
  const isStudent = who.startsWith("newhire");
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
        res = await fetch(`${base}/login`, { method: "POST", headers, body: JSON.stringify({ role, slot: Number(slot), pin, ...(isStudent ? { student: student.trim() } : {}) }) });
      }
      const b = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      // テナントの入室の期限が切れていたら、テナントの PIN からやり直す
      if (step !== "tenant" && res.status === 401 && b.error?.includes("PIN で入って")) {
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
      // テナントの PIN で入り直したら、前の人の役割のしるしは使わず、役割を選ぶ段を必ず出す（11/6 作者: 監修者を選ぶ画面が出なかった）
      if (step === "tenant") {
        try {
          sessionStorage.removeItem(roleKey(tenant));
        } catch {
          // 保存が使えない端末は、閉じれば消える
        }
        setStep(roles.length === 1 && isStudent ? "student" : "role");
      } else onDone();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // 新入社員を選んで「次へ」を押すと、ID と PIN の段へ（11/6 作者「生徒は押したら次のページに、生徒の ID、そして PIN」）
  const next = (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setPin("");
    setStep("student");
  };

  // 後ろは入口と同じ顔のカードの背景（11/5 作者「あれをデフォルトに」）。フォームは画面の真ん中
  return (
    <>
    <Backdrop />
    <form className="pin" onSubmit={step === "role" && isStudent ? next : enter} data-testid="tenant-pin" data-step={step}>
      <h1>{step === "tenant" ? "会社のテナントに入る" : step === "student" ? "新入社員で入る" : "役割で入る"}</h1>
      {step === "role" && roles.length > 1 && (
        <div className="pin-field">
          <span className="pin-cap">役割</span>
          <RolePicker roles={roles} value={who} onChange={setWho} />
        </div>
      )}
      {step === "student" && (
        <label>
          ID（れい: student_V_1）
          <input value={student} onChange={(e) => setStudent(e.target.value.replace(/\s/g, ""))} autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="student_V_1" data-testid="tenant-pin-student" />
        </label>
      )}
      {!(step === "role" && isStudent) && (
        <label>
          {step === "tenant" ? "PIN" : step === "student" ? "PIN" : `${roles.find((r) => r.value === who)?.label ?? ""}の PIN`}
          <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" inputMode="numeric" autoComplete="off" data-testid="tenant-pin-input" />
        </label>
      )}
      {step === "role" && isStudent ? (
        <button className="big go" data-testid="tenant-pin-next">
          次へ
        </button>
      ) : (
        <button className="big go" disabled={busy || !pin || (step === "student" && !student.trim())} data-testid="tenant-pin-enter">
          入る
        </button>
      )}
      {step === "student" && roles.length > 1 && (
        <button type="button" className="pin-back" onClick={() => setStep("role")} data-testid="tenant-pin-back">
          ← 役割を選び直す
        </button>
      )}
      {err && <p className="err">{err}</p>}
    </form>
    </>
  );
}
