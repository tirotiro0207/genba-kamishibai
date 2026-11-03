// 折りたたみの画面（081・仕様 §6 絵は情報を折りたたんだもの）。カードの元のページが 1 枚ずつ積み重なり、文字数のカウンターが上がる。
// 積み終わると、束が 1 枚のカードにたたまれ、絵の面の字数（0 字）が出る。ページの中身は出さない（紙には行の長さだけの灰色の線を引く）。
// 「動きを減らす」設定では、積み終わった数と、たたんだあとを動かさずに出す。
import { useEffect, useState } from "react";
import type { CardBody } from "../../shared/card";
import { faceText } from "../../shared/card-face";
import { type FoldPage, foldPage, foldTotal } from "../../shared/fold";
import { cutFrames } from "../../shared/picto/motion";
import { renderFrame } from "../../shared/picto/scene";
import { req } from "../make/MakeScreen";
import { useReducedMotion } from "../motion/Slide";
import "./fold.css";

/** 1 ページを積む間（ミリ秒）と、たたむ動き */
export const STACK_MS = 550;
export const FOLD_MS = 700;

async function loadPages(tenant: string, body: CardBody): Promise<FoldPage[]> {
  const refs = body.statements.flatMap((s) => s.sources);
  const docs = [...new Map(refs.filter((r) => r.kind === "doc").map((r) => [`${r.doc}:${r.page}`, r])).values()];
  const speech = [...new Set(refs.flatMap((r) => (r.kind === "speech" ? [r.input] : [])))];
  const pages = await Promise.all([
    ...docs.map(async (r) => {
      if (r.kind !== "doc") throw new Error("資料ではない");
      const p = await req<{ lines: { text: string }[] }>(tenant, `/files/pdf/${encodeURIComponent(r.doc)}/p${String(r.page).padStart(3, "0")}.json`);
      return foldPage(r.doc, r.page, p.lines.map((l) => l.text));
    }),
    ...speech.map(async (id, i) => {
      const x = await req<{ input: { text: string } }>(tenant, `/extract/${encodeURIComponent(id)}`);
      return foldPage("speech", i + 1, x.input.text.split("\n"));
    }),
  ]);
  return pages.sort((a, b) => (a.doc === b.doc ? a.page - b.page : a.doc === "speech" ? 1 : -1));
}

/** 中身の無い紙。行の長さだけの線を引く */
function Sheet({ p, i, n }: { p: FoldPage; i: number; n: number }) {
  const max = Math.max(...p.bars, 1);
  const bars = p.bars.slice(0, 34);
  return (
    <div className="fold-sheet" style={{ ["--i" as string]: i, ["--n" as string]: n }} data-testid="fold-sheet">
      <span className="fold-label">{p.doc === "speech" ? "話した言葉" : `p.${p.page}`}</span>
      {bars.map((b, j) => (
        <i key={j} style={{ width: `${b ? 12 + (b / max) * 80 : 0}%` }} />
      ))}
    </div>
  );
}

export function FoldScreen({ tenant, cardId }: { tenant: string; cardId: string }) {
  const reduce = useReducedMotion();
  const [card, setCard] = useState<CardBody | null>(null);
  const [pages, setPages] = useState<FoldPage[] | null>(null);
  const [err, setErr] = useState("");
  const [shown, setShown] = useState(0);
  const [folded, setFolded] = useState(false);
  const [run, setRun] = useState(0);
  useEffect(() => {
    req<{ body: CardBody }>(tenant, `/cards/${encodeURIComponent(cardId)}`)
      .then(async (c) => {
        setCard(c.body);
        // 元の文（資料のページか話した言葉）が置き場に無いと、サーバーは「無い」とだけ返す。何が無いのか分かる文にする（総点検の 5）
        setPages(
          await loadPages(tenant, c.body).catch(() => {
            throw new Error("このカードの元の文（資料のページか、話した言葉）が見つからないので、折りたたみを見せられません");
          }),
        );
      })
      .catch((e: Error) => setErr(e.message));
  }, [tenant, cardId]);

  // 1 ページずつ積み、積み終わったらたたむ
  useEffect(() => {
    if (!pages) return;
    if (reduce) {
      setShown(pages.length);
      setFolded(true);
      return;
    }
    setShown(0);
    setFolded(false);
    const ts = pages.map((_, i) => setTimeout(() => setShown(i + 1), (i + 1) * STACK_MS));
    ts.push(setTimeout(() => setFolded(true), (pages.length + 1) * STACK_MS));
    return () => ts.forEach(clearTimeout);
  }, [pages, reduce, run]);

  if (err) return <p className="err">{err}</p>;
  if (!card || !pages) return <p>読み込み中…</p>;
  const total = foldTotal(pages);
  const count = foldTotal(pages.slice(0, shown));
  const svg = card.motion.kind === "keyframes" ? renderFrame(cutFrames(card.motion.json)[0].frame).svg : "";
  const face = faceText(svg).length;

  return (
    <article className="fold" data-testid="fold" data-phase={folded ? "folded" : "stack"}>
      <div className="fold-counter" aria-live="polite">
        {folded ? (
          <p data-testid="fold-result">
            <b>{pages.length}</b> ページ・<b>{total.toLocaleString()}</b> 字 → <b>1</b> 枚・<b data-testid="fold-face-chars">{face}</b> 字
          </p>
        ) : (
          <p>
            <b data-testid="fold-pages">{shown}</b> ページ・<b data-testid="fold-count">{count.toLocaleString()}</b> 字
          </p>
        )}
      </div>
      <div className="fold-stage">
        <div className={`fold-stack${folded ? " gone" : ""}`} style={{ ["--fold-ms" as string]: `${FOLD_MS}ms` }}>
          {pages.slice(0, shown).map((p, i) => (
            <Sheet key={`${p.doc}:${p.page}`} p={p} i={i} n={pages.length} />
          ))}
        </div>
        <div className={`fold-card${folded ? " on" : ""}`} style={{ ["--fold-ms" as string]: `${FOLD_MS}ms` }} data-testid="fold-card" aria-hidden={!folded}>
          <span dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      </div>
      <p className="done">数えたのは元のページの文字（空白を除く）。開けば、絵の部品から元の文へ辿れる</p>
      <nav className="fold-nav">
        <button className="big" onClick={() => setRun((r) => r + 1)} disabled={!folded} data-testid="fold-again">
          もう一度
        </button>
        <a className="big go" href={`#/t/${encodeURIComponent(tenant)}/route/${encodeURIComponent(cardId)}`} data-testid="fold-route">
          開いて経路を見る
        </a>
      </nav>
    </article>
  );
}
