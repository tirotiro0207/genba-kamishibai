// 夜間の下書きの走り手（062）。仕分けで「する」のページ → 取り出し → カードの下書き（角度と人形の動き・言葉の欄）→ 確かめる AI（作り直しは無し）。
// カードは全部、未承認の下書きとして作り、確かめたら確認待ち（pending）に移す。赤は確認待ちの列の先頭に並ぶ（061）。
// カードと監査の記録は Worker と同じ関数（createCard・appendAudit・addTerms）で D1 に書く。進み具合は night_drafts に置き、止めて走らせ直すと続きから。
// AI を呼ぶところ（取り出し・作成・言葉・確かめ）は Steps として渡す。テストは作りものを、本番は scripts/night-draft.ts が本物を渡す。
import { createHash } from "node:crypto";
import type { CardBody } from "../shared/card";
import type { Rule } from "../shared/extract/rules";
import type { OkRule } from "../shared/make/maker";
import type { Term } from "../shared/make/words";
import type { Evidence } from "../shared/verify/formal";
import { appendAudit } from "../worker/audit";
import { addTerms, createCard, getCard } from "../worker/cards";
import { type InputSource, locator, whereIs } from "../worker/extract";
import type { NightPage } from "./night";

export interface Steps {
  /** 1 ページの文から決まりを取り出す */
  extract(text: string): Promise<Rule[]>;
  /** OK した 1 つの決まりから、カードの下書き（文・動き・部品）を作る */
  make(rule: OkRule, locate: ReturnType<typeof locator>): Promise<CardBody>;
  /** 言葉の欄（やさしい日本語とベトナム語）と、出てきた現場の言葉 */
  words(card: CardBody): Promise<{ words: { ja: string; vi: string }; terms: Term[] }>;
  /** コマを PNG にする（人形の絵） */
  render(card: CardBody): Uint8Array[];
  /** 確かめる AI（正式版・047）。絵だけを順に見せる */
  verify(card: CardBody, frames: Uint8Array[]): Promise<Evidence>;
  /** ここまでに使った費用（USD）。1 枚ごとの差で、その枚の費用を出す */
  spent(): Promise<number>;
}

export interface DraftOptions {
  db: D1Database;
  steps: Steps;
  runId: string;
  tenant: string;
  /** どの仕分けの「する」のページから作るか（night_runs の id） */
  sortRun: string;
  doc: string;
  /** 「する」のページの文。仕分けの「する」で絞ってから渡す */
  pages: NightPage[];
  /** 1 ページから作るカードの数の上限 */
  perPage: number;
  /** この回で作るカードの数の上限（試しで 10 枚など）。無ければ全部 */
  maxCards?: number;
  /** 1 枚の費用がこれを超えたら止める（008 の実測の数倍） */
  cardMaxUsd: number;
  /** これだけ続けて失敗したら止める */
  maxErrorsInRow?: number;
  log?: (line: string) => void;
}

export interface DraftSummary {
  run_id: string;
  pages: number;
  /** この回に作ったカード */
  made_now: number;
  /** 全部のカード（前の回までの分も） */
  cards: number;
  red: number;
  yellow: number;
  green: number;
  errors: number;
  usd: number;
  /** 止めた理由（最後まで行けば null） */
  stopped: string | null;
}

/** 1 枚の費用の上限（008 の実測: 取り出し・作成・確かめる AI・言葉の欄で 10 枚 1.62 USD、1 枚 0.16 USD の 3 倍） */
export const CARD_MAX_USD = 0.5;

const ACTOR = "night";
type Row = { page: number; item: number; state: string; extraction_id: string | null; card_id: string | null };

async function rows(db: D1Database, runId: string, page: number) {
  return (await db.prepare("SELECT page, item, state, extraction_id, card_id FROM night_drafts WHERE run_id = ? AND page = ? ORDER BY item").bind(runId, page).all<Row>()).results;
}

