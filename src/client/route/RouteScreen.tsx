// 経路の画面（053・仕様 §3 出どころ・§6 折りたたみ）。監修者が署名の前に、絵のこの部分が元の文のどこから来たかを確かめる。
// 絵の部品をタップすると、元の文の該当箇所（資料のページと行、または話した言葉の字の範囲）が光り、カードの文と「なぜそう描いたか」が出る。
// 部品の一覧から 1 枚の全部品を順にタップできる。今のコマに無い部品を選ぶと、その部品が見えるコマへ移る。
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { type CardBody, type CardPart, routeOf, type SourceRef } from "../../shared/card";
import { cutFrames } from "../../shared/picto/motion";
import { frameSvg } from "../Safe";
import { req } from "../make/MakeScreen";
import { partBoxes } from "../../shared/boxes";
import "./route.css";

interface CardView {
  id: string;
  status: string;
  body: CardBody;
}

/** 元の文: 資料はページごとの行、話した言葉は入れた文 */
export type Texts = Record<string, string[] | string>;
const docKey = (doc: string, page: number) => `doc:${doc}:${page}`;
const speechKey = (input: string) => `speech:${input}`;

export async function loadTexts(tenant: string, body: CardBody): Promise<Texts> {
  const out: Texts = {};
  // 過去の事故（accident）の出どころは、文そのものを持っているので読みに行かない
  const refs = body.statements.flatMap((s) => s.sources).filter((r): r is Exclude<SourceRef, { kind: "accident" }> => r.kind !== "accident");
  await Promise.all(
    [...new Map(refs.map((r) => [r.kind === "doc" ? docKey(r.doc, r.page) : speechKey(r.input), r])).entries()].map(async ([k, r]) => {
      try {
        if (r.kind === "doc") {
          const p = await req<{ lines: { text: string }[] }>(tenant, `/files/pdf/${encodeURIComponent(r.doc)}/p${String(r.page).padStart(3, "0")}.json`);
          out[k] = p.lines.map((l) => l.text);
        } else {
          const x = await req<{ input: { text: string } }>(tenant, `/extract/${encodeURIComponent(r.input)}`);
          out[k] = x.input.text;
        }
      } catch {
        // 読めない元の文は、位置だけを出す
      }
    }),
  );
  return out;
}

const whereOf = (r: SourceRef) =>
  r.kind === "doc" ? `${r.doc} ${r.page} ページ ${r.line}${r.line_end ? `〜${r.line_end}` : ""} 行` : r.kind === "speech" ? `話した言葉 ${r.start + 1}〜${r.end} 字` : `過去の事故${r.date ? `（${r.date}）` : ""}`;

/** 1 つの元の位置。資料は前後 3 行を添えて該当の行を光らせ、話した言葉は字の範囲を光らせる */
export function Source({ r, texts }: { r: SourceRef; texts: Texts }) {
  // 過去の事故と原因（11/7）: 何が起きたか・原因を、そのまま出す
  if (r.kind === "accident")
    return (
      <figure className="route-src" data-testid="route-accident">
        <figcaption className="route-where">{whereOf(r)}</figcaption>
        <p className="route-speech">
          <b>何が: </b>
          {r.title}
          <br />
          <b>原因: </b>
          {r.cause}
        </p>
      </figure>
    );
  if (r.kind === "doc") {
    const lines = texts[docKey(r.doc, r.page)];
    const end = r.line_end ?? r.line;
    if (!Array.isArray(lines)) return <p className="route-where">{whereOf(r)}（元の文を読めない）</p>;
    const from = Math.max(1, r.line - 3);
    const to = Math.min(lines.length, end + 3);
    return (
      <figure className="route-src">
        <figcaption className="route-where">{whereOf(r)}</figcaption>
        <ol className="make-lines" start={from}>
          {lines.slice(from - 1, to).map((l, i) => {
            const n = from + i;
            const on = n >= r.line && n <= end;
            return (
              <li key={n} className={on ? "lit" : ""} data-lit={on ? "1" : undefined}>
                {l || " "}
              </li>
            );
          })}
        </ol>
      </figure>
    );
  }
  const text = texts[speechKey(r.input)];
  if (typeof text !== "string") return <p className="route-where">{whereOf(r)}（元の文を読めない）</p>;
  return (
    <figure className="route-src">
      <figcaption className="route-where">{whereOf(r)}</figcaption>
      <p className="route-speech">
        {text.slice(0, r.start)}
        <mark data-lit="1">{text.slice(r.start, r.end)}</mark>
        {text.slice(r.end)}
      </p>
    </figure>
  );
}

