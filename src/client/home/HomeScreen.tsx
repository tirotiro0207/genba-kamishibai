// ホーム（11/5 作者）。#/t/<テナント>/home。入口から名前で入ったあと、作る側（作者・監修者・教育担当）が最初に来る画面。
// 入る順: テナントの PIN → 役 → （まだ持っていなければ）キャラクターを作る画面 → ここ。
// 上のタブは「カードの管理」と「キャラクターの管理」。カードの管理は、新しいカードを作る（チャット）と、今までのカードのまとめ（作った日・決まり・状態）。
// まとめを押すと開いて、編集する（絵のカードの画面へ）・承認に出す・署名する・止めるが出る。止めるは画面の中の確認の窓で、もう一度確かめる。
// 消すボタンは置かない（11/5 作者。消すと、そのカードに残したノウハウと記録が消えるため。要らないカードは止める）。署名したカードは、署名した人を状態の札の下に出す
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type CardBody, STATUS_LABEL, type CardStatus, WEIGHT_LABEL } from "../../shared/card";

/** 一覧の小さな印（11/7）: 命に関わる・原則の 1 コマ・束（どの決まりの何枚目か）。同じ束のカードが一覧で分かる */
function KindTags({ body }: { body: Pick<CardBody, "weight" | "shape" | "bundle"> }) {
  return (
    <>
      {body.weight === "life" && (
        <small className="home-tag life" data-testid="home-tag-life">
          {WEIGHT_LABEL.life}
        </small>
      )}
      {body.shape === "principle" && <small className="home-tag">原則の 1 コマ</small>}
      {body.bundle && (
        <small className="home-tag" data-testid="home-tag-bundle" title={body.bundle.parent}>
          束 {body.bundle.order}/{body.bundle.total}: {body.bundle.parent}
        </small>
      )}
    </>
  );
}
import { characterSvg } from "../../shared/picto/character";
import { STANDING } from "../../shared/picto/skeleton";
import { AvatarSetup } from "../avatar/AvatarSetup";
import { type Avatar, loadAvatar } from "../avatar/store";
import { req } from "../make/MakeScreen";
import { loadTexts, type Texts } from "../route/RouteScreen";
import type { SourceRef, Statement } from "../../shared/card";
import { Original } from "./Original";
import { logout, NEWHIRE, STAFF, TenantPin, useNeedsTenantPin } from "../pin/TenantPin";
import "./home.css";
import { Ruby } from "../Ruby";

