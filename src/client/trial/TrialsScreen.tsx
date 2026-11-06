// 試しの回の一覧（11/6 作者「ボタンを押していって、そこにたどり着く経路」）。#/t/<テナント>/trials。
// 新しい回を作るリンクと、今までの回（新しい順）。回を押すと、その回の画面（見せるもの・時計・採点・絵の勘）へのリンクが開く
import { useEffect, useState } from "react";
import { PinGate } from "../pin/TenantPin";
import "../home/home.css";
import { eraseParticipant, listTrials, type TrialSummary } from "./api";

const go = (tenant: string, path: string) => `#/t/${encodeURIComponent(tenant)}/${path}`;
const day = (s: string) => new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** やめた参加者の答えを消す（025b）。押す前に確かめ、消した数を出す */
function Erase({ tenant, id }: { tenant: string; id: string }) {
  const [who, setWho] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const p = who.trim();
    if (!p || !window.confirm(`${p} の答えを消します。元に戻せません。消したあとは、この人の答えを受け付けません`)) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const r = await eraseParticipant(tenant, id, p);
      setMsg(`消しました（答え ${r.erased.responses}・採点 ${r.erased.grades}・絵の答え ${r.erased.pictures}）`);
      setWho("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <p className="trials-links" data-testid={`trials-erase-${id}`}>
      <label>
        やめた人の答えを消す{" "}
        <input value={who} disabled={busy} placeholder="参加者の ID" onChange={(e) => setWho(e.target.value)} data-testid={`trials-erase-id-${id}`} />
      </label>{" "}
      <button disabled={busy || !who.trim()} onClick={() => void run()} data-testid={`trials-erase-go-${id}`}>
        消す
      </button>
      {msg && <span data-testid={`trials-erase-done-${id}`}> {msg}</span>}
      {err && <span className="err"> {err}</span>}
    </p>
  );
}

function List({ tenant }: { tenant: string }) {
  const [rows, setRows] = useState<TrialSummary[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    listTrials(tenant).then(setRows, (e: Error) => setErr(e.message));
  }, [tenant]);
  if (err) return <p className="err">{err}</p>;
  if (!rows) return <p>読み込み中…</p>;
  return (
    <div className="answer" data-testid="trials">
      <h1>試しの回</h1>
      <a className="big go trials-new" href={go(tenant, "trial/new")} data-testid="trials-new">
        ＋ 新しい回を作る
      </a>
      {rows.length === 0 ? (
        <p className="done">まだ回がありません</p>
      ) : (
        <ul className="home-list" data-testid="trials-list">
          {rows.map((t) => (
            <li key={t.id}>
              <button className="home-row" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id} data-testid={`trials-row-${t.id}`}>
                <span className="home-date">{day(t.created_at)}</span>
                <span className="home-rule">{t.design === "cross" ? "① 交差の回" : "② 順の回"}</span>
                <span className="home-chip">{t.participants} 人</span>
              </button>
              {open === t.id && (
                <p className="trials-links" data-testid={`trials-links-${t.id}`}>
                  {t.design === "cross" && (
                    <>
                      <a href={go(tenant, `trial/${t.id}/material`)}>見せるものを結ぶ</a> ・{" "}
                    </>
                  )}
                  {/* 時間の記録は前からの回（順の回）だけ。交差の回は 1 人が自分で受ける（self）ので出さない */}
                  {t.design !== "cross" && (
                    <>
                      <a href={go(tenant, `trial/${t.id}/time`)}>時間の記録</a> ・{" "}
                    </>
                  )}
                  <a href={go(tenant, `trial/${t.id}/clocks`)}>時計</a> ・ <a href={go(tenant, `trial/${t.id}/forecast`)}>絵だけの勘</a> ・{" "}
                  <a href={go(tenant, `trial/${t.id}/grade/g1`)}>採点者 1</a> ・ <a href={go(tenant, `trial/${t.id}/grade/g2`)}>採点者 2</a>
                </p>
              )}
              {open === t.id && <Erase tenant={tenant} id={t.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TrialsScreen({ tenant }: { tenant: string }) {
  return (
    <PinGate tenant={tenant}>
      <List tenant={tenant} />
    </PinGate>
  );
}
