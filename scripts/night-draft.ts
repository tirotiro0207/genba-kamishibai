// 夜間の下書きを作る（062 で作り、063 で一括に流す）。仕分け（night-sort.ts）で「する」になったページ（監修者が入れ替えたあとの答え）から、
// 1 ページ K 枚までカードの下書きを作り、確かめる AI に通して確認待ちに入れる。進み具合は D1 の night_drafts に置くので、止めて同じ --run で流し直すと続きから。
//
//   npx tsx scripts/night-draft.ts --sort-run <仕分けの番号> --run <番号> [--remote] [--tenant company] [--per-page 2] [--max 10] [--estimate]
//   --estimate は API を呼ばず、ページの数・カードの数の上限・費用と時間の見込みだけを出す
//   --sub は API の代わりにサブスクリプションの claude -p で呼ぶ（063 の前の通しの確かめ。手元の D1 だけ。費用は API の値段に換算して出すが払わない）
//   --pick は、1 ページの決まりの先頭 N 個でなく、選ぶ段（src/shared/make/pick.ts）で絵で伝わる決まりを選ぶ（063 の前の通しで足した。本番に使うかは作者が決める）
//   --run-max-usd は、この回の費用の合計（前の回の分と取り出しも入れる）の上限。API では既定 30 USD
//   --shard i/n は「する」のページを n 組に分けた i 組目（1 から）だけを流す。サブスクで 4 本くらいを同時に流すときに使う
import { claudePClient } from "../src/node/claude-p-client";
import { loadEnv, makeClient } from "../src/node/client";
import { execD1, wranglerExec } from "../src/node/d1-node";
import { FileCallLog } from "../src/node/file-log";
import { readPages } from "../src/node/night";
import { CARD_MAX_USD, runDrafts, type Steps } from "../src/node/night-draft";
import { imageBlock, svgToPng } from "../src/node/png";
import { dayBudgetUsd, MemoryCallLog, sumAllUsd } from "../src/shared/claude";
import { extractRules, type Rule } from "../src/shared/extract/rules";
import { makeCard } from "../src/shared/make/maker";
import { pickRules } from "../src/shared/make/pick";
import { makeWords } from "../src/shared/make/words";
import { cutFrames } from "../src/shared/picto/motion";
import { renderFrame } from "../src/shared/picto/scene";
import { verifyCard } from "../src/shared/verify/formal";

/** 見込みの元（008 の実測と 093 の測り）: 取り出し 1 回 0.098 USD、1 枚（作成・言葉の欄・確かめる AI）0.152 USD・60 秒。本番の D1 に書く分を 1 枚 30 秒足す */
const EST = { extractUsd: 0.098, cardUsd: 0.152, cardSec: 60, d1Sec: { local: 5, remote: 30 } };

async function main() {
  const args = process.argv.slice(2);
  const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const sortRun = opt("--sort-run");
  const runId = opt("--run");
  if (!sortRun || !runId) throw new Error("使い方: night-draft.ts --sort-run <仕分けの番号> --run <番号> [--remote] [--tenant company] [--per-page 2] [--max 10] [--estimate]");
  const where = args.includes("--remote") ? "remote" : "local";
  const sub = args.includes("--sub");
  if (sub && where === "remote") throw new Error("--sub は手元の D1 だけ（本番には書かない）");
  const shard = opt("--shard")?.split("/").map(Number);
  const tenant = opt("--tenant") ?? "company";
  const perPage = Number(opt("--per-page") ?? 2);
  const max = opt("--max") ? Number(opt("--max")) : undefined;
  // 1 日の上限は .env より、流す命令に付けた API_BUDGET_USD_PER_DAY が勝つ（loadEnvFile は既にある環境変数を上書きしない）
  loadEnv();
  const db = execD1(wranglerExec(where));

  const run = await db.prepare("SELECT doc FROM night_runs WHERE id = ? AND tenant_id = ?").bind(sortRun, tenant).first<{ doc: string }>();
  if (!run) throw new Error(`仕分け ${sortRun} が ${tenant} に無い`);
  const yes = (await db.prepare("SELECT page FROM night_pages WHERE run_id = ? AND tenant_id = ? AND state = 'done' AND card = 1 ORDER BY page").bind(sortRun, tenant).all<{ page: number }>()).results.map((r) => Number(r.page));
  const pages = readPages(run.doc)
    .filter((p) => yes.includes(p.page))
    .filter((_, i) => !shard || i % shard[1] === shard[0] - 1);
  const cardsMax = Math.min(pages.length * perPage, max ?? Infinity);
  const pagesUsed = Math.min(pages.length, Math.ceil(cardsMax / perPage));
  const usd = pagesUsed * EST.extractUsd + cardsMax * EST.cardUsd;
  const hours = (cardsMax * (EST.cardSec + EST.d1Sec[where])) / 3600;
  // サブスクのときは費用の記録を API の記録（FileCallLog）に混ぜない
  const log = sub ? new MemoryCallLog() : new FileCallLog();
  const today = await sumAllUsd(log, new Date(Date.now() - ((Date.now() + 9 * 3600e3) % 86400e3)).toISOString());
  console.log(
    `「する」のページ ${pages.length}・使うページ ${pagesUsed}・カード 最大 ${cardsMax} 枚（1 ページ ${perPage} 枚まで）・費用の見込み 約 ${usd.toFixed(2)} USD・時間の見込み 約 ${hours.toFixed(1)} 時間（${where === "remote" ? "本番" : "手元"}の D1）`,
  );
  console.log(`今日の費用（手元の記録・全部の用途）${today.toFixed(2)} USD・1 日の上限 ${dayBudgetUsd()} USD（.env の API_BUDGET_USD_PER_DAY）・1 枚の上限 ${CARD_MAX_USD} USD`);
  if (args.includes("--estimate")) return;

  const client = sub ? claudePClient() : makeClient();
  const deps = { client, log };
  const since = new Date().toISOString();
  const steps: Steps = {
    extract: (text) => extractRules(deps, "night", text),
    ...(args.includes("--pick") ? { pick: (rules: Rule[], n: number) => pickRules(deps, "night", rules, n) } : {}),
    make: async (rule, locate) => (await makeCard(deps, "night", rule, locate)).card,
    words: async (card) => {
      const w = await makeWords(deps, "night", card);
      return { words: w.words, terms: w.terms };
    },
    render: (card) => (card.motion.kind === "keyframes" ? cutFrames(card.motion.json).map(({ frame }) => svgToPng(renderFrame(frame).svg)) : []),
    verify: (card, frames) => verifyCard(deps, "night", card, frames.map(imageBlock)),
    spent: () => log.sumUsd("night", since),
  };
  const t0 = Date.now();
  const runMaxUsd = opt("--run-max-usd") ? Number(opt("--run-max-usd")) : sub ? undefined : 30;
  const s = await runDrafts({ db, steps, runId, tenant, sortRun, doc: run.doc, pages, perPage, maxCards: max, cardMaxUsd: CARD_MAX_USD, runMaxUsd, log: (l) => console.log(l) });
  console.log(
    `下書き ${s.run_id}: この回 ${s.made_now} 枚・全部 ${s.cards} 枚（赤 ${s.red}・黄 ${s.yellow}・緑 ${s.green}）・失敗 ${s.errors}・費用 ${s.usd.toFixed(2)} USD（うち取り出しと選ぶ段 ${s.extract_usd.toFixed(2)}）${sub ? "（API の値段に換算・払っていない）" : ""}・${((Date.now() - t0) / 60000).toFixed(1)} 分${s.stopped ? `・止めた: ${s.stopped}` : ""}`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