const set = (db: D1Database, runId: string, page: number, item: number, cols: Record<string, unknown>) => {
  const keys = Object.keys(cols);
  return db
    .prepare(`UPDATE night_drafts SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE run_id = ? AND page = ? AND item = ?`)
    .bind(...keys.map((k) => cols[k]), runId, page, item)
    .run();
};

/** そのページの取り出し。前の回に取り出していれば、それを使う（取り出しを二重に払わない） */
async function extractPage(o: DraftOptions, p: NightPage): Promise<{ id: string; rules: Rule[]; text: string; source: InputSource }> {
  const { db } = o;
  const text = p.text.replaceAll("\r\n", "\n").trim();
  const source: InputSource = { kind: "doc", doc: o.doc, pages: [{ page: p.page, lines: text.split("\n").length }] };
  const head = (await rows(db, o.runId, p.page)).find((r) => r.item === -1);
  if (head?.state === "done" && head.extraction_id) {
    const x = await db.prepare("SELECT rules FROM extractions WHERE id = ? AND tenant_id = ?").bind(head.extraction_id, o.tenant).first<{ rules: string }>();
    if (x) return { id: head.extraction_id, rules: JSON.parse(x.rules) as Rule[], text, source };
  }
  await db.prepare("INSERT OR IGNORE INTO night_drafts (run_id, tenant_id, sort_run, page, item) VALUES (?, ?, ?, ?, -1)").bind(o.runId, o.tenant, o.sortRun, p.page).run();
  await set(db, o.runId, p.page, -1, { state: "running" });
  const rules = (await o.steps.extract(text)).map((r) => ({ ...r, where: whereIs(source, r.from.line), reasons: r.reasons.map((x) => ({ ...x, where: whereIs(source, x.from.line) })) }));
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO extractions (id, tenant_id, input, rules) VALUES (?, ?, ?, ?)").bind(id, o.tenant, JSON.stringify({ text, focus: null, source }), JSON.stringify(rules)).run();
  // 夜間の走り手が OK した印（人の OK ではない）。カードは全部未承認の下書きなので、人は確認待ちの列で見る
  const items = rules.slice(0, o.perPage).map((_, i) => i);
  await db.prepare("INSERT INTO extraction_oks (extraction_id, tenant_id, items, actor) VALUES (?, ?, ?, ?)").bind(id, o.tenant, JSON.stringify(items), ACTOR).run();
  for (const i of items) await db.prepare("INSERT OR IGNORE INTO night_drafts (run_id, tenant_id, sort_run, page, item, extraction_id) VALUES (?, ?, ?, ?, ?, ?)").bind(o.runId, o.tenant, o.sortRun, p.page, i, id).run();
  await set(db, o.runId, p.page, -1, { state: "done", extraction_id: id });
  return { id, rules, text, source };
}

/** 1 枚: 作る（card_id が無ければ）→ 絵 → 確かめる → 確認待ちに移す */
async function draftOne(o: DraftOptions, x: { id: string; rules: Rule[]; text: string; source: InputSource }, r: Row) {
  const { db, steps } = o;
  let cardId = r.card_id;
  if (!cardId) {
    const rule = x.rules[r.item] as OkRule;
    const card = await steps.make(rule, locator(x.id, x.text, x.source));
    const w = await steps.words(card);
    const row = await createCard(db, o.tenant, { ...card, words: w.words }, ACTOR, [rule.from.quote, ...rule.reasons.map((y) => y.from.quote)]);
    await addTerms(db, o.tenant, row.id, w.terms);
    cardId = row.id;
    // 作ったところで印を付ける。ここで止まっても、走らせ直しはこのカードを確かめるだけにする（二重に作らない）
    await set(db, o.runId, r.page, r.item, { state: "made", card_id: cardId });
  }
  const now = (await getCard(db, o.tenant, cardId))!;
  const body = JSON.parse(now.body) as CardBody;
  const frames = steps.render(body);
  const e = await steps.verify(body, frames);
  const png_sha256 = frames.map((f) => createHash("sha256").update(f).digest("hex"));
  await appendAudit(db, o.tenant, { card_id: cardId, kind: "verify", actor: e.agent, payload: { version: now.version, evidence: e, png_sha256 } });
  if (now.status === "draft" || now.status === "ai_draft") {
    await db.prepare("UPDATE cards SET status = 'pending', updated_at = datetime('now') WHERE id = ? AND tenant_id = ? AND status = ?").bind(cardId, o.tenant, now.status).run();
    await appendAudit(db, o.tenant, { card_id: cardId, kind: "status", actor: ACTOR, payload: { version: now.version, from: now.status, to: "pending" } });
  }
  return e;
}