const partName = (p: CardPart, i: number) => `${i + 1}. ${p.target.type === "figure" ? "人" : p.target.type === "prop" ? "小物" : "部品"}`;

export function RouteScreen({ tenant, cardId }: { tenant: string; cardId: string }) {
  const [card, setCard] = useState<CardView | null>(null);
  const [texts, setTexts] = useState<Texts>({});
  const [err, setErr] = useState("");
  const [at, setAt] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    req<CardView>(tenant, `/cards/${encodeURIComponent(cardId)}`)
      .then((c) => {
        setCard(c);
        return loadTexts(tenant, c.body);
      })
      .then(setTexts)
      .catch((e: Error) => setErr(e.message));
  }, [tenant, cardId]);

  const b = card?.body;
  const json = b?.motion.kind === "keyframes" ? b.motion.json : null;
  const frames = useMemo(() => (json ? cutFrames(json) : []), [json]);
  const boxes = useMemo(() => (json && b ? frames.map((f) => partBoxes(json, f.t, b.parts)) : []), [json, b, frames]);

  if (err) return <p className="err">{err}</p>;
  if (!card || !b) return <p>読み込み中…</p>;
  if (!json) return <p className="done">この絵は部品の位置を持たないので、経路は部品の一覧から見る</p>;

  /** 部品を選ぶ。今のコマに無ければ、見えるコマへ移る */
  const pick = (id: string) => {
    setSel(id);
    if (!boxes[at]?.some((x) => x.part === id)) {
      const j = boxes.findIndex((bs) => bs.some((x) => x.part === id));
      if (j >= 0) setAt(j);
    }
  };
  /**
   * 絵の上の部品を押す。小さい部品が大きい部品（人）の上に重なると、大きい部品が押せなくなる（総点検の 6）。
   * 選んである部品を同じ所でもう一度押すと、その点に重なる次に大きい部品へ移る（小さい → 大きい → 小さい …）
   */
  const tap = (e: MouseEvent<HTMLButtonElement>, part: string) => {
    if (part !== sel) return pick(part);
    const r = e.currentTarget.parentElement!.getBoundingClientRect();
    const [px, py] = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    const under = (boxes[at] ?? []).filter((x) => px >= x.x && px <= x.x + x.w && py >= x.y && py <= x.y + x.h).sort((p, q) => p.w * p.h - q.w * q.h);
    if (under.length < 2) return;
    const i = under.findIndex((x) => x.part === part);
    pick(under[(i + 1) % under.length].part);
  };
  const route = sel ? routeOf(b, sel) : null;
  const idx = sel ? b.parts.findIndex((p) => p.id === sel) : -1;

  return (
    <article className="route" data-testid="route" data-card={card.id}>
      <h1>経路: 絵の部品 → カードの文 → 元の文</h1>
      <div className="route-main">
        <div className="route-pic">
          <div className="route-face" data-testid="route-face" data-frame={at}>
            <span dangerouslySetInnerHTML={{ __html: frameSvg(frames[at]?.frame) }} />
            {/* 大きい箱を先に置き、人の手の小物のような小さい部品を上にしてタップできるようにする */}
            {[...(boxes[at] ?? [])].sort((p, q) => q.w * q.h - p.w * p.h).map((x) => (
              <button
                key={x.part}
                className={`route-hit${x.part === sel ? " on" : ""}`}
                style={{ left: `${x.x * 100}%`, top: `${x.y * 100}%`, width: `${x.w * 100}%`, height: `${x.h * 100}%` }}
                onClick={(e) => tap(e, x.part)}
                aria-label={`部品 ${partName(b.parts.find((p) => p.id === x.part)!, b.parts.findIndex((p) => p.id === x.part))}`}
                data-testid={`hit-${x.part}`}
              />
            ))}
          </div>
          <nav className="route-frames" aria-label="コマ">
            {frames.map((f, j) => (
              <button key={f.t} className={`pick${j === at ? " on" : ""}`} onClick={() => setAt(j)} data-testid={`route-frame-${j}`}>
                {j + 1} コマ目
              </button>
            ))}
          </nav>
          <ol className="route-parts" data-testid="route-parts">
            {b.parts.map((p, i) => (
              <li key={p.id}>
                <button className={`pick${p.id === sel ? " on" : ""}`} onClick={() => pick(p.id)} data-testid={`part-${p.id}`}>
                  {partName(p, i)}
                </button>
              </li>
            ))}
          </ol>
        </div>
        <section className="route-detail" data-testid="route-detail" data-part={sel ?? undefined}>
          {!route ? (
            <p className="done">絵の部品をタップすると、元の文のどこから来たかが光ります</p>
          ) : (
            <>
              <p className="route-reason" data-testid="route-reason">
                <span>なぜそう描いたか</span>
                {route.part.reason}
              </p>
              <p className="route-stmt" data-testid="route-stmt">
                <span>{route.statement.field === "rule" ? "守ること" : "なぜ"}の文{route.statement.ai ? "（元の文に無い。AI 下書き）" : ""}</span>
                {route.statement.text}
              </p>
              <div data-testid="route-sources">
                {route.sources.map((r, i) => (
                  <Source key={i} r={r} texts={texts} />
                ))}
              </div>
              {idx < b.parts.length - 1 && (
                <button className="big" onClick={() => pick(b.parts[idx + 1].id)} data-testid="route-next-part">
                  つぎの部品 →
                </button>
              )}
            </>
          )}
        </section>
      </div>
      <AccidentForm tenant={tenant} card={card} onSaved={setCard} />
    </article>
  );
}

