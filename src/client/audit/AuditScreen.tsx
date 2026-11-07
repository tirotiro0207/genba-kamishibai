// 監査の記録の画面（041）。1 枚のカードの記録を ①元の文 → ②作成 → ③確かめ → ④人の直し → ⑤署名 の順に追う。
// 作者・監修者・教育担当の役で開く（サーバーの auditGate が通すのと同じ）（役のしるしは sessionStorage の role:<テナント>。ほかの画面と同じ）
import { useCallback, useEffect, useState } from "react";
import { STAFF, TenantPin, useNeedsTenantPin } from "../pin/TenantPin";

const STEPS: Record<number, string> = { 1: "① 元の文", 2: "② 作成", 3: "③ 確かめ", 4: "④ 人の直し", 5: "⑤ 署名" };
const KIND: Record<string, string> = { source: "元の文", make: "作成", verify: "確かめ", edit: "直し", sign: "署名", status: "状態", ai_draft: "AI 下書き", erase: "消した" };
const ROLE_LABEL: Record<string, string> = { "author:1": "作者", "supervisor:1": "監修者 1", "supervisor:2": "監修者 2", "trainer:1": "教育担当" };

interface Entry {
  chain: string;
  n: number;
  kind: string;
  step: number | null;
  actor: string;
  payload: unknown;
  created_at: string;
  hash: string;
}

/** 日本時間で出す */
const jst = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

const api = (tenant: string, path: string) => `/api/t/${encodeURIComponent(tenant)}${path}`;
const store = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      // 保存が使えない端末では、この画面を開いている間だけ
    }
  },
};
function headers(tenant: string, role: string | null): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  const tok = store.get(`token:${tenant}`);
  if (tok) h.authorization = `Bearer ${tok}`;
  if (role) h["x-role"] = role;
  return h;
}

/** 作者・監修者・教育担当の役で入る */
function RolePick({ tenant, onDone }: { tenant: string; onDone: (token: string) => void }) {
  // 会社のテナントで入ったしるしが無ければ、テナントの PIN → 役割の PIN の 2 段で入る
  const [needPin] = useNeedsTenantPin(tenant);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const go = async (key: string) => {
    const [role, slot] = key.split(":");
    setErr("");
    try {
      const res = await fetch(api(tenant, "/login"), { method: "POST", headers: headers(tenant, null), body: JSON.stringify({ role, slot: Number(slot), pin: pin || undefined }) });
      const b = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok || !b.token) return setErr(b.error ?? `HTTP ${res.status}`);
      store.set(`role:${tenant}`, b.token);
      onDone(b.token);
    } catch (e) {
      // 回線が切れたときも、黙らずに画面に出す
      setErr(`入れませんでした（${(e as Error).message}）`);
    }
  };
  if (needPin === null) return <p>読み込み中…</p>;
  if (needPin) return <TenantPin tenant={tenant} roles={STAFF} onDone={() => onDone(store.get(`role:${tenant}`) ?? "")} />;
  return (
    <div className="audit-pick" data-testid="audit-pick">
      <p>監査の記録は、作者・監修者・教育担当の役で開きます</p>
      <label>
        PIN（会社のテナントだけ）
        <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" />
      </label>
      <div className="verdicts">
        {Object.entries(ROLE_LABEL).map(([k, v]) => (
          <button key={k} className="pick" onClick={() => go(k)} data-testid={`audit-as-${k.replace(":", "-")}`}>
            {v}
          </button>
        ))}
      </div>
      {err && <p className="err">{err}</p>}
    </div>
  );
}

function Payload({ v }: { v: unknown }) {
  if (v === null || v === undefined) return null;
  return (
    <details>
      <summary>中身</summary>
      <pre className="audit-payload">{JSON.stringify(v, null, 2)}</pre>
    </details>
  );
}

export function AuditScreen({ tenant, cardId }: { tenant: string; cardId: string }) {
  const [role, setRole] = useState<string | null>(() => store.get(`role:${tenant}`));
  const [data, setData] = useState<{ entries: Entry[] } | null>(null);
  // 連鎖の確かめはテナント全部を読むので、カードの記録とは別に 1 回だけ呼ぶ（11/7）
  const [chainOk, setChainOk] = useState<boolean | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setErr("");
    const res = await fetch(api(tenant, `/audit/cards/${encodeURIComponent(cardId)}`), { headers: headers(tenant, role) });
    const b = await res.json();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) setRole(null);
      return setErr((b as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    setData(b as { entries: Entry[] });
  }, [tenant, cardId, role]);
  useEffect(() => {
    if (!role) return;
    fetch(api(tenant, "/audit/verify"), { headers: headers(tenant, role) })
      .then((r) => (r.ok ? (r.json() as Promise<{ ok: boolean }>) : null))
      .then((v) => setChainOk(v ? v.ok : null), () => setChainOk(null));
  }, [tenant, role]);
  useEffect(() => {
    if (role) load();
  }, [role, load]);

  if (!role) return <RolePick tenant={tenant} onDone={setRole} />;
  if (err) return <p className="err">{err}</p>;
  if (!data) return <p>読み込み中…</p>;
  const steps = [1, 2, 3, 4, 5].map((s) => ({ s, rows: data.entries.filter((e) => e.step === s) }));
  const other = data.entries.filter((e) => e.step === null);
  return (
    <div className="audit" data-testid="audit">
      <p className={chainOk === false ? "err" : chainOk ? "audit-ok" : "done"} data-testid="audit-chain">
        {chainOk === null ? "記録の連鎖: 確かめ中…" : chainOk ? "記録の連鎖: 途中の書き換え・消した跡は無い" : "記録の連鎖: 途中が書き換えられたか消されている"}
      </p>
      <p className="who">カード {cardId}</p>
      <ol className="audit-steps">
        {steps.map(({ s, rows }) => (
          <li key={s} className={rows.length ? "audit-step" : "audit-step empty"} data-testid={`audit-step-${s}`}>
            <h3>{STEPS[s]}</h3>
            {rows.length === 0 ? (
              <p className="done">まだ無い</p>
            ) : (
              rows.map((e) => (
                <div key={`${e.chain}-${e.n}`} className="audit-row">
                  <span>
                    {e.chain}#{e.n}
                  </span>{" "}
                  <span>{KIND[e.kind] ?? e.kind}</span> <span className="who">{e.actor}</span> <time>{jst(e.created_at)}</time>
                  <Payload v={e.payload} />
                </div>
              ))
            )}
          </li>
        ))}
      </ol>
      {other.length > 0 && (
        <section data-testid="audit-other">
          <h3>状態の移り変わりなど</h3>
          {other.map((e) => (
            <div key={`${e.chain}-${e.n}`} className="audit-row">
              <span>
                {e.chain}#{e.n}
              </span>{" "}
              <span>{KIND[e.kind] ?? e.kind}</span> <span className="who">{e.actor}</span> <time>{jst(e.created_at)}</time>
              <Payload v={e.payload} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