interface Card {
  id: string;
  status: CardStatus;
  version: number;
  created_at: string;
  updated_at: string;
  ask: string | null;
  body: { rule: string; why?: string; frames: unknown[]; words?: { ja: string; vi: string }; statements?: Statement[] } & Pick<CardBody, "weight" | "shape" | "bundle">;
  /** 最後の署名（署名したことが無ければ null） */
  signed: { role: string; slot: number; name: string; at: string } | null;
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
/** 署名した人。名前が無ければ「監修者 1」 */
const signer = (s: NonNullable<Card["signed"]>) => (s.name ? `${s.name}さん` : `${ROLE_NAME[s.role] ?? s.role} ${s.slot}`);
const day = (s: string) => new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short" });

/** 署名済みのカードを見る画面（見る側の最初の画面） */
export const viewerHome = (tenant: string) => `#/t/${encodeURIComponent(tenant)}/read`;

/**
 * 作る側と見る側の入口（11/7 作者「作る側の画面と見る側の画面をちゃんと分けて」）。
 * 作る側は作者・監修者・教育担当で、カードを作る・直す・署名する。見る側は新入社員と現場の人で、署名済みのカードだけを見る
 */
function Doors({ onPick }: { onPick: (side: "make" | "view") => void }) {
  return (
    <section className="home-doors" data-testid="home-doors">
      <h1>どちらで入りますか</h1>
      <div className="home-door-row">
        <button type="button" className="home-door make" onClick={() => onPick("make")} data-testid="home-door-make">
          <b>作る側</b>
          <span>カードを作る・直す・署名する</span>
          <small>作者・監修者・教育担当</small>
        </button>
        <button type="button" className="home-door view" onClick={() => onPick("view")} data-testid="home-door-view">
          <b>見る側</b>
          <span>署名されたカードを見る</span>
          <small>新入社員・現場の人</small>
        </button>
      </div>
    </section>
  );
}

function RolePick({ tenant, onDone }: { tenant: string; onDone: () => void }) {
  const [needPin] = useNeedsTenantPin(tenant);
  const [err, setErr] = useState("");
  const [side, setSide] = useState<"make" | "view" | null>(null);
  // 見る側を押すと、ID を入れる段に進む（ID はテストを受ける人だけ。カードを見るだけなら空のまま）
  const asStudent = side === "view";
  const [student, setStudent] = useState("");
  if (needPin === null) return <p>読み込み中…</p>;
  if (!side) return <Doors onPick={setSide} />;
  const back = (
    <button type="button" className="pick home-door-back" onClick={() => setSide(null)} data-testid="home-door-back">
      ← 作る側・見る側を選び直す
    </button>
  );
  if (needPin)
    return (
      <>
        <TenantPin tenant={tenant} roles={side === "make" ? STAFF : NEWHIRE} onDone={onDone} />
        <div className="home-door-backbar">{back}</div>
      </>
    );
  const go = async (value: string, id?: string) => {
    const [role, slot] = value.split(".");
    try {
      const { token } = await req<{ token: string }>(tenant, "/login", { method: "POST", body: JSON.stringify({ role, slot: Number(slot), ...(id ? { student: id } : {}) }) });
      sessionStorage.setItem(`role:${tenant}`, token);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  if (asStudent)
    return (
      <form
        className="home-pick"
        onSubmit={(e) => {
          e.preventDefault();
          void go("newhire.1", student.trim() || undefined);
        }}
        data-testid="home-pick-student"
      >
        <p>見る側で入ります。テストを受ける人だけ、新入社員の ID を入れてください（カードを見るだけなら空のまま）</p>
        <input value={student} onChange={(e) => setStudent(e.target.value.replace(/\s/g, ""))} placeholder="student_V_1" autoCapitalize="off" autoComplete="off" spellCheck={false} data-testid="home-student-id" />
        <div className="verdicts">
          <button type="button" className="pick" onClick={() => setSide(null)}>
            ← 作る側・見る側を選び直す
          </button>
          <button className="pick go-pick" data-testid="home-student-enter">
            入る
          </button>
        </div>
        {err && <p className="err">{err}</p>}
      </form>
    );
  return (
    <section className="home-pick" data-testid="home-pick">
      <p>作る側の、どの役で入りますか</p>
      <div className="verdicts">
        {STAFF.map((r) => (
          <button key={r.value} className="pick" onClick={() => go(r.value)} data-testid={`home-as-${r.value.replace(".", "-")}`}>
            {r.label}
          </button>
        ))}
      </div>
      {back}
      {err && <p className="err">{err}</p>}
    </section>
  );
}

function Face({ a }: { a: Avatar }) {
  const svg = useMemo(() => characterSvg({ angles: STANDING, x: 0, groundY: 434, height: 434, facing: "right", view: "front", role: "new", headwear: "none", hair: a.hair, face: a.face }), [a]);
  return <svg className="home-face" viewBox="-82 -54 164 164" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** 止める前の確認の窓。「止める」を押すまで、カードは止まらない */
function StopDialog({ card, onCancel, onStop }: { card: Card; onCancel: () => void; onStop: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const signed = card.status === "signed";
  useEffect(() => {
    box.current?.querySelector("input")?.focus();
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCancel]);
  return (
    <div className="home-modal-back" onClick={onCancel} data-testid="home-stop-dialog">
      <div ref={box} className="home-modal" role="alertdialog" aria-modal="true" aria-labelledby="home-stop-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="home-stop-title">本当に止めますか？</h2>
        <p className="home-modal-rule">{card.body.rule}</p>
        <p className="home-modal-note">
          {signed ? "署名済みのカードです。止めると、配った先に回収の知らせが出ます。" : "止めたカードは配られません。"}
          消えはしないので、あとで「下書きに戻して直す」から戻せます。
        </p>
        <label>
          止める理由{signed ? "（必ず書く。回収の知らせに載ります）" : "（必ず書く。記録に残ります）"}
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} data-testid="home-stop-reason" />
        </label>
        <div className="home-actions home-modal-actions">
          <button className="pick" onClick={onCancel} data-testid="home-stop-cancel">
            やめる
          </button>
          <button
            className="pick danger-fill"
            disabled={busy || !reason.trim()}
            onClick={async () => {
              setBusy(true);
              await onStop(reason.trim());
              setBusy(false);
            }}
            data-testid="home-stop-go"
          >
            {busy ? "止めています…" : "止める"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 押したカードの中身と操作 */
/** 元の文の位置を 1 つずつに（同じ位置は 1 回） */
const uniqueSources = (sts: Statement[]) => [...new Map(sts.flatMap((x) => x.sources).map((r) => [JSON.stringify(r), r])).values()] as SourceRef[];

/**
 * カードの中身（11/6 作者「やさしい日本語・やること／やらないこと・なぜ・補足と、見ようと思えば原文も」）。
 * 原文は押したときだけ読む（資料のページの行を、前後 3 行を添えて光らせる。経路の画面と同じ見せ方）
 */
function CardBodyView({ tenant, card, labels }: { tenant: string; card: Card; labels: Record<string, string> }) {
  const [texts, setTexts] = useState<Texts | null>(null);
  const [showSrc, setShowSrc] = useState(false);
  const b = card.body;
  const sts = b.statements ?? [];
  const added = sts.filter((x) => x.ai);
  const toggle = () => {
    if (!showSrc && !texts) void loadTexts(tenant, { ...b, statements: sts } as never).then(setTexts);
    setShowSrc(!showSrc);
  };
  return (
    <dl className="home-body" data-testid={`home-body-${card.id}`}>
      {b.words?.ja && (
        <>
          <dt>やさしい日本語</dt>
          <dd data-testid="home-body-words">
            <Ruby text={b.words.ja} />
          </dd>
        </>
      )}
      <dt>決まり（やること・やらないこと）</dt>
      <dd>{b.rule}</dd>
      {b.why && (
        <>
          <dt>なぜ</dt>
          <dd>{b.why}</dd>
        </>
      )}
      {(added.length > 0 || card.ask) && (
        <>
          <dt>補足</dt>
          <dd>
            {card.ask && <p className="home-ask">監修者に確認: {card.ask}</p>}
            {added.length > 0 && <p className="home-meta">元の文に無く、AI が書き足した文: {added.map((x) => `「${x.text}」`).join("・")}</p>}
          </dd>
        </>
      )}
      {sts.length > 0 && (
        <dd className="home-src">
          <button type="button" className="pick" onClick={toggle} aria-expanded={showSrc} data-testid="home-src-toggle">
            {showSrc ? "原文を閉じる" : "原文を見る"}
          </button>
          {showSrc &&
            (texts ? (
              <Original refs={uniqueSources(sts)} texts={texts} labels={labels} />
            ) : (
              <p>読み込み中…</p>
            ))}
        </dd>
      )}
    </dl>
  );
}

function CardDetail({ tenant, card, role, labels, onChanged }: { tenant: string; card: Card; role: string; labels: Record<string, string>; onChanged: () => void }) {
  const [stopping, setStopping] = useState(false);
  const [err, setErr] = useState("");
  const move = async (to: CardStatus, why?: string) => {
    setErr("");
    try {
      await req(tenant, `/cards/${card.id}/status`, { method: "POST", body: JSON.stringify({ to, reason: why }) });
      setStopping(false);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
      setStopping(false);
    }
  };
  const cancel = useCallback(() => setStopping(false), []);
  const s = card.status;
  // 止めるのは監修者だけ（サーバーの関所と同じ。理由も必ず要る）
  const canStop = s !== "stopped" && role === "supervisor";
  return (
    <div className="home-detail" data-testid={`home-detail-${card.id}`}>
      {card.signed && (
        <p className="home-signed" data-testid="home-signed-by">
          署名: {signer(card.signed)}（{day(card.signed.at)}）{s === "stopped" ? " ・ そのあと止めた" : ""}
        </p>
      )}
      <CardBodyView tenant={tenant} card={card} labels={labels} />
      <p className="home-meta">
        {card.body.frames.length} コマ ・ 版 {card.version} ・ 最後に変えた日 {day(card.updated_at)}
      </p>
      {s === "signed" && <p className="home-meta">署名済みのカードを直せるのは監修者だけです。直すと署名が外れて新しい版の下書きになり、前の版には回収の知らせが出ます。{role !== "supervisor" ? "カードを止められるのも監修者だけです。" : ""}</p>}
      <div className="home-actions">
        <a className="pick" href={t(tenant, `card/${card.id}`)} data-testid="home-edit">
          編集する（絵のカード）
        </a>
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
        {canStop && (
          <button className="pick danger-pick" onClick={() => setStopping(true)} data-testid="home-stop">
            止める
          </button>
        )}
      </div>
      {/* ほかの見方（11/6 作者「ボタンを押していって、そこにたどり着く経路」） */}
      <div className="home-more" data-testid="home-more-card">
        <a className="pick" href={t(tenant, `route/${card.id}`)}>経路（部品 → 文 → 元の文）</a>
        <a className="pick" href={t(tenant, `fold/${card.id}`)}>折りたたみ</a>
        <a className="pick" href={t(tenant, `audit/${card.id}`)}>記録</a>
      </div>
      {stopping && <StopDialog card={card} onCancel={cancel} onStop={(r) => move("stopped", r)} />}
      {err && <p className="err">{err}</p>}
    </div>
  );
}

function CardsTab({ tenant, role }: { tenant: string; role: string }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState("");
  // 監修者に見てもらう組（11/6 作者）。あればそのタブを先に開く
  const [review, setReview] = useState<string[]>([]);
  const [view, setView] = useState<"review" | "all" | null>(null);
  // 資料の名前（11/6 作者「安全のしおりの何ページか」）。環境変数 DOC_LABELS から
  const [labels, setLabels] = useState<Record<string, string>>({});
  const load = useCallback(() => {
    Promise.all([req<{ cards: Card[]; review?: string[]; docs?: Record<string, string> }>(tenant, "/cards"), req<{ chats: ChatSummary[] }>(tenant, "/chats").catch(() => ({ chats: [] }))]).then(
      ([c, ch]) => {
        setCards([...c.cards].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
        setReview(c.review ?? []);
        setLabels(c.docs ?? {});
        setView((v) => v ?? ((c.review ?? []).length ? "review" : "all"));
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
      {review.length > 0 && (
        <div className="av-seg home-tabs home-view" role="tablist" aria-label="カードの見方">
          <button role="tab" aria-selected={view === "review"} className={view === "review" ? "on" : ""} onClick={() => setView("review")} data-testid="home-view-review">
            監修者に見てもらう {review.length} 枚
          </button>
          <button role="tab" aria-selected={view === "all"} className={view === "all" ? "on" : ""} onClick={() => setView("all")} data-testid="home-view-all">
            今までのカード {cards.length} 枚
          </button>
        </div>
      )}
      {view === "review" && review.length > 0 ? (
        <section>
          <h2>監修者に見てもらう {review.length} 枚</h2>
          <p className="home-meta">1 枚ずつ中身を確かめ、「確かめて OK にする」から絵のカードを開いて OK にしてください。OK のあと、監修者は「署名する」が出ます。</p>
          <ul className="home-list home-review" data-testid="home-review">
            {review.map((id, i) => {
              const c = cards.find((x) => x.id === id);
              if (!c) return null;
              return (
                <li key={id} className="open" data-testid={`home-review-${id}`}>
                  <div className="home-row">
                    <span className="home-date">{i + 1}</span>
                    <span className="home-rule">{c.body.rule}</span>
                    <span className="home-state">
                      <span className={`home-chip st-${c.status}`}>{STATUS_LABEL[c.status]}</span>
                      {c.signed && <small className="home-signer">{signer(c.signed)}</small>}
                    </span>
                  </div>
                  <CardDetail tenant={tenant} card={c} role={role} labels={labels} onChanged={load} />
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
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
                  <span className="home-rule">
                    {c.body.rule}
                    <KindTags body={c.body} />
                  </span>
                  <span className="home-state">
                    <span className={`home-chip st-${c.status}`} data-testid={`home-status-${c.id}`}>
                      {STATUS_LABEL[c.status]}
                    </span>
                    {c.signed && (
                      <small className="home-signer" data-testid={`home-signer-${c.id}`}>
                        {signer(c.signed)}
                      </small>
                    )}
                  </span>
                </button>
                {open === c.id && <CardDetail tenant={tenant} card={c} role={role} labels={labels} onChanged={load} />}
              </li>
            ))}
          </ul>
        )}
      </section>
      )}
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
  // 見る側（新入社員・現場の人）は、署名済みのカードを見る画面へ（11/7 作者。テストはその画面の下から）
  if (role === "newhire") {
    location.replace(viewerHome(tenant));
    return <p>読み込み中…</p>;
  }
  if (!role || !(role in ROLE_NAME)) return <RolePick tenant={tenant} onDone={check} />;
  // 自分のキャラクターをまだ持っていない人は、ホームの前にキャラクターを作る画面を 1 回通る
  if (!avatar)
    return (
      <>
        <p className="home-who">
          {ROLE_NAME[role]}として入っています{" "}
          <button type="button" className="pick home-logout" onClick={() => logout(tenant)} data-testid="home-logout">
            ログアウト
          </button>
        </p>
        <AvatarSetup tenant={tenant} role={role} onDone={setAvatar} />
      </>
    );
  return (
    <div className="home" data-testid="home">
      <header className="home-head">
        <Face a={avatar} />
        <div>
          <h1>現場の紙芝居</h1>
          <p className="home-who">{ROLE_NAME[role]}として入っています</p>
        </div>
        <button type="button" className="pick home-logout" onClick={() => logout(tenant)} data-testid="home-logout">
          ログアウト
        </button>
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
        <>
          {/* ほかの画面（11/6 作者）。ホームから押してたどり着けるように */}
          <nav className="home-more" aria-label="ほかの画面" data-testid="home-more">
            <a className="pick" href={t(tenant, "queue")} data-testid="home-go-queue">確認待ち</a>
            <a className="pick" href={t(tenant, "issue")} data-testid="home-go-issue">発行の管理</a>
            <a className="pick" href={t(tenant, "trials")} data-testid="home-go-trials">試しの回</a>
            <a className="pick" href={t(tenant, "make")} data-testid="home-go-make">資料から作る</a>
          </nav>
          <CardsTab tenant={tenant} role={role} />
        </>
      ) : (
        <>
          <AvatarSetup key={JSON.stringify(avatar)} tenant={tenant} role={role} initial={avatar} edit onDone={(a) => { setAvatar(a); setSaved(true); }} />
          {saved && <p className="saved home-saved" data-testid="home-saved">保存しました</p>}
        </>
      )}
    </div>
  );
}
