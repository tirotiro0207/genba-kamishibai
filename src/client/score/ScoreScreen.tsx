// 試しの答えの 10 段階の採点（11/7 作者）。#/t/<テナント>/score（入口）・#/t/<テナント>/score/author ・ #/t/<テナント>/score/supervisor。
// 入口は「どちらが採点しますか」の 2 つのボタン（左に作者、右に監修者。名前は Worker の環境変数）。押すと会社の PIN、次にその人の PIN で入って、
// 参加者ごとの答えに 1〜10 の点とコメントを付ける（11/7 作者「開いたらすぐ、一郎か黒須さんかを選ぶ」）。
// もう 1 人の点は見えない（相談せずに付けるため）。母語の答えには、採点する人が読めるように参考の日本語の訳を付けられる
import { useCallback, useEffect, useRef, useState } from "react";
import { needsJapanese } from "../../shared/answer-fields";
import type { CardMotion } from "../../shared/card";
import { pinLost } from "../events";
import { Frames } from "../read/ReadScreen";
import { authHeaders, needsPin, roleKey, TenantPin, tokenKey } from "../pin/TenantPin";
import "./score.css";

export type ScoreGrader = "author" | "supervisor";
type Fields = { ja: string; own: string };
interface Sheet {
  trial: { id: string; created_at: string };
  me: ScoreGrader;
  names: { author: string; supervisor: string };
  items: { item: "A" | "B"; rule: string; motion: CardMotion | null; words: string }[];
  responses: { target: string; participant: string; group: string; item: "A" | "B"; shown: "card" | "text"; ms: number | null; answer: Fields }[];
  cards: { target: string; id: string; pos: number; rule: string; motion: CardMotion; words: string }[];
  pictures: { target: string; participant: string; group: string; card_id: string; words: boolean; answer: Fields }[];
  scores: Record<string, { score: number | null; comment: string }>;
  ja: Record<string, string>;
}

const enc = encodeURIComponent;
const ROLE_LABEL: Record<ScoreGrader, string> = { author: "作者", supervisor: "監修者" };
const ITEM_LABEL: Record<"A" | "B", string> = { A: "項目 A", B: "項目 B" };
/** 10 段階の目安（11/7 作者「何段階伝わってるか伝わってないか」） */
const SCALE: [number, string][] = [
  [10, "全部伝わった"],
  [8, "大事なところは伝わった"],
  [6, "半分くらい"],
  [4, "少しだけ"],
  [2, "ほとんど伝わっていない"],
  [1, "伝わっていない・逆の意味"],
];
const needsJa = needsJapanese;

/** 参加者の見せ方: student_V_1 → 「ベトナム 1」 */
const who = (participant: string, group: string) => `${group} ${participant.split("_").pop() ?? ""}`;

