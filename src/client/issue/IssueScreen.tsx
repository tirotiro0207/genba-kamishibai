// 発行の画面（088）。監修者と教育担当が、署名済みのカードを配ったあとを見る。
// 署名済みの一覧（版・署名の日付・見た人）・止めるボタン（理由つき・監修者だけ）・回収の知らせ（教育担当が読んだ印を付ける）・今週の抜き取り。
// 役のしるしは sessionStorage の role:<テナント>（ほかの画面と同じ）。回収の知らせは版と署名の日付つきで印刷できる
import { useCallback, useEffect, useState } from "react";
import { req } from "../make/MakeScreen";
import "./issue.css";

const ROLE_LABEL: Record<string, string> = { "supervisor:1": "監修者 1", "supervisor:2": "監修者 2", "trainer:1": "教育担当" };
const ACTOR_LABEL: Record<string, string> = { "supervisor.1": "監修者 1", "supervisor.2": "監修者 2", "trainer.1": "教育担当", "newhire.1": "新入社員", anon: "役割なし" };
/** 見た記録は「役割#端末の番号」（088 の残り）。端末は頭の 4 文字だけ出す */
const who = (a: string | null) => {
  if (!a) return "";
  const [role, device] = a.split("#");
  const label = ACTOR_LABEL[role] ?? role;
  return device ? `${label}（端末 ${device.slice(0, 4)}）` : label;
};

/** 日本時間で出す（日付と時刻） */
const jst = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false }) : "—");
const jstDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }) : "—");

interface SignedCard {
  id: string;
  rule: string;
  version: number;
  signed_at: string;
  signed_by: string;
  viewers: number;
  views: number;
}
interface View {
  version: number;
  actor: string;
  first_viewed_at: string;
  last_viewed_at: string;
  views: number;
}
interface Recall {
  id: number;
  card_id: string;
  version: number;
  signed_at: string | null;
  rule: string;
  reason: string;
  stopped_by: string;
  stopped_at: string;
  read_at: string | null;
  read_by: string | null;
}
interface Sample {
  week: string;
  seed: string | null;
  pool: number;
  picks: { card_id: string; version: number; rule: string; signed_by: string; signed_by_name: string; signed_at: string; reviewer: string | null; reviewer_name: string }[];
}