/**
 * 過去の事故と原因を「なぜ」の出どころに足す（11/7 既定）。足すと版が上がり、下書きに戻る（直しの 1 つ）。
 * 何が起きたか・原因は、会社の資料や聞き取りから人が書く（AI に作らせない）
 */
function AccidentForm({ tenant, card, onSaved }: { tenant: string; card: CardView; onSaved: (c: CardView) => void }) {
  const whys = card.body.statements.filter((s) => s.field === "why");
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState(whys[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [cause, setCause] = useState("");
  const [date, setDate] = useState("");
  const [err, setErr] = useState("");
  if (!whys.length) return null;
  if (!open)
    return (
      <button className="pick" onClick={() => setOpen(true)} data-testid="route-accident-open">
        過去の事故を「なぜ」の出どころに足す
      </button>
    );
  const save = async () => {
    setErr("");
    try {
      await req(tenant, `/cards/${encodeURIComponent(card.id)}/accident`, { method: "POST", body: JSON.stringify({ statement: st, title, cause, date: date || undefined }) });
      onSaved(await req<CardView>(tenant, `/cards/${encodeURIComponent(card.id)}`));
      setOpen(false);
      setTitle("");
      setCause("");
      setDate("");
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <section className="route-accident" data-testid="route-accident-form">
      <h2>過去の事故を「なぜ」の出どころに足す</h2>
      <label>
        どの「なぜ」か
        <select value={st} onChange={(e) => setSt(e.target.value)}>
          {whys.map((s) => (
            <option key={s.id} value={s.id}>
              {s.text}
            </option>
          ))}
        </select>
      </label>
      <label>
        何が起きたか
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} data-testid="route-accident-title" />
      </label>
      <label>
        原因
        <input value={cause} onChange={(e) => setCause(e.target.value)} maxLength={500} data-testid="route-accident-cause" />
      </label>
      <label>
        いつ（分かれば。2024・2024-06・2024-06-01 の形）
        <input value={date} onChange={(e) => setDate(e.target.value)} maxLength={10} />
      </label>
      <div className="issue-actions">
        <button className="pick on" disabled={!title.trim() || !cause.trim()} onClick={save} data-testid="route-accident-save">
          足す（版が上がり、下書きに戻る）
        </button>
        <button className="pick" onClick={() => setOpen(false)}>
          やめる
        </button>
      </div>
      {err && <p className="err">{err}</p>}
    </section>
  );
}
