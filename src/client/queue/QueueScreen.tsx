// 確認待ちの列と、仕分けの入れ替え（061）。監修者が見るカードを赤から先に並べ、夜間の仕分けの「カードにする／しない」を入れ替えて保存する。
import { useEffect, useState } from "react";
import type { CardStatus } from "../../shared/card";
import { STATUS_LABEL } from "../../shared/card";
import type { Band } from "../../shared/verify/formal";
import { req } from "../make/MakeScreen";
import "./queue.css";

interface QueueCard {
  id: string;
  status: CardStatus;
  band: Band | null;
  dangerous: boolean;
  rate: number | null;
  /** 夜間の一括で作ったカード（11/6） */
  night?: boolean;
  rule: string;
}

export interface SortPageRow {
  page: number;
  state: string;
  card: boolean | null;
  ai_card: boolean | null;
  reason: string | null;
  swapped_by: string | null;
  swapped_at: string | null;
  swap_reason: string | null;
}

interface SortList {
  run: { id: string; doc: string; pages: number; finished_at: string | null } | null;
  pages: SortPageRow[];
}

const BAND_LABEL: Record<Band, string> = { red: "赤", yellow: "黄", green: "緑" };

export function QueueScreen({ tenant }: { tenant: string }) {
  const [cards, setCards] = useState<QueueCard[] | null>(null);
  const [sort, setSort] = useState<SortList | null>(null);
  const [why, setWhy] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    req<{ cards: QueueCard[] }>(tenant, "/queue").then((r) => setCards(r.cards), (e: Error) => setErr(e.message));
    req<SortList>(tenant, "/sort").then(setSort, (e: Error) => setErr(e.message));
  }, [tenant]);

  async function swap(p: SortPageRow) {
    if (!sort?.run || p.card === null) return;
    setErr("");
    try {
      const row = await req<SortPageRow>(tenant, `/sort/${encodeURIComponent(sort.run.id)}/${p.page}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ card: !p.card, reason: why.trim() || undefined }) });
      setSort({ ...sort, pages: sort.pages.map((x) => (x.page === row.page ? row : x)) });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const yes = sort?.pages.filter((p) => p.card === true).length ?? 0;
  const no = sort?.pages.filter((p) => p.card === false).length ?? 0;
  return (
    <section className="queue" data-testid="queue">
      <h1>確認待ち</h1>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="queue-box">
        <h2>確認待ちの列 {cards && <span className="queue-meta">{cards.length} 枚・赤から先</span>}</h2>
        {cards?.length === 0 && <p className="queue-meta">確認待ちのカードはありません</p>}
        <ol className="queue-list" data-testid="queue-list">
          {cards?.map((c) => (
            <li key={c.id} data-testid="queue-item" data-band={c.band ?? "none"}>
              <span className={`queue-band band-${c.dangerous ? "red" : (c.band ?? "none")}`}>{c.dangerous ? "危険" : c.band ? BAND_LABEL[c.band] : "未"}</span>
              {c.night && (
                <span className="queue-night" data-testid="queue-night">
                  夜間
                </span>
              )}
              <a href={`#/t/${tenant}/card/${c.id}`}>{c.rule}</a>
              <span className="queue-meta">
                {STATUS_LABEL[c.status]}
                {c.rate !== null && `・伝わる率 ${c.rate}%`}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="queue-box">
        <h2>仕分けの一覧 {sort?.run && <span className="queue-meta">する {yes}・しない {no}（全 {sort.run.pages} ページ）</span>}</h2>
        {sort && !sort.run && <p className="queue-meta">まだ夜間の仕分けを流していません</p>}
        {sort?.run && (
          <label className="queue-why">
            入れ替えの理由（なくてもよい）
            <input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} data-testid="swap-why" />
          </label>
        )}
        <table className="queue-sort" data-testid="sort-list">
          <tbody>
            {sort?.pages.map((p) => (
              <tr key={p.page} data-testid="sort-row" data-page={p.page} data-card={p.card === null ? "none" : p.card ? "yes" : "no"}>
                <td className="queue-page">{p.page}</td>
                <td>
                  <b className={p.card ? "sort-yes" : "sort-no"}>{p.card === null ? "まだ" : p.card ? "する" : "しない"}</b>
                  {p.swapped_at && p.card !== p.ai_card && <span className="queue-swapped">入れ替えた</span>}
                </td>
                <td className="queue-reason">
                  {p.reason}
                  {p.swap_reason && <span className="queue-meta">（入れ替えの理由: {p.swap_reason}）</span>}
                </td>
                <td>
                  {p.card !== null && (
                    <button type="button" onClick={() => swap(p)} data-testid="sort-swap">
                      {p.card ? "しないにする" : "するにする"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
