// 発行の画面（088）。監修者と教育担当が、署名済みのカードを配ったあとを見る。
// 署名済みの一覧（版・署名の日付・見た人）・止めるボタン（理由つき・監修者だけ）・回収の知らせ（教育担当が読んだ印を付ける）・今週の抜き取り。
// 役のしるしは sessionStorage の role:<テナント>（ほかの画面と同じ）。回収の知らせは版と署名の日付つきで印刷できる
// 11/7 既定（作者の確認待ち）: 貼った場所（貼る・はがした）・回収の知らせの「はがす紙」・抜き取りの「見直した」・朝礼の組（選ぶ・残す・大きく印刷）
import { useCallback, useEffect, useState } from "react";
import type { CardBody } from "../../shared/card";
import { exportPrinciples, exportSheet } from "../../shared/export";
import { loadPropOverrides } from "../assets/overrides";
import { req } from "../make/MakeScreen";
import { REVIEWERS, TenantPin, useNeedsTenantPin } from "../pin/TenantPin";
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
  weight?: "life" | "normal";
  shape?: "principle" | "story";
  bundle?: { order: number; total: number; parent: string } | null;
}
interface Post {
  id: number;
  card_id: string;
  version: number;
  place: string;
  posted_by: string;
  posted_at: string;
  removed_at: string | null;
  removed_by: string | null;
  current: boolean;
  to_remove: boolean;
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
  /** はがす紙（11/7）: この版を貼った場所で、まだはがしていないもの */
  posts?: { id: number; place: string; posted_at: string }[];
}
interface Sample {
  week: string;
  seed: string | null;
  pool: number;
  picks: {
    card_id: string;
    version: number;
    rule: string;
    signed_by: string;
    signed_by_name: string;
    signed_at: string;
    reviewer: string | null;
    reviewer_name: string;
    reviewed?: { by: string; by_name: string; at: string; note: string } | null;
  }[];
}

