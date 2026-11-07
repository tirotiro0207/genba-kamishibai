// 公開デモの架空の会社の 10 枚を、正式な流れで作って署名する（093a）。手元の Worker（BASE_URL）の API を順に呼ぶ:
// 元の文を置き場に入れる → 取り出す → 割り当ての行の決まりを OK → 1 枚ずつ作る（○× の組は場面つき）→ 確認待ち →
// 確かめる AI（コマの PNG をここで描いて送る）→ OK → 監修者が開いて電子印鑑で署名 → ○× を組に結ぶ。
// 架空の会社の監修者の役はこのスクリプトが務める（会社のテナントの署名は人が画面でする）。
//
//   npx tsx scripts/demo-cards.ts            # BASE_URL（既定 http://localhost:5189）の架空の会社に作る
//   npx tsx scripts/demo-cards.ts --force    # 架空の会社にカードがあっても作る
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { svgToPng } from "../src/node/png";
import { privatePath } from "../src/node/private-dir";
import type { CardBody } from "../src/shared/card";
import { cutFrames } from "../src/shared/picto/motion";
import { renderFrame } from "../src/shared/picto/scene";

const ROOT = join(import.meta.dirname, "..");
export const NOTICE = "demo/notice.ja.txt";
export const CARDS = "demo/cards.json";

export interface DemoConf {
  tenant: string;
  doc: string;
  cards: { no: number; line: number; topic: string }[];
  pair: { good: { line: number; topic: string }; bad: { line: number; topic: string } };
}

interface Rule {
  kind: "do" | "dont";
  text: string;
  from: { line: number; line_end: number; found: boolean };
}

export const loadNotice = (root = ROOT) => readFileSync(join(root, NOTICE), "utf-8").replaceAll("\r\n", "\n").trimEnd();
export const loadConf = (root = ROOT) => JSON.parse(readFileSync(join(root, CARDS), "utf-8")) as DemoConf;

/** その行から取り出した決まりの番号（最初のもの）。無ければ -1 */
export const pickRule = (rules: Rule[], line: number) => rules.findIndex((r) => r.from.found && r.from.line <= line && line <= r.from.line_end);

/** 電子印鑑の PNG（四角い枠と「確認」の印。架空の会社の監修者の役） */
export function stampPng(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#fff"/><rect x="10" y="10" width="100" height="100" rx="12" fill="none" stroke="#c4372c" stroke-width="8"/><path d="M34 62 L52 80 L88 40" fill="none" stroke="#c4372c" stroke-width="10"/></svg>`;
  return `data:image/png;base64,${Buffer.from(svgToPng(svg)).toString("base64")}`;
}

/** カードのコマを PNG にする（確かめる AI に送る。画面が描くのと同じ部品） */
export function framePngs(body: CardBody): string[] {
  if (body.motion.kind !== "keyframes") throw new Error("キーフレームの動きではない");
  return cutFrames(body.motion.json).map(({ frame }) => Buffer.from(svgToPng(renderFrame(frame).svg)).toString("base64"));
}

