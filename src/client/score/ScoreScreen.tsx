// 試しの答えの 10 段階の採点（11/7 作者）。#/t/<テナント>/score（入口）・#/t/<テナント>/score/author ・ #/t/<テナント>/score/supervisor。
// 入口は左に作者、右に監修者のタブ。タブを押すと、その役割の PIN で入って、参加者ごとの答えに 1〜10 の点とコメントを付ける。
// もう 1 人の点は見えない（相談せずに付けるため）。母語の答えには、採点する人が読めるように参考の日本語の訳を付けられる
import { useCallback, useEffect, useState } from "react";
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
const ROLE_VALUE: Record<ScoreGrader, string> = { author: "author.1", supervisor: "supervisor.1" };
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
const JA_RE = /[぀-ヿ一-鿿]/;
const needsJa = (a: Fields) => !!a.own.trim() || (!!a.ja.trim() && !JA_RE.test(a.ja));

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

const roleOf = (tenant: string) => {
  try {
    return sessionStorage.getItem(roleKey(tenant))?.split(".")[1] ?? null;
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

/** 点（1〜10）とコメント。点を押すとすぐ残す。コメントは「残す」で残す */
function ScoreBox({ value, onSave, label }: { value?: { score: number | null; comment: string }; onSave: (score: number | null, comment: string) => Promise<void>; label: string }) {
  const [score, setScore] = useState<number | null>(value?.score ?? null);
  const [comment, setComment] = useState(value?.comment ?? "");
  const [state, setState] = useState<"" | "busy" | "saved" | "err">("");
  const dirty = comment.trim() !== (value?.comment ?? "").trim();
  const save = async (s: number | null, cm: string) => {
    setState("busy");
    try {
      await onSave(s, cm);
      setState("saved");
    } catch {
      setState("err");
    }
  };
  return (
    <div className="score-box" data-testid="score-box">
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
            disabled={state === "busy"}
            onClick={() => {
              setScore(n);
              void save(n, comment);
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <textarea value={comment} rows={2} placeholder="コメント（どこが伝わった・伝わらなかった、危ない読み違いか など）" onChange={(e) => setComment(e.target.value)} data-testid="score-comment" />
      <div className="score-foot">
        <button type="button" className="score-save" disabled={state === "busy" || !dirty} onClick={() => void save(score, comment)} data-testid="score-save">
          コメントを残す
        </button>
        <span className={`score-state ${state}`}>{state === "busy" ? "残しています…" : state === "saved" ? "残しました" : state === "err" ? "残せませんでした。もう一度押してください" : value?.score ? "前に付けた点" : ""}</span>
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
  useEffect(() => setScores(sheet.scores), [sheet.scores]);
  const save = (target: string) => async (score: number | null, comment: string) => {
    await call(tenant, `trials/${sheet.trial.id}/scores`, { method: "POST", body: JSON.stringify({ target, score, comment }) });
    setScores((x) => ({ ...x, [target]: { score, comment } }));
  };
  const targets = [...sheet.responses.map((r) => r.target), ...sheet.cards.map((c) => c.target), ...sheet.pictures.map((p) => p.target)];
  const done = targets.filter((t) => scores[t]?.score).length;
  const untranslated = [...sheet.responses, ...sheet.pictures].filter((r) => needsJa(r.answer) && !sheet.ja[r.target]).length;
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
              {busy ? "訳しています…" : `母語の答え ${untranslated} 件に参考の日本語の訳を付ける`}
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
                    <ScoreBox label="どれだけ伝わっているか" value={scores[r.target]} onSave={save(r.target)} />
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
            <ScoreBox label="このカードは、絵だけでどれだけ伝わるか" value={scores[c.target]} onSave={save(c.target)} />
            <ol className="score-list">
              {sheet.pictures
                .filter((p) => p.card_id === c.id)
                .map((p) => (
                  <li key={p.target} data-testid={`score-${p.target}`}>
                    <p className="score-who">
                      {who(p.participant, p.group)}・<b className={p.words ? "tag words" : "tag pic"}>{p.words ? "文つき" : "絵だけ"}</b>
                    </p>
                    <Answer a={p.answer} ja={sheet.ja[p.target]} />
                    <ScoreBox label="どれだけ伝わっているか" value={scores[p.target]} onSave={save(p.target)} />
                  </li>
                ))}
            </ol>
          </div>
        ))}
      </section>
    </div>
  );
}

function Tabs({ tenant, names, active }: { tenant: string; names: Partial<Record<ScoreGrader, string>>; active?: ScoreGrader }) {
  return (
    <nav className="score-tabs" data-testid="score-tabs">
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
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [err, setErr] = useState("");
  const ready = !!grader && role === grader;

  useEffect(() => {
    if (!tok) return;
    call<{ people: { role: string; slot: number; name: string }[] }>(tenant, "people")
      .then((b) => setNames({ author: b.people.find((p) => p.role === "author")?.name ?? "", supervisor: b.people.find((p) => p.role === "supervisor" && p.slot === 1)?.name ?? "" }))
      .catch(() => {});
  }, [tenant, tok]);

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

  // 会社の PIN（まだなら）
  if (!tok) return <TenantPin tenant={tenant} tenantOnly onDone={() => setTok(true)} />;
  // タブを押した役割で入る（今の役割と違えば入り直す）
  if (grader && role !== grader)
    return (
      <div className="score">
        <Tabs tenant={tenant} names={names} active={grader} />
        <TenantPin key={grader} tenant={tenant} roles={[{ value: ROLE_VALUE[grader], label: `${ROLE_LABEL[grader]}${names[grader] ? `（${names[grader]}）` : ""}` }]} onDone={() => setRole(roleOf(tenant))} />
      </div>
    );
  return (
    <div className="score" data-testid="score">
      <h1>試しの答えの採点</h1>
      <Tabs tenant={tenant} names={names} active={grader} />
      {!grader && <p className="score-lead">自分のタブを押してください。押すと、その役割の PIN で入って採点します</p>}
      {err && <p className="err">{err}</p>}
      {ready && !sheet && !err && <p>読み込み中…</p>}
      {ready && sheet && <Sheet tenant={tenant} sheet={sheet} reload={load} />}
    </div>
  );
}