function RolePick({ tenant, onDone }: { tenant: string; onDone: () => void }) {
  // 会社のテナントで入ったしるしが無ければ、テナントの PIN → 役割の PIN の 2 段で入る
  const [needPin] = useNeedsTenantPin(tenant);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const go = async (key: string) => {
    setErr("");
    const [role, slot] = key.split(":");
    try {
      const { token } = await req<{ token: string }>(tenant, "/login", { method: "POST", body: JSON.stringify({ role, slot: Number(slot), pin: pin || undefined }) });
      sessionStorage.setItem(`role:${tenant}`, token);
      // 役割で入ったら差し替えを読む（同じ画面のまま入るので、道筋の変わりを待たない）
      void loadPropOverrides(tenant);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  if (needPin === null) return <p>読み込み中…</p>;
  if (needPin) return <TenantPin tenant={tenant} roles={REVIEWERS} onDone={onDone} />;
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

function SampleBox({ tenant, sample, canReview, onChanged }: { tenant: string; sample: Sample; canReview: boolean; onChanged: () => void }) {
  const [err, setErr] = useState("");
  // 見直した印（11/7）: 割り当てた監修者が付ける。違う人が押せばサーバーが理由を返す
  const review = async (cardId: string) => {
    setErr("");
    try {
      await req(tenant, `/issue/samples/${encodeURIComponent(sample.week)}/${encodeURIComponent(cardId)}/reviewed`, { method: "POST", body: "{}" });
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
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
                {p.reviewed ? (
                  <span className="issue-meta" data-testid={`issue-reviewed-${p.card_id}`}>
                    見直しました（{who(p.reviewed.by)} ・ {jst(p.reviewed.at)}）
                  </span>
                ) : (
                  canReview && (
                    <button className="pick on issue-noprint" onClick={() => review(p.card_id)} data-testid={`issue-review-${p.card_id}`}>
                      見直した
                    </button>
                  )
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      {err && <p className="err">{err}</p>}
    </section>
  );
}

function CardRow({ tenant, c, canStop, onChanged }: { tenant: string; c: SignedCard; canStop: boolean; onChanged: () => void }) {
  const [views, setViews] = useState<View[] | null>(null);
  const [stopping, setStopping] = useState(false);
  const [place, setPlace] = useState<string | null>(null);
  // 貼った場所（11/7）: 印刷した紙をどこに貼ったかを残す。止めた・直したときの回収の知らせに「はがす紙」として出る
  const post = async () => {
    setErr("");
    try {
      await req(tenant, "/issue/posts", { method: "POST", body: JSON.stringify({ card_id: c.id, place: (place ?? "").trim() }) });
      setPlace(null);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
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
      <strong>
        {c.weight === "life" && <span className="issue-life">命に関わる</span>}
        {c.rule}
      </strong>
      <span className="issue-meta">
        版 {c.version} ・ 署名 {jstDate(c.signed_at)} ・ {who(c.signed_by)} ・ 見た端末 {c.viewers}（{c.views} 回）
        {c.bundle ? ` ・ ${c.bundle.parent}（${c.bundle.order} / ${c.bundle.total}）` : ""}
        {c.shape === "principle" ? " ・ 原則の 1 コマ" : ""}
      </span>
      <div className="issue-actions issue-noprint">
        {place === null ? (
          <button className="pick" onClick={() => setPlace("")} data-testid={`issue-post-${c.id}`}>
            貼った場所を残す
          </button>
        ) : (
          <>
            <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={100} placeholder="貼った場所（詰所の壁など）" data-testid={`issue-place-${c.id}`} />
            <button className="pick on" disabled={!place.trim()} onClick={post} data-testid={`issue-post-go-${c.id}`}>
              残す
            </button>
          </>
        )}
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
      {!!r.posts?.length && (
        <span className="issue-remove" data-testid={`issue-recall-posts-${r.card_id}`}>
          はがす紙: {r.posts.map((p) => p.place).join("・")}
        </span>
      )}
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
  const [posts, setPosts] = useState<Post[]>([]);
  // 抜き取りは POST なので、見るだけの置き場（公開デモの練習用・架空の会社）では 403 になる。一覧と回収の知らせは出したまま、ここだけ一言にする
  const [sampleErr, setSampleErr] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const s = req<Sample>(tenant, "/issue/sample", { method: "POST", body: "{}" }).then(
      (x) => {
        setSample(x);
        setSampleErr("");
      },
      (e: Error) => setSampleErr(e.message),
    );
    try {
      const [c, r, p] = await Promise.all([
        req<{ cards: SignedCard[] }>(tenant, "/issue/cards"),
        req<{ recalls: Recall[] }>(tenant, "/issue/recalls"),
        req<{ posts: Post[] }>(tenant, "/issue/posts").catch(() => ({ posts: [] as Post[] })),
      ]);
      setCards(c.cards);
      setRecalls(r.recalls);
      setPosts(p.posts);
    } catch (e) {
      setErr((e as Error).message);
    }
    await s;
  }, [tenant]);
  useEffect(() => {
    void load();
  }, [load]);
  if (err) return <p className="err">{err}</p>;
  if (!cards || (!sample && !sampleErr)) return <p>読み込み中…</p>;
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
      <PostsBox tenant={tenant} posts={posts} onChanged={load} />
      <MorningBox tenant={tenant} cards={cards} />
      {sample ? (
        <SampleBox tenant={tenant} sample={sample} canReview={me.role === "supervisor"} onChanged={load} />
      ) : (
        <section className="issue-box" data-testid="issue-sample-fail">
          <h2>今週の抜き取り</h2>
          <p className="done">抜き取りを出せませんでした（{sampleErr}）</p>
        </section>
      )}
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

/** 貼った場所の一覧（11/7）。止めた・直したカードの紙は「はがす」と出し、はがした印を付ける */
function PostsBox({ tenant, posts, onChanged }: { tenant: string; posts: Post[]; onChanged: () => void }) {
  const [err, setErr] = useState("");
  const open = posts.filter((p) => !p.removed_at);
  if (!open.length) return null;
  const removed = async (id: number) => {
    setErr("");
    try {
      await req(tenant, `/issue/posts/${id}/removed`, { method: "POST", body: "{}" });
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <section className="issue-box" data-testid="issue-posts">
      <h2>貼った場所（{open.length} か所）</h2>
      <ul className="issue-list">
        {open.map((p) => (
          <li key={p.id} className={p.to_remove ? "issue-recall" : ""} data-testid={`issue-posted-${p.id}`}>
            <strong>{p.place}</strong>
            <span className="issue-meta">
              版 {p.version} ・ 貼った {jst(p.posted_at)} ・ {who(p.posted_by)}
            </span>
            {p.to_remove && <span className="issue-remove">止めたか直したカードの紙です。はがしてください</span>}
            <button className={`pick issue-noprint${p.to_remove ? " on" : ""}`} onClick={() => removed(p.id)} data-testid={`issue-removed-${p.id}`}>
              はがした
            </button>
          </li>
        ))}
      </ul>
      {err && <p className="err">{err}</p>}
    </section>
  );
}

interface MorningCard {
  id: string;
  rule: string;
  version: number;
  weight: "life" | "normal";
}

/**
 * 朝礼の組（11/7 既定）: その日の作業を言葉で書くと、署名済みのカードから合うものを出す（命に関わるものが先）。
 * 選んで残すと日付つきの記録になり、4 コマを大きくした掲示の版（A4 横）を画面に並べて印刷できる。原則のカードは下に小さく 1 列
 */
function MorningBox({ tenant, cards }: { tenant: string; cards: SignedCard[] }) {
  const [work, setWork] = useState("");
  const [found, setFound] = useState<MorningCard[] | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const [sheets, setSheets] = useState<{ id: string; svg: string }[]>([]);
  const [used, setUsed] = useState<Record<string, number>>({});
  const [err, setErr] = useState("");
  useEffect(() => {
    req<{ used: Record<string, number> }>(tenant, "/issue/morning").then((x) => setUsed(x.used), () => setUsed({}));
  }, [tenant]);
  if (!cards.length) return null;
  const suggest = async () => {
    setErr("");
    try {
      const x = await req<{ cards: MorningCard[] }>(tenant, `/issue/morning/suggest?work=${encodeURIComponent(work.trim())}`);
      setFound(x.cards);
      setPick(x.cards.map((y) => y.id));
      setSheets([]);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const save = async () => {
    setErr("");
    try {
      await req(tenant, "/issue/morning", { method: "POST", body: JSON.stringify({ work: work.trim(), cards: pick }) });
      const signed = new Map(cards.map((c) => [c.id, c]));
      const bodies = await Promise.all(pick.map(async (id) => ({ id, body: (await req<{ body: CardBody; version: number }>(tenant, `/cards/${encodeURIComponent(id)}`)).body })));
      const out = bodies.flatMap(({ id, body }) => {
        const s = signed.get(id);
        if (!s || body.shape === "principle" || body.motion.kind !== "keyframes") return [];
        return [{ id, svg: exportSheet(id, body, s.version, s.signed_at).svg }];
      });
      const row = exportPrinciples(bodies.flatMap(({ id, body }) => (signed.get(id) ? [{ id, body, version: signed.get(id)!.version, signedAt: signed.get(id)!.signed_at }] : [])));
      setSheets(row ? [...out, { id: "principles", svg: row.svg }] : out);
      const u = await req<{ used: Record<string, number> }>(tenant, "/issue/morning");
      setUsed(u.used);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <section className="issue-box" data-testid="issue-morning">
      <h2>朝礼の組</h2>
      <div className="issue-actions issue-noprint">
        <input value={work} onChange={(e) => setWork(e.target.value)} maxLength={200} placeholder="今日の作業（例: 脚立を使う配線）" data-testid="issue-morning-work" />
        <button className="pick" onClick={suggest} data-testid="issue-morning-suggest">
          合うカードを出す
        </button>
      </div>
      {found && (
        <>
          {found.length === 0 ? (
            <p className="done">合うカードがありません。言葉を変えてください</p>
          ) : (
            <ul className="issue-list issue-noprint">
              {found.map((c) => (
                <li key={c.id}>
                  <label>
                    <input type="checkbox" checked={pick.includes(c.id)} onChange={(e) => setPick((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))} data-testid={`issue-morning-pick-${c.id}`} />
                    {c.weight === "life" && <span className="issue-life">命に関わる</span>}
                    {c.rule}
                    <span className="issue-meta"> ・ 朝礼で使った回数 {used[c.id] ?? 0}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {pick.length > 0 && (
            <div className="issue-actions issue-noprint">
              <button className="pick on" onClick={save} data-testid="issue-morning-save">
                この組で朝礼をする（記録して大きく出す）
              </button>
              {sheets.length > 0 && (
                <button className="pick" onClick={() => window.print()}>
                  印刷する
                </button>
              )}
            </div>
          )}
        </>
      )}
      {sheets.map((s) => (
        <div key={s.id} className="issue-sheet" data-testid={`issue-sheet-${s.id}`} dangerouslySetInnerHTML={{ __html: s.svg }} />
      ))}
      {err && <p className="err">{err}</p>}
    </section>
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
