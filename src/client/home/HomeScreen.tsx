// ホーム（11/5 作者）。#/t/<テナント>/home。入口から名前で入ったあと、作る側（作者・監修者・教育担当）が最初に来る画面。
// 入る順: テナントの PIN → 役 → （まだ持っていなければ）キャラクターを作る画面 → ここ。
// 上のタブは「カードの管理」と「キャラクターの管理」。カードの管理は、新しいカードを作る（チャット）と、今までのカードのまとめ（作った日・決まり・状態）。
// まとめを押すと開いて、編集する・承認に出す・署名する・止めるが出る
import { useCallback, useEffect, useMemo, useState } from "react";
import { STATUS_LABEL, type CardStatus } from "../../shared/card";
import { characterSvg } from "../../shared/picto/character";
import { STANDING } from "../../shared/picto/skeleton";
import { AvatarSetup } from "../avatar/AvatarSetup";
import { type Avatar, loadAvatar } from "../avatar/store";
import { req } from "../make/MakeScreen";
import { STAFF, TenantPin, useNeedsTenantPin } from "../pin/TenantPin";
import "./home.css";

interface Card {
  id: string;
  status: CardStatus;
  version: number;
  created_at: string;
  updated_at: string;
  ask: string | null;
  body: { rule: string; why?: string; frames: unknown[] };
}
interface ChatSummary {
  id: string;
  updated_at: string;
  messages: { role: string; text: string }[];
  files: { name: string }[];
}

const ROLE_NAME: Record<string, string> = { author: "作者", supervisor: "監修者", trainer: "教育担当" };
const t = (tenant: string, path: string) => `#/t/${encodeURIComponent(tenant)}/${path}`;
/** D1 の時刻（UTC・"YYYY-MM-DD HH:MM:SS"）を日本時間の日付にする */
const day = (s: string) => new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short" });

