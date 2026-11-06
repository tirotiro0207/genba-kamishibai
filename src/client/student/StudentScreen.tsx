// 新入社員だけが見る画面（11/6 作者）。#/t/<テナント>/student。ID（student_V_1 の形）と PIN で入ると、ここに来る。
// 今の回（いちばん新しい交差の回）に自分で加わってテストを受ける・絵のテストを受ける・署名済みのカードを見る、の 3 つだけを出す。
// 作る側の画面へのリンクは置かない。「ほかの ひとに かわる」で役割のしるしを消し、次の人が ID を入れ直せるようにする
import { useCallback, useEffect, useState } from "react";
import { req } from "../make/MakeScreen";
import { PinGate, NEWHIRE, roleKey } from "../pin/TenantPin";
import { joinTrial, openTrial } from "../trial/api";
import "./student.css";

const go = (tenant: string, path: string) => `#/t/${encodeURIComponent(tenant)}/${path}`;
const GROUP: Record<string, string> = { V: "ベトナム", M: "ミャンマー", J: "日本", C: "カンボジア" };

type Open = Awaited<ReturnType<typeof openTrial>>;

function Inside({ tenant }: { tenant: string }) {
  const [me, setMe] = useState<{ role: string | null; student?: string } | null>(null);
  const [open, setOpen] = useState<Open | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    req<{ role: string | null; student?: string }>(tenant, "/me").then(setMe, (e: Error) => setErr(e.message));
    // 読めないとき（役割のしるしが切れた・回線が切れた）は「まだ はじまって いません」にせず、わけを出す
    openTrial(tenant).then(setOpen, (e: Error) => setErr(e.message));
  }, [tenant]);
  useEffect(load, [load]);
  const leave = () => {
    try {
      sessionStorage.removeItem(roleKey(tenant));
    } catch {
      // 保存が使えない端末は、閉じれば消える
    }
    location.hash = go(tenant, "student");
    location.reload();
  };
  if (err && (!me || open === undefined))
    return (
      <div className="student" data-testid="student-err">
        <p className="err">{err}</p>
        <button className="big student-leave" onClick={leave} data-testid="student-leave">
          おわり（つぎの ひとに わたす）
        </button>
      </div>
    );
  if (!me || open === undefined) return <p>よみこみ中…</p>;
  // 作る側の人がこの画面に来たら、ホームへ戻す
  if (me.role !== "newhire" || !me.student) {
    return (
      <div className="student" data-testid="student-not">
        <p>この画面は 新入社員（ID で入った人）だけが つかいます。</p>
        <a className="big" href={go(tenant, "home")}>
          ← ホームへ
        </a>
        {/* ID の無い新入社員のしるしだと、ホームからまたここへ戻される。しるしを消して入り直せるようにする */}
        <button className="big student-leave" onClick={leave} data-testid="student-leave">
          おわり（つぎの ひとに わたす）
        </button>
      </div>
    );
  }
  const id = me.student;
  const start = async (to: "self" | "pictures") => {
    if (!open) return;
    setBusy(true);
    setErr("");
    try {
      await joinTrial(tenant, open.id);
      location.hash = go(tenant, `trial/${open.id}/${to}/${encodeURIComponent(id)}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="student" data-testid="student">
      <p className="student-who">
        <span className="student-id" data-testid="student-id">
          {id}
        </span>
        <span>{GROUP[id.split("_")[1]] ?? ""}</span>
      </p>
      <div className="student-actions">
        {open?.material ? (
          <button className="big go" disabled={busy} onClick={() => void start("self")} data-testid="student-test">
            テストを はじめる
          </button>
        ) : (
          <p className="done" data-testid="student-wait">
            テストは まだ はじまって いません。まって ください
          </p>
        )}
        {open && open.pictures > 0 && (
          <button className="big" disabled={busy} onClick={() => void start("pictures")} data-testid="student-pictures">
            えの テスト（{open.pictures} まい）
          </button>
        )}
        {/* 「カードを みる」は外した（11/6 朝 作者: 押しても何も出ない。テストの前に見ると答えが分かってしまう） */}
      </div>
      {err && <p className="err">{err}</p>}
      {/* 終わったら押して、次の人に渡す（11/6 朝 作者「よくわからない」から言葉を替えた） */}
      <button className="big student-leave" onClick={leave} data-testid="student-leave">
        おわり（つぎの ひとに わたす）
      </button>
    </div>
  );
}

export function StudentScreen({ tenant }: { tenant: string }) {
  return (
    <PinGate tenant={tenant} roles={NEWHIRE}>
      <Inside tenant={tenant} />
    </PinGate>
  );
}