function RolePick({ tenant, onDone }: { tenant: string; onDone: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const go = async (key: string) => {
    setErr("");
    const [role, slot] = key.split(":");
    try {
      const { token } = await req<{ token: string }>(tenant, "/login", { method: "POST", body: JSON.stringify({ role, slot: Number(slot), pin: pin || undefined }) });
      sessionStorage.setItem(`role:${tenant}`, token);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <section className="issue-pick" data-testid="issue-pick">
      <p>発行の画面は、監修者か教育担当の役で開きます</p>
      <label>
        PIN（会社のテナントだけ）
        <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" />
      </label>
      <div className="verdicts">
        {Object.entries(ROLE_LABEL).map(([k, v]) => (
          <button key={k} className="pick" onClick={() => go(k)} data-testid={`issue-as-${k.replace(":", "-")}`}>
            {v}
          </button>
        ))}
      </div>
      {err && <p className="err">{err}</p>}
    </section>
  );
}

function SampleBox({ sample }: { sample: Sample }) {
  return (
    <section className="issue-box" data-testid="issue-sample">
      <h2>今週の抜き取り（{sample.week}）</h2>
      {sample.picks.length === 0 ? (
        <p className="done">署名済みのカードがまだ無いので、抜き取りはありません</p>
      ) : (
        <>
          <p className="issue-meta">
            署名済み {sample.pool} 枚から乱数で {sample.picks.length} 枚。種 <code data-testid="issue-seed">{sample.seed}</code>
          </p>
          <ol className="issue-list">
            {sample.picks.map((p) => (
              <li key={p.card_id} data-testid={`issue-pick-${p.card_id}`}>
                <strong>{p.rule}</strong>
                <span className="issue-meta">
                  版 {p.version} ・ 署名 {jstDate(p.signed_at)} ・ 署名した人 {who(p.signed_by)}
                  {p.signed_by_name ? `（${p.signed_by_name}）` : ""}
                </span>
                <span className="issue-review" data-testid={`issue-reviewer-${p.card_id}`}>
                  見直す人: {who(p.reviewer)}
                  {p.reviewer_name ? `（${p.reviewer_name}）` : ""}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function CardRow({ tenant, c, canStop, onChanged }: { tenant: string; c: SignedCard; canStop: boolean; onChanged: () => void }) {
  const [views, setViews] = useState<View[] | null>(null);
  const [stopping, setStopping] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const toggleViews = async () => {
    if (views) return setViews(null);
    try {
      setViews((await req<{ views: View[] }>(tenant, `/issue/cards/${encodeURIComponent(c.id)}/views`)).views);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const stop = async () => {
    setErr("");
    try {
      await req(tenant, `/cards/${encodeURIComponent(c.id)}/status`, { method: "POST", body: JSON.stringify({ to: "stopped", reason: reason.trim() }) });
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <li className="issue-card" data-testid={`issue-card-${c.id}`}>
      <strong>{c.rule}</strong>
      <span className="issue-meta">
        版 {c.version} ・ 署名 {jstDate(c.signed_at)} ・ {who(c.signed_by)} ・ 見た端末 {c.viewers}（{c.views} 回）
      </span>
      <div className="issue-actions issue-noprint">
        <button className="pick" onClick={toggleViews} data-testid={`issue-viewers-${c.id}`}>
          {views ? "見た人を閉じる" : "見た人"}
        </button>
        {canStop && !stopping && (
          <button className="pick" onClick={() => setStopping(true)} data-testid={`issue-stop-${c.id}`}>
            止める
          </button>
        )}
      </div>
      {views && (
        <ul className="issue-views" data-testid={`issue-views-${c.id}`}>
          {views.length === 0 && <li className="done">まだ誰も見ていません</li>}
          {views.map((v) => (
            <li key={`${v.version}-${v.actor}`}>
              {who(v.actor)} ・ 版 {v.version} ・ 初めて {jst(v.first_viewed_at)} ・ 最後 {jst(v.last_viewed_at)} ・ {v.views} 回
            </li>
          ))}
        </ul>
      )}
      {stopping && (
        <div className="issue-stop issue-noprint">
          <label>
            止める理由（回収の知らせに載ります）
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} data-testid={`issue-reason-${c.id}`} />
          </label>
          <div className="issue-actions">
            <button className="pick on danger" disabled={!reason.trim()} onClick={stop} data-testid={`issue-stop-go-${c.id}`}>
              このカードを止める
            </button>
            <button className="pick" onClick={() => setStopping(false)}>
              やめる
            </button>
          </div>
        </div>
      )}
      {err && <p className="err">{err}</p>}
    </li>
  );
}

function RecallRow({ tenant, r, canRead, onChanged }: { tenant: string; r: Recall; canRead: boolean; onChanged: () => void }) {
  const [err, setErr] = useState("");
  const markRead = async () => {
    try {
      await req(tenant, `/issue/recalls/${r.id}/read`, { method: "POST", body: "{}" });
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <li className={`issue-recall${r.read_at ? " read" : ""}`} data-testid={`issue-recall-${r.card_id}`}>
      <strong>{r.rule}</strong>
      <span className="issue-recall-key" data-testid={`issue-recall-key-${r.card_id}`}>
        回収するカード: 版 {r.version} ・ 署名 {jstDate(r.signed_at)}
      </span>
      <span>理由: {r.reason || "（書かれていません）"}</span>
      <span className="issue-meta">
        止めた人 {who(r.stopped_by)} ・ {jst(r.stopped_at)}
      </span>
      {r.read_at ? (
        <span className="issue-meta" data-testid={`issue-recall-done-${r.card_id}`}>
          読みました（{who(r.read_by)} ・ {jst(r.read_at)}）
        </span>
      ) : (
        canRead && (
          <button className="pick on issue-noprint" onClick={markRead} data-testid={`issue-recall-read-${r.card_id}`}>
            読んだ
          </button>
        )
      )}
      {err && <p className="err">{err}</p>}
    </li>
  );
}

function Board({ tenant, me }: { tenant: string; me: { role: string } }) {
  const [cards, setCards] = useState<SignedCard[] | null>(null);
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [sample, setSample] = useState<Sample | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const [c, r, s] = await Promise.all([
        req<{ cards: SignedCard[] }>(tenant, "/issue/cards"),
        req<{ recalls: Recall[] }>(tenant, "/issue/recalls"),
        req<Sample>(tenant, "/issue/sample", { method: "POST", body: "{}" }),
      ]);
      setCards(c.cards);
      setRecalls(r.recalls);
      setSample(s);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [tenant]);
  useEffect(() => {
    void load();
  }, [load]);
  if (err) return <p className="err">{err}</p>;
  if (!cards || !sample) return <p>読み込み中…</p>;
  const unread = recalls.filter((x) => !x.read_at).length;
  return (
    <div className="issue" data-testid="issue">
      <h1>発行の管理</h1>
      <section className="issue-box">
        <h2>
          回収の知らせ
          {unread > 0 && (
            <span className="issue-badge" data-testid="issue-unread">
              未読 {unread}
            </span>
          )}
        </h2>
        {recalls.length === 0 ? (
          <p className="done">回収の知らせはありません</p>
        ) : (
          <>
            <ul className="issue-list" data-testid="issue-recalls">
              {recalls.map((r) => (
                <RecallRow key={r.id} tenant={tenant} r={r} canRead={me.role === "trainer"} onChanged={load} />
              ))}
            </ul>
            <button className="pick issue-noprint" onClick={() => window.print()}>
              印刷する
            </button>
          </>
        )}
      </section>
      <SampleBox sample={sample} />
      <section className="issue-box issue-noprint-box">
        <h2>署名済みのカード（{cards.length} 枚）</h2>
        {cards.length === 0 ? (
          <p className="done">署名済みのカードはありません</p>
        ) : (
          <ul className="issue-list" data-testid="issue-cards">
            {cards.map((c) => (
              <CardRow key={c.id} tenant={tenant} c={c} canStop={me.role === "supervisor"} onChanged={load} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function IssueScreen({ tenant }: { tenant: string }) {
  const [me, setMe] = useState<{ role: string | null } | undefined>(undefined);
  const check = useCallback(() => {
    req<{ role: string | null }>(tenant, "/me").then(setMe, () => setMe({ role: null }));
  }, [tenant]);
  useEffect(check, [check]);
  if (!me) return <p>読み込み中…</p>;
  if (me.role !== "supervisor" && me.role !== "trainer") return <RolePick tenant={tenant} onDone={check} />;
  return <Board tenant={tenant} me={{ role: me.role }} />;
}
