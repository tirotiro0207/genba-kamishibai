// 試しの回の一覧（11/6 作者「ボタンを押していって、そこにたどり着く経路」）。#/t/<テナント>/trials。
// 新しい回を作るリンクと、今までの回（新しい順）。回を押すと、その回の画面（見せるもの・時計・採点・絵の勘）へのリンクが開く
import { useEffect, useState } from "react";
import { PinGate } from "../pin/TenantPin";
import "../home/home.css";
import { listTrials, type TrialSummary } from "./api";

const go = (tenant: string, path: string) => `#/t/${encodeURIComponent(tenant)}/${path}`;
const day = (s: string) => new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

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
                  <a href={go(tenant, `trial/${t.id}/time`)}>時間の記録</a> ・ <a href={go(tenant, `trial/${t.id}/clocks`)}>時計</a> ・ <a href={go(tenant, `trial/${t.id}/forecast`)}>絵だけの勘</a> ・{" "}
                  <a href={go(tenant, `trial/${t.id}/grade/g1`)}>採点者 1</a> ・ <a href={go(tenant, `trial/${t.id}/grade/g2`)}>採点者 2</a>
                </p>
              )}
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