async function main() {
  const BASE = (process.env.BASE_URL ?? "http://localhost:5189").replace(/\/$/, "");
  const conf = loadConf();
  const text = loadNotice();
  const lines = text.split("\n");
  const api = `${BASE}/api/t/${conf.tenant}`;
  const call = async <T>(path: string, init: RequestInit & { role?: string } = {}): Promise<T> => {
    const res = await fetch(`${api}${path}`, { ...init, headers: { "content-type": "application/json", ...(init.role ? { "x-role": init.role } : {}) } });
    const b = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${b.error ?? ""}`);
    return b;
  };
  const post = <T>(path: string, body: unknown, role?: string) => call<T>(path, { method: "POST", body: JSON.stringify(body), role });
  const login = async (role: string) => (await post<{ token: string }>("/login", { role, slot: 1 })).token;

  const existing = (await call<{ cards: unknown[] }>("/cards")).cards.length;
  if (existing && !process.argv.includes("--force")) throw new Error(`架空の会社にカードが ${existing} 枚ある。リセットするか --force`);
  const author = await login("author");
  const supervisor = await login("supervisor");
  const t0 = Date.now();

  // 元の文を置き場に入れる（経路の画面が元の行を出す）
  const page = { page: 1, source: "text", lines: lines.map((t, i) => ({ n: i + 1, text: t, box: [0, 0, 0, 0] })) };
  await call(`/files/pdf/${conf.doc}/index.json`, { method: "PUT", body: JSON.stringify({ doc: conf.doc, pages: [{ page: 1, source: "text", lines: lines.length, chars: text.length }] }), role: author });
  await call(`/files/pdf/${conf.doc}/p001.json`, { method: "PUT", body: JSON.stringify(page), role: author });

  // 取り出す → 割り当ての行の決まりを OK
  const x = await post<{ id: string; rules: Rule[] }>("/extract", { text, source: { kind: "doc", doc: conf.doc, pages: [{ page: 1, lines: lines.length }] } }, author);
  const want = [
    ...conf.cards.map((c) => ({ key: `card${c.no}`, line: c.line, scene: undefined as "good" | "bad" | undefined })),
    { key: "good", line: conf.pair.good.line, scene: "good" as const },
    { key: "bad", line: conf.pair.bad.line, scene: "bad" as const },
  ];
  const plan = want.map((w) => {
    let item = pickRule(x.rules, w.line);
    if (item < 0 && w.key === "bad") item = pickRule(x.rules, conf.pair.good.line);
    if (item < 0) throw new Error(`${w.key}: ${w.line} 行目から決まりが取れなかった（決まり ${x.rules.length}）`);
    return { ...w, item };
  });
  await post(`/extract/${x.id}/ok`, { items: [...new Set(plan.map((p) => p.item))] }, author);

  // 1 枚ずつ作り、確かめて、署名する
  const stamp = stampPng();
  const made: { key: string; id: string; made_as: string; verify: string; status: string; ms: number }[] = [];
  for (const p of plan) {
    const t1 = Date.now();
    const card = await post<{ id: string; status: string; body: CardBody }>(`/extract/${x.id}/make`, { item: p.item, ...(p.scene ? { scene: p.scene } : {}) }, author);
    // 記録の「誰が」はサーバーが役割のしるし（x-role）から決める。本文に名前は送らない
    await post(`/cards/${card.id}/status`, { to: "pending" }, author);
    const v = await post<{ evidence: { rate: number; band: string; dangerous: boolean } }>(`/cards/${card.id}/verify`, { frames: framePngs(card.body) }, author);
    let status = "pending";
    if (!v.evidence.dangerous) {
      await post(`/cards/${card.id}/status`, { to: "ok" }, supervisor);
      const { version } = await post<{ version: number }>(`/cards/${card.id}/open`, {}, supervisor);
      await post(`/cards/${card.id}/sign`, { version, mark: { kind: "stamp", png: stamp } }, supervisor);
      status = "signed";
    }
    made.push({ key: p.key, id: card.id, made_as: card.status, verify: `${v.evidence.band}・${v.evidence.rate}`, status, ms: Date.now() - t1 });
    console.log(`${p.key}: 作った時 ${card.status} → ${status}（${((Date.now() - t1) / 1000).toFixed(0)} 秒）`);
  }

  // ○× を組に結ぶ
  const good = made.find((m) => m.key === "good")!;
  const bad = made.find((m) => m.key === "bad")!;
  await post("/pairs", { good: good.id, bad: bad.id }, author);

  mkdirSync(privatePath("demo"), { recursive: true });
  const out = privatePath("demo", `093a-${Date.now()}.json`);
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), extraction: x.id, rules: x.rules.length, made, sec: (Date.now() - t0) / 1000 }, null, 2), "utf-8");
  console.log(`署名済み ${made.filter((m) => m.status === "signed").length} / ${made.length}・組 1・決まり ${x.rules.length}・${((Date.now() - t0) / 1000).toFixed(0)} 秒。記録は ${out}`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