export async function runDrafts(o: DraftOptions): Promise<DraftSummary> {
  const { db } = o;
  const log = o.log ?? (() => {});
  const max = o.maxCards ?? Infinity;
  let madeNow = 0;
  let errors = 0;
  let inRow = 0;
  let stopped: string | null = null;
  pages: for (const p of o.pages) {
    if (madeNow >= max) break;
    let x;
    try {
      x = await extractPage(o, p);
    } catch (e) {
      const msg = (e as Error).message;
      await set(db, o.runId, p.page, -1, { state: "error", error: msg.slice(0, 500) });
      errors++;
      log(`p${p.page}: 取り出しに失敗（${msg}）`);
      if (++inRow >= (o.maxErrorsInRow ?? 3)) {
        stopped = `${inRow} 回続けて失敗`;
        break;
      }
      continue;
    }
    for (const r of await rows(db, o.runId, p.page)) {
      if (r.item < 0 || r.state === "done") continue;
      if (madeNow >= max) break pages;
      const before = await o.steps.spent();
      const t0 = Date.now();
      await set(db, o.runId, r.page, r.item, { state: r.card_id ? "made" : "running" });
      await db.prepare("UPDATE night_drafts SET attempts = attempts + 1 WHERE run_id = ? AND page = ? AND item = ?").bind(o.runId, r.page, r.item).run();
      try {
        const e = await draftOne(o, x, r);
        const usd = (await o.steps.spent()) - before;
        await set(db, o.runId, r.page, r.item, { state: "done", band: e.band, dangerous: e.dangerous ? 1 : 0, rate: e.rate, usd, ms: Date.now() - t0, error: null });
        madeNow++;
        inRow = 0;
        log(`p${r.page}-${r.item}: ${e.dangerous ? "危険" : e.band}（${e.rate}%）・${usd.toFixed(3)} USD`);
        if (usd > o.cardMaxUsd) {
          stopped = `1 枚の費用 ${usd.toFixed(3)} USD が上限 ${o.cardMaxUsd} USD を超えた`;
          break pages;
        }
      } catch (e) {
        const msg = (e as Error).message;
        await set(db, o.runId, r.page, r.item, { state: "error", error: msg.slice(0, 500) });
        errors++;
        log(`p${r.page}-${r.item}: 失敗（${msg}）`);
        if (++inRow >= (o.maxErrorsInRow ?? 3)) {
          stopped = `${inRow} 回続けて失敗`;
          break pages;
        }
      }
    }
  }
  if (stopped) log(`止めた: ${stopped}`);
  const all = (await db.prepare("SELECT band, dangerous, usd FROM night_drafts WHERE run_id = ? AND item >= 0 AND state = 'done'").bind(o.runId).all<{ band: string; dangerous: number; usd: number }>()).results;
  const count = (b: string) => all.filter((r) => (b === "red" ? r.band === "red" || r.dangerous === 1 : r.band === b && r.dangerous !== 1)).length;
  return { run_id: o.runId, pages: o.pages.length, made_now: madeNow, cards: all.length, red: count("red"), yellow: count("yellow"), green: count("green"), errors, usd: all.reduce((s, r) => s + (r.usd ?? 0), 0), stopped };
}
