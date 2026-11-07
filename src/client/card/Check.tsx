// 確認待ちの関門の画面の側（047）。確かめる AI の証拠（どの絵を見て・何点で・なぜか）が今の版に無いカードは「確認待ち」と出し、OK を押せない。
// 「確かめる AI に見せる」は、コマを端末で PNG にしてサーバーに送る。確かめる AI を呼んで証拠を残すのはサーバーだけ。
// 帯の色は 3 色だけ（緑・黄・赤。赤は「危険」と同じ赤）。危ない読み違いのカードは、直して確かめ直すまで OK を押せない（048）。
import { useState } from "react";
import { type CardBody, type CardStatus, type CardWeight, WEIGHT_LABEL, WEIGHTS } from "../../shared/card";
import { cutFrames } from "../../shared/picto/motion";
import { renderFrame, SIZE } from "../../shared/picto/scene";
import type { Evidence } from "../../shared/verify/formal";
import { req } from "../make/MakeScreen";
import { statsChanged } from "../stats/StatsBar";

export interface CheckedCard {
  id: string;
  status: CardStatus;
  version: number;
  body: CardBody;
  verify?: Evidence | null;
  /** 監修者に確認してほしい理由（039） */
  ask?: string | null;
}

const BAND: Record<Evidence["band"], string> = { green: "緑（80% 以上）", yellow: "黄（60〜79%）", red: "赤（60% 未満か危ない読み違い）" };

/** SVG を端末で PNG にする（base64） */
async function toPng(svg: string): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, ng) => {
      img.onload = () => ok();
      img.onerror = () => ng(new Error("絵を PNG にできない"));
      img.src = url;
    });
    const cv = document.createElement("canvas");
    cv.width = cv.height = SIZE;
    const g = cv.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, SIZE, SIZE);
    g.drawImage(img, 0, 0, SIZE, SIZE);
    return cv.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Check({ tenant, card, onChange }: { tenant: string; card: CheckedCard; onChange: (c: CheckedCard) => void }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  if (card.status === "signed" || card.status === "stopped") return null;
  const ev = card.verify ?? null;
  const path = `/cards/${encodeURIComponent(card.id)}`;
  const reload = async () => onChange(await req<CheckedCard>(tenant, path));
  const run = (what: string, f: () => Promise<unknown>) => async () => {
    setBusy(what);
    setErr("");
    try {
      await f();
      await reload();
      statsChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const verify = run("verify", async () => {
    if (card.body.motion.kind !== "keyframes") throw new Error("動きの HTML のカードは、コマの PNG を作ってから確かめる");
    const frames = await Promise.all(cutFrames(card.body.motion.json).map(({ frame }) => toPng(renderFrame(frame).svg)));
    await req(tenant, `${path}/verify`, { method: "POST", body: JSON.stringify({ frames }) });
  });
  const move = (to: CardStatus) => run(to, () => req(tenant, `${path}/status`, { method: "POST", body: JSON.stringify({ to }) }));
  // 重さ（11/7 既定）: 監修者が OK・署名の前に決める。本文に入るので版が 1 つ上がる（絵は変わらないので、確かめる AI の証拠は引き継ぐ）
  const setWeight = (w: CardWeight) => run(`weight-${w}`, () => req(tenant, `${path}/weight`, { method: "PUT", body: JSON.stringify({ weight: w, version: card.version }) }));
  const weight = card.body.weight;

  return (
    <section className="card-check" data-testid="card-check" data-evidence={ev ? "1" : "0"}>
      {ev ? (
        <div data-testid="card-evidence">
          <p className={`card-rate band-${ev.band}`} data-testid="card-rate-band" data-band={ev.band}>
            <span>確かめる AI（絵だけを見た新入社員の役）</span>伝わる率 <b data-testid="card-rate">{ev.rate}</b>%・{BAND[ev.band]}
          </p>
          <p>
            見た絵: {ev.frames} コマを順に。伝わったコマ: {ev.cited.length ? ev.cited.map((x) => `${x} コマ目`).join("・") : "無し"}
          </p>
          <p data-testid="card-evidence-reason">なぜ: {ev.reason}</p>
          <details>
            <summary>文ごとの判定と、絵の受け取り方</summary>
            <ul>
              {ev.points.map((p) => (
                <li key={p.id}>
                  {p.id}: {p.credit === "full" ? "合う" : p.credit === "partial" ? "一部" : "合わない"}
                  {p.frame ? `（${p.frame} コマ目）` : ""}・{p.reason}
                </li>
              ))}
            </ul>
            <p>受け取り方: {ev.reading.meaning}</p>
          </details>
        </div>
      ) : (
        <p className="card-wait" data-testid="card-wait">
          <strong>確認待ち</strong>
          <span>確かめる AI の証拠（どの絵を見て・何点で・なぜか）がまだ無いので、OK を押せません</span>
        </p>
      )}
      {(card.status === "pending" || card.status === "ok") && (
        <fieldset className="card-weight" data-testid="card-weight" data-weight={weight ?? ""}>
          <legend>重さ（監修者が決める）{weight ? "" : "・まだ決めていない（それ以外として出る）"}</legend>
          {WEIGHTS.map((w) => (
            <button key={w} className={`pick${weight === w ? " on" : ""}${w === "life" ? " danger" : ""}`} onClick={setWeight(w)} disabled={!!busy || weight === w} data-testid={`card-weight-${w}`} aria-pressed={weight === w}>
              {WEIGHT_LABEL[w]}
            </button>
          ))}
        </fieldset>
      )}
      <div className="card-actions">
        <button className="card-show" onClick={verify} disabled={!!busy} data-testid="card-verify">
          {busy === "verify" ? "確かめる AI が見ています…" : ev ? "もう一度、確かめる AI に見せる" : "確かめる AI に見せる"}
        </button>
        {card.status === "draft" || card.status === "ai_draft" ? (
          <button className="card-show" onClick={move("pending")} disabled={!!busy} data-testid="card-to-pending">
            確認に回す
          </button>
        ) : card.status === "pending" ? (
          <button className="big go" onClick={move("ok")} disabled={!ev || ev.dangerous || !!busy} data-testid="card-ok" title={!ev ? "確認待ち: 証拠が無い" : ev.dangerous ? "危険の印: 直してから確かめ直す" : ""}>
            {!ev ? "OK（確認待ちのため押せない）" : ev.dangerous ? "OK（危険の印のため押せない）" : "OK（署名へ）"}
          </button>
        ) : card.status === "ok" ? (
          <a className="big go" href={`#/t/${encodeURIComponent(tenant)}/sign/${encodeURIComponent(card.id)}`} data-testid="card-to-sign">
            署名へ（監修者）
          </a>
        ) : null}
      </div>
      {err && <p className="err">{err}</p>}
    </section>
  );
}