async function call<T>(tenant: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/t/${enc(tenant)}/${path}`, { ...init, headers: { "content-type": "application/json", ...authHeaders(tenant), ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
    if ((res.status === 401 || res.status === 403) && needsPin(msg)) pinLost(tenant);
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return body as T;
}

/** 入っている役割と枠（例 supervisor.2）。採点の右の人は決めた枠で入るので、枠まで比べる */
const roleOf = (tenant: string) => {
  try {
    const v = sessionStorage.getItem(roleKey(tenant))?.split(".");
    return v && v.length >= 3 ? `${v[1]}.${v[2]}` : null;
  } catch {
    return null;
  }
};
const hasToken = (tenant: string) => {
  try {
    return !!sessionStorage.getItem(tokenKey(tenant));
  } catch {
    return false;
  }
};

/**
 * 残していない箱を全部残す仕組み（11/7 作者「保存できていないものがあった。コメントの外を押したとき・次の点を選んだとき・10 秒ごとに一括で保存」）。
 * 箱ごとに「残していなければ残す」関数を登録しておき、どこかで点を押したとき・コメントの欄を出たとき・10 秒ごと・画面を離れるときに全部呼ぶ
 */
const flushers = new Set<() => Promise<void>>();
const flushAll = () => Promise.all([...flushers].map((f) => f())).then(() => undefined);
export const AUTOSAVE_MS = 10_000;

/** 点（1〜10）とコメント。点を押したとき・コメントの欄を出たとき・10 秒ごとに、残していなければ自動で残す */
function ScoreBox({ value, onSave, label, strict = false }: { value?: { score: number | null; comment: string }; onSave: (score: number | null, comment: string) => Promise<void>; label: string; strict?: boolean }) {
  const [score, setScore] = useState<number | null>(value?.score ?? null);
  const [comment, setComment] = useState(value?.comment ?? "");
  const [state, setState] = useState<"" | "busy" | "saved" | "err">("");
  // 最後に残せた中身（サーバーの値）。これと違えば「残していない」
  const saved = useRef({ score: value?.score ?? null, comment: (value?.comment ?? "").trim() });
  const now = useRef({ score, comment });
  now.current = { score, comment };
  const busy = useRef(false);
  const unsaved = () => {
    const x = now.current;
    return (x.score !== null || x.comment.trim() !== "") && (x.score !== saved.current.score || x.comment.trim() !== saved.current.comment);
  };
  const save = async () => {
    if (busy.current || !unsaved()) return;
    busy.current = true;
    const x = { score: now.current.score, comment: now.current.comment.trim() };
    setState("busy");
    try {
      await onSave(x.score, x.comment);
      saved.current = x;
      setState("saved");
    } catch {
      setState("err");
    } finally {
      busy.current = false;
    }
    // 残しているあいだに書き足していれば、続けて残す
    if (unsaved()) void save();
  };
  useEffect(() => {
    flushers.add(save);
    return () => {
      flushers.delete(save);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dirty = unsaved();
  // 付け忘れ（11/7 作者「点やコメントの付け忘れはオレンジに」）。片方だけ付けた箱はいつも、最後に全部保存を押したあとは手を付けていない箱もオレンジにする
  const noScore = score === null, noComment = comment.trim() === "";
  const missing = noScore || noComment;
  const shown = missing && (strict || noScore !== noComment);
  return (
    <div className={`score-box${shown ? " missing" : ""}`} data-testid="score-box" data-unsaved={dirty ? "1" : "0"} data-missing={missing ? "1" : "0"}>
      {shown && <p className="score-missing">{noScore && noComment ? "点とコメントがまだです" : noScore ? "点がまだです" : "コメントがまだです"}</p>}
      <p className="score-cap">{label}</p>
      <div className="score-scale" role="radiogroup" aria-label={label}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            className={score === n ? "on" : ""}
            data-score={n}
            onClick={() => {
              setScore(n);
              now.current = { score: n, comment: now.current.comment };
              // この箱と、ほかの残していない箱を全部残す
              void flushAll();
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        rows={2}
        placeholder="コメント（どこが伝わった・伝わらなかった、危ない読み違いか など）"
        onChange={(e) => setComment(e.target.value)}
        onBlur={() => void flushAll()}
        data-testid="score-comment"
      />
      <div className="score-foot">
        <button type="button" className="score-save" disabled={state === "busy" || !dirty} onClick={() => void flushAll()} data-testid="score-save">
          今すぐ残す
        </button>
        <span className={`score-state ${state}`} data-testid="score-state">
          {state === "busy" ? "残しています…" : dirty ? (state === "err" ? "残せませんでした。自動でやり直します" : "まだ残していません（自動で残します）") : state === "saved" ? "残しました" : value?.score ? "前に付けた点" : ""}
        </span>
      </div>
    </div>
  );
}

function Answer({ a, ja }: { a: Fields; ja?: string }) {
  return (
    <div className="score-answer">
      {a.ja.trim() && <p><span className="score-k">日本語の欄</span>{a.ja}</p>}
      {a.own.trim() && <p><span className="score-k">母語の欄</span>{a.own}</p>}
      {!a.ja.trim() && !a.own.trim() && <p className="score-none">（答えなし）</p>}
      {ja && <p className="score-ja"><span className="score-k">参考の訳（Claude）</span>{ja}</p>}
    </div>
  );
}

function Sheet({ tenant, sheet, reload }: { tenant: string; sheet: Sheet; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [scores, setScores] = useState(sheet.scores);
  // 最後に全部保存（11/7 作者）。付け忘れがあれば終わりにせず、オレンジの箱へ連れていく
  const [strict, setStrict] = useState(false);
  const [final, setFinal] = useState<{ ok: boolean; text: string } | null>(null);
  const finish = async () => {
    setStrict(true);
    setFinal(null);
    await flushAll();
    // 箱の data-missing / data-unsaved は今の中身から出しているので、そのまま数えられる
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const miss = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="score-box"][data-missing="1"]'));
    const unsaved = document.querySelectorAll('[data-testid="score-box"][data-unsaved="1"]').length;
    if (miss.length) {
      setFinal({ ok: false, text: `付け忘れが ${miss.length} 件あります（オレンジの枠）。全部付けてから、もう一度押してください` });
      miss[0].scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (unsaved) {
      setFinal({ ok: false, text: `まだ残せていないものが ${unsaved} 件あります。通信を確かめて、もう一度押してください` });
      return;
    }
    setFinal({ ok: true, text: `全部保存しました（${targets.length} 件）。お疲れさまでした` });
  };
  // 10 秒ごとと、画面を離れる・隠れるときに、残していない箱を全部残す
  useEffect(() => {
    const id = window.setInterval(() => void flushAll(), AUTOSAVE_MS);
    const hide = () => {
      if (document.visibilityState === "hidden") void flushAll();
    };
    const leave = () => void flushAll();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      void flushAll();
    };
  }, []);
  useEffect(() => setScores(sheet.scores), [sheet.scores]);
  const save = (target: string) => async (score: number | null, comment: string) => {
    await call(tenant, `trials/${sheet.trial.id}/scores`, { method: "POST", body: JSON.stringify({ target, score, comment }) });
    setScores((x) => ({ ...x, [target]: { score, comment } }));
  };
  const targets = [...sheet.responses.map((r) => r.target), ...sheet.cards.map((c) => c.target), ...sheet.pictures.map((p) => p.target)];
  const done = targets.filter((t) => scores[t]?.score).length;
  const untranslated = [...sheet.responses, ...sheet.pictures].filter((r) => needsJa(r.answer) && !sheet.ja[r.target]).length;
  // 開いたら、訳の無い母語の答えに自動で訳を付ける（11/7 作者「全部翻訳入れてくれないとわからない」）。1 回の読み込みで 1 回だけ。
  // 失敗したときは下のボタンでやり直す
  const tried = useRef(false);
  useEffect(() => {
    if (untranslated > 0 && !tried.current) {
      tried.current = true;
      void translate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [untranslated]);
  const translate = async () => {
    setBusy(true);
    setErr("");
    try {
      await call(tenant, `trials/${sheet.trial.id}/scoring/translate`, { method: "POST" });
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="score-sheet" data-testid="score-sheet">
      <div className="score-guide">
        <p>
          付けた点 <b data-testid="score-done">{done}</b> / {targets.length}。もう 1 人の点は見えません。相談せずに付けてください
        </p>
        <ul className="score-legend">
          {SCALE.map(([n, t]) => (
            <li key={n}>
              <b>{n}</b> {t}
            </li>
          ))}
        </ul>
        {untranslated > 0 && (
          <p>
            <button type="button" className="big" disabled={busy} onClick={() => void translate()} data-testid="score-translate">
              {busy ? `母語の答え ${untranslated} 件に日本語の訳を付けています…（1 分ほど）` : `訳の付いていない母語の答え ${untranslated} 件に訳を付ける`}
            </button>
          </p>
        )}
        {err && <p className="err">{err}</p>}
      </div>

      <section className="score-part">
        <h2>① 分かるまでの時間（2 項目）</h2>
        <p className="score-lead">1 人が 2 項目を、片方はカード、もう片方は元のページ（文）で見て、意味を書いた答えです</p>
        {(["A", "B"] as const)
          .map((item) => sheet.items.find((x) => x.item === item) ?? { item, rule: "", motion: null, words: "" })
          .filter((it) => it.motion || sheet.responses.some((r) => r.item === it.item))
          .map((it) => (
          <div key={it.item} className="score-item" data-testid={`score-item-${it.item}`}>
            <h3>
              {ITEM_LABEL[it.item]}
              {it.rule && <>: {it.rule}</>}
            </h3>
            {it.motion && (
              <div className="score-card">
                <Frames motion={it.motion} />
                {it.words && <p className="score-words">{it.words}</p>}
              </div>
            )}
            <ol className="score-list">
              {sheet.responses
                .filter((r) => r.item === it.item)
                .map((r) => (
                  <li key={r.target} data-testid={`score-${r.target}`}>
                    <p className="score-who">
                      {who(r.participant, r.group)}・<b>{r.shown === "card" ? "カードで見た" : "文（元のページ）で見た"}</b>
                      {r.ms !== null && <> ・ {Math.round(r.ms / 1000)} 秒</>}
                    </p>
                    <Answer a={r.answer} ja={sheet.ja[r.target]} />
                    <ScoreBox label="どれだけ伝わっているか" value={scores[r.target]} onSave={save(r.target)} strict={strict} />
                  </li>
                ))}
            </ol>
          </div>
        ))}
        {!sheet.responses.length && <p className="score-none">① の答えはまだありません</p>}
      </section>

      <section className="score-part">
        <h2>② 絵のテスト（{sheet.cards.length} 枚）</h2>
        <p className="score-lead">絵を見て意味を書いた答えです。半分の人は、やさしい日本語の文と一緒に見ています（「文つき」の印）</p>
        {sheet.cards.map((c, i) => (
          <div key={c.target} className="score-item" data-testid={`score-card-${i + 1}`}>
            <h3>
              {i + 1} 枚目: {c.rule}
            </h3>
            <div className="score-card">
              <Frames motion={c.motion} />
              {c.words && <p className="score-words">文つきの人に見せた文: {c.words}</p>}
            </div>
            <ScoreBox label="このカードは、絵だけでどれだけ伝わるか" value={scores[c.target]} onSave={save(c.target)} strict={strict} />
            <ol className="score-list">
              {sheet.pictures
                .filter((p) => p.card_id === c.id)
                .map((p) => (
                  <li key={p.target} data-testid={`score-${p.target}`}>
                    <p className="score-who">
                      {who(p.participant, p.group)}・<b className={p.words ? "tag words" : "tag pic"}>{p.words ? "文つき" : "絵だけ"}</b>
                    </p>
                    <Answer a={p.answer} ja={sheet.ja[p.target]} />
                    <ScoreBox label="どれだけ伝わっているか" value={scores[p.target]} onSave={save(p.target)} strict={strict} />
                  </li>
                ))}
            </ol>
          </div>
        ))}
      </section>

      <div className="score-final">
        <button type="button" className="big go" onClick={() => void finish()} data-testid="score-finish">
          最後に全部保存する
        </button>
        {final && (
          <p className={final.ok ? "saved" : "score-missing"} data-testid="score-final">
            {final.text}
          </p>
        )}
      </div>
    </div>
  );
}

function Tabs({ tenant, names, active, big = false }: { tenant: string; names: Partial<Record<ScoreGrader, string>>; active?: ScoreGrader; big?: boolean }) {
  return (
    <nav className={`score-tabs${big ? " big" : ""}`} data-testid="score-tabs">
      {(["author", "supervisor"] as const).map((g) => (
        <a key={g} href={`#/t/${enc(tenant)}/score/${g}`} className={active === g ? "on" : ""} data-testid={`score-tab-${g}`}>
          <span className="score-role">{ROLE_LABEL[g]}</span>
          <span className="score-name">{names[g] || "　"}</span>
        </a>
      ))}
    </nav>
  );
}