function RolePick({ tenant, onDone }: { tenant: string; onDone: () => void }) {
  const [needPin] = useNeedsTenantPin(tenant);
  const [err, setErr] = useState("");
  if (needPin === null) return <p>読み込み中…</p>;
  if (needPin) return <TenantPin tenant={tenant} roles={STAFF} onDone={onDone} />;
  const go = async (value: string) => {
    const [role, slot] = value.split(".");
    try {
      const { token } = await req<{ token: string }>(tenant, "/login", { method: "POST", body: JSON.stringify({ role, slot: Number(slot) }) });
      sessionStorage.setItem(`role:${tenant}`, token);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <section className="home-pick" data-testid="home-pick">
      <p>どの役で入りますか</p>
      <div className="verdicts">
        {STAFF.map((r) => (
          <button key={r.value} className="pick" onClick={() => go(r.value)} data-testid={`home-as-${r.value.replace(".", "-")}`}>
            {r.label}
          </button>
        ))}
      </div>
      {err && <p className="err">{err}</p>}
    </section>
  );
}

function Face({ a }: { a: Avatar }) {
  const svg = useMemo(() => characterSvg({ angles: STANDING, x: 0, groundY: 434, height: 434, facing: "right", view: "front", role: "new", headwear: "none", hair: a.hair, face: a.face }), [a]);
  return <svg className="home-face" viewBox="-82 -54 164 164" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** 押したカードの中身と操作 */
function CardDetail({ tenant, card, role, onChanged }: { tenant: string; card: Card; role: string; onChanged: () => void }) {
  const [stopping, setStopping] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const move = async (to: CardStatus, why?: string) => {
    setErr("");
    try {
      await req(tenant, `/cards/${card.id}/status`, { method: "POST", body: JSON.stringify({ to, reason: why }) });
      setStopping(false);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const s = card.status;
  const canStop = s !== "stopped" && (s !== "signed" || role === "supervisor");
  return (
    <div className="home-detail" data-testid={`home-detail-${card.id}`}>
      {card.body.why && <p className="home-why">理由: {card.body.why}</p>}
      <p className="home-meta">
        {card.body.frames.length} コマ ・ 版 {card.version} ・ 最後に変えた日 {day(card.updated_at)}
      </p>
      {card.ask && <p className="home-ask">監修者に確認: {card.ask}</p>}
      <div className="home-actions">
        {s !== "signed" && s !== "stopped" && (
          <a className="pick" href={t(tenant, `card/${card.id}`)} data-testid="home-edit">
            編集する
          </a>
        )}
        {(s === "draft" || s === "ai_draft") && (
          <button className="pick go-pick" onClick={() => void move("pending")} data-testid="home-request">
            承認に出す
          </button>
        )}
        {s === "pending" && (
          <a className="pick go-pick" href={t(tenant, `card/${card.id}`)} data-testid="home-check">
            確かめて OK にする
          </a>
        )}
        {s === "ok" && role === "supervisor" && (
          <a className="pick go-pick" href={t(tenant, `sign/${card.id}`)} data-testid="home-sign">
            署名する
          </a>
        )}
        {s === "stopped" && (
          <button className="pick" onClick={() => void move("draft")} data-testid="home-redraft">
            下書きに戻して直す
          </button>
        )}
        {canStop && !stopping && (
          <button className="pick danger-pick" onClick={() => setStopping(true)} data-testid="home-stop">
            止める
          </button>
        )}
      </div>
      {stopping && (
        <div className="home-stop">
          <label>
            止める理由{s === "signed" ? "（回収の知らせに載ります）" : ""}
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} data-testid="home-stop-reason" />
          </label>
          <div className="home-actions">
            <button className="pick danger-pick" disabled={s === "signed" && !reason.trim()} onClick={() => void move("stopped", reason.trim() || undefined)} data-testid="home-stop-go">
              止める
            </button>
            <button className="pick" onClick={() => setStopping(false)}>
              やめる
            </button>
          </div>
        </div>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}

function CardsTab({ tenant, role }: { tenant: string; role: string }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    Promise.all([req<{ cards: Card[] }>(tenant, "/cards"), req<{ chats: ChatSummary[] }>(tenant, "/chats").catch(() => ({ chats: [] }))]).then(
      ([c, ch]) => {
        setCards([...c.cards].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
        setChats(ch.chats);
      },
      (e: Error) => setErr(e.message),
    );
  }, [tenant]);
  useEffect(load, [load]);
  if (err) return <p className="err">{err}</p>;
  if (!cards) return <p>読み込み中…</p>;
  const going = chats.filter((c) => c.messages.length > 0).slice(0, 5);
  return (
    <div className="home-cards">
      <a className="home-new" href={t(tenant, "new")} data-testid="home-new">
        <span className="home-plus" aria-hidden="true">＋</span>
        <span>
          <strong>新しいカードを作る</strong>
          <small>資料を添付して、言葉で指示する</small>
        </span>
      </a>
      {going.length > 0 && (
        <section>
          <h2>作りかけのやりとり</h2>
          <ul className="home-list">
            {going.map((c) => (
              <li key={c.id}>
                <a className="home-row" href={t(tenant, `new/${c.id}`)} data-testid={`home-chat-${c.id}`}>
                  <span className="home-date">{day(c.updated_at)}</span>
                  <span className="home-rule">{c.messages.find((m) => m.role === "user" && m.text)?.text || c.files.map((f) => f.name).join("・") || "（添付だけ）"}</span>
                  <span className="home-chip">資料 {c.files.length}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2>今までのカード（{cards.length} 枚）</h2>
        {cards.length === 0 ? (
          <p className="done">まだカードがありません。上の「新しいカードを作る」から始めてください</p>
        ) : (
          <ul className="home-list" data-testid="home-list">
            {cards.map((c) => (
              <li key={c.id} className={open === c.id ? "open" : ""}>
                <button className="home-row" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id} data-testid={`home-card-${c.id}`}>
                  <span className="home-date">{day(c.created_at)}</span>
                  <span className="home-rule">{c.body.rule}</span>
                  <span className={`home-chip st-${c.status}`} data-testid={`home-status-${c.id}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </button>
                {open === c.id && <CardDetail tenant={tenant} card={c} role={role} onChanged={load} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function HomeScreen({ tenant }: { tenant: string }) {
  const [me, setMe] = useState<{ role: string | null } | undefined>(undefined);
  const [tab, setTab] = useState<"cards" | "character">("cards");
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [saved, setSaved] = useState(false);
  const check = useCallback(() => {
    req<{ role: string | null }>(tenant, "/me").then(setMe, () => setMe({ role: null }));
  }, [tenant]);
  useEffect(check, [check]);
  useEffect(() => {
    if (me?.role) setAvatar(loadAvatar(tenant, me.role));
  }, [tenant, me?.role]);
  if (!me) return <p>読み込み中…</p>;
  const role = me.role;
  if (!role || !(role in ROLE_NAME)) return <RolePick tenant={tenant} onDone={check} />;
  // 自分のキャラクターをまだ持っていない人は、ホームの前にキャラクターを作る画面を 1 回通る
  if (!avatar) return <AvatarSetup tenant={tenant} role={role} onDone={setAvatar} />;
  return (
    <div className="home" data-testid="home">
      <header className="home-head">
        <Face a={avatar} />
        <div>
          <h1>現場の紙芝居</h1>
          <p className="home-who">{ROLE_NAME[role]}として入っています</p>
        </div>
      </header>
      <div className="av-seg home-tabs" role="tablist" aria-label="ホーム">
        <button role="tab" aria-selected={tab === "cards"} className={tab === "cards" ? "on" : ""} onClick={() => setTab("cards")} data-testid="home-tab-cards">
          カードの管理
        </button>
        <button role="tab" aria-selected={tab === "character"} className={tab === "character" ? "on" : ""} onClick={() => { setSaved(false); setTab("character"); }} data-testid="home-tab-character">
          キャラクターの管理
        </button>
      </div>
      {tab === "cards" ? (
        <CardsTab tenant={tenant} role={role} />
      ) : (
        <>
          <AvatarSetup key={JSON.stringify(avatar)} tenant={tenant} role={role} initial={avatar} edit onDone={(a) => { setAvatar(a); setSaved(true); }} />
          {saved && <p className="saved home-saved" data-testid="home-saved">保存しました</p>}
        </>
      )}
    </div>
  );
}
