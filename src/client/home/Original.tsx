// 原文の見せ方（11/6 作者「見た目と文が汚すぎる。きれいに整えて。資料の何ページかも」）。
// 同じページの続いた行は 1 つにまとめ、「資料の名前 ○ ページ（○〜○ 行）」の見出しのあとに、行の切れ目をつないだ 1 つの文で出す。
// 「・」だけの行と空の行は落とし、「・」で始まる行は箇条書きの 1 項目にする。少し上の見出し（(3) 作業確認 など）があれば添える。
// 「前後の行も見る」で、行番号つきの元の行（経路の画面と同じ）を出す
import { useState } from "react";
import type { SourceRef } from "../../shared/card";
import { Source, type Texts } from "../route/RouteScreen";

type Doc = Extract<SourceRef, { kind: "doc" }>;
interface Span {
  doc: string;
  page: number;
  from: number;
  to: number;
}

/** 同じ資料・同じページで、重なるか続く行の範囲を 1 つにまとめる。資料・ページ・行の順 */
export function spans(refs: SourceRef[]): Span[] {
  const docs = refs.filter((r): r is Doc => r.kind === "doc").map((r) => ({ doc: r.doc, page: r.page, from: r.line, to: r.line_end ?? r.line }));
  docs.sort((a, b) => (a.doc < b.doc ? -1 : a.doc > b.doc ? 1 : a.page - b.page || a.from - b.from));
  const out: Span[] = [];
  for (const s of docs) {
    const last = out[out.length - 1];
    if (last && last.doc === s.doc && last.page === s.page && s.from <= last.to + 1) last.to = Math.max(last.to, s.to);
    else out.push({ ...s });
  }
  return out;
}

const isHeading = (l: string) => /^\s*(\(\s*[0-9０-９]+\s*\)|（\s*[0-9０-９]+\s*）|[0-9０-９]+\s*[).）]|[0-9０-９]+[.．]\s|【|■|◆|●|第[0-9０-９一二三四五六七八九十]+)/.test(l);
const isBlank = (l: string) => /^\s*[・･·]?\s*$/.test(l);

/** 行を、箇条書きの項目ごとの文にまとめる。行の切れ目は日本語なのでそのままつなぐ */
export function tidy(lines: string[]): string[] {
  const items: string[] = [];
  for (const raw of lines) {
    if (isBlank(raw)) continue;
    const l = raw.trim();
    const bullet = /^[・･·]/.test(l);
    const text = l.replace(/^[・･·]\s*/, "");
    if (bullet || !items.length) items.push(text);
    else items[items.length - 1] += text;
  }
  return items;
}

/** 範囲より上の、近い見出し（8 行まで遡る） */
function headingOf(lines: string[], from: number): string | null {
  for (let n = from - 1; n >= Math.max(1, from - 8); n--) {
    const l = lines[n - 1] ?? "";
    if (isHeading(l)) return l.trim();
  }
  return null;
}

export function Original({ refs, texts, labels }: { refs: SourceRef[]; texts: Texts; labels: Record<string, string> }) {
  const [around, setAround] = useState(false);
  const list = spans(refs);
  return (
    <div className="orig" data-testid="home-src">
      {list.map((s) => {
        const lines = texts[`doc:${s.doc}:${s.page}`];
        const name = labels[s.doc] ?? "資料";
        const where = `${name} ${s.page} ページ（${s.from === s.to ? `${s.from} 行` : `${s.from}〜${s.to} 行`}）`;
        if (!Array.isArray(lines))
          return (
            <p key={where} className="orig-where">
              {where}（元の文を読めない）
            </p>
          );
        const head = headingOf(lines, s.from);
        const items = tidy(lines.slice(s.from - 1, s.to));
        return (
          <figure key={where} className="orig-item" data-testid="home-src-item">
            <figcaption className="orig-where">
              <strong>{name}</strong> {s.page} ページ
              <span>{s.from === s.to ? `${s.from} 行` : `${s.from}〜${s.to} 行`}</span>
            </figcaption>
            {head && <p className="orig-head">{head}</p>}
            <blockquote className="orig-text">
              {items.length > 1 ? (
                <ul>
                  {items.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              ) : (
                <p>{items[0] ?? ""}</p>
              )}
            </blockquote>
            {around && <Source r={{ kind: "doc", doc: s.doc, page: s.page, line: s.from, ...(s.to > s.from ? { line_end: s.to } : {}) }} texts={texts} />}
          </figure>
        );
      })}
      {refs
        .filter((r) => r.kind === "speech")
        .map((r, i) => (
          <Source key={`sp${i}`} r={r} texts={texts} />
        ))}
      {list.length > 0 && (
        <button type="button" className="orig-more" onClick={() => setAround(!around)} data-testid="home-src-around">
          {around ? "前後の行を閉じる" : "前後の行も見る（行番号つき）"}
        </button>
      )}
    </div>
  );
}