export function ScoreScreen({ tenant, grader }: { tenant: string; grader?: ScoreGrader }) {
  const [tok, setTok] = useState(() => hasToken(tenant));
  const [role, setRole] = useState(() => roleOf(tenant));
  const [names, setNames] = useState<Partial<Record<ScoreGrader, string>>>({});
  const [slot, setSlot] = useState<1 | 2>(1);
  const value = (g: ScoreGrader) => (g === "author" ? "author.1" : `supervisor.${slot}`);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [err, setErr] = useState("");
  const ready = !!grader && role === value(grader);

  // 2 人の名前と右の人の枠は、PIN の前に読む（最初の画面で選べるように）
  useEffect(() => {
    fetch("/api/score-names")
      .then((r) => (r.ok ? (r.json() as Promise<{ author: string; supervisor: string; slot: number }>) : null))
      .then((b) => {
        if (!b) return;
        setNames({ author: b.author, supervisor: b.supervisor });
        setSlot(b.slot === 2 ? 2 : 1);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      setSheet(await call<Sheet>(tenant, "trials/latest/scoring"));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [tenant]);
  useEffect(() => {
    setSheet(null);
    setErr("");
    if (ready) void load();
  }, [ready, load]);

  // 最初の画面: どちらが採点するかを選ぶ（PIN より先）
  if (!grader)
    return (
      <div className="score" data-testid="score">
        <h1>試しの答えの採点</h1>
        <p className="score-lead">採点する人を選んでください。選んだあとに PIN を入れます</p>
        <Tabs tenant={tenant} names={names} big />
      </div>
    );
  const label = names[grader] ? `${names[grader]}さん（${ROLE_LABEL[grader]}）` : ROLE_LABEL[grader];
  // 会社の PIN（まだなら）
  if (!tok)
    return (
      <div className="score">
        <Tabs tenant={tenant} names={names} active={grader} />
        <TenantPin tenant={tenant} tenantOnly onDone={() => setTok(true)} />
      </div>
    );
  // 選んだ人の PIN で入る（今の役割と枠が違えば入り直す）
  if (role !== value(grader))
    return (
      <div className="score">
        <Tabs tenant={tenant} names={names} active={grader} />
        <TenantPin key={`${grader}.${slot}`} tenant={tenant} named={false} roles={[{ value: value(grader), label }]} onDone={() => setRole(roleOf(tenant))} />
      </div>
    );
  return (
    <div className="score" data-testid="score">
      <h1>試しの答えの採点</h1>
      <Tabs tenant={tenant} names={names} active={grader} />
      {err && <p className="err">{err}</p>}
      {ready && !sheet && !err && <p>読み込み中…</p>}
      {ready && sheet && <Sheet tenant={tenant} sheet={sheet} reload={load} />}
    </div>
  );
}
