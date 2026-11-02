// 姿勢の数字に縛らず、Opus 5.5 に動く SVG を自由に作らせ、場面を切り出して紙芝居にする試し（11/2 作者の案）。
// 「報告・連絡・相談」を 1 場面ずつ 5 秒の動き（CSS のアニメーション）にさせ（3 場面を同時に呼ぶ）、意味の変わる時刻を一緒に返させる。
// その時刻でアニメーションを止めて PNG に撮る。正解の絵を先に作ってから、部品の方を合わせるための手本。
// 出力はリポジトリの private/picto/free-motion（git に入れない）。
//
//   npx tsx scripts/measure/free-motion.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { chromium } from "@playwright/test";
import { makeClient } from "../../src/node/client";
import { FileCallLog } from "../../src/node/file-log";
import { costUsd, guardedCall } from "../../src/shared/claude";
import { checkStyle } from "../../src/shared/picto/style";
import { privatePath } from "../../src/node/private-dir";

const out = privatePath("picto", "free-motion");
mkdirSync(out, { recursive: true });
const W = 1000;
const H = 750;

const SYSTEM = (scene: string) => `あなたは、工事現場の新入社員に見せるピクトグラムのアニメーションを描く作家です。
1 枚の SVG（width ${W}・height ${H}・viewBox "0 0 ${W} ${H}"）を書いてください。動きは SVG の中の <style> の CSS の @keyframes だけで付ける（JavaScript と SMIL は使わない）。
全体の長さは 5 秒ちょうど。どのアニメーションも animation-duration: 5s、animation-iteration-count: infinite、animation-timing-function は自由、animation-delay は使わず、5 秒の中の % で時刻を決める。SVG は簡潔に書く（同じ形は <defs> と <use> で使い回す）。
transform を動かす要素には transform-box: fill-box と transform-origin を必ず書く。

## 絵柄
- 安全標識のようなピクトグラム。ただし人は自然に見えるように描く: 丸い頭に目と口、作業のベストを着た胴、2 本の足、丸い手。
  手足は関節で区切れて見えないよう、縁取りの内側を同じ色でつなぐ（ロボットのように見せない）。姿勢・角度・立ち方は自由
- 色は黒と灰色（R=G=B）だけ。白は、背景・吹き出しの中・新人のヘルメットだけ。赤は使わない
- 役はかぶり物で見分ける: 新人＝白いヘルメット、上の人＝黒い帽子（つばは前の横へ）、ほかの作業の人＝灰色のヘルメット
- 場面: 全体を枠で囲み、左に薄い灰色の壁（盤や道具がある場所）、下に床の線。人は枠の高さの 6 割くらいの大きさ
- 迷う・考えるは点線の吹き出しと小さい丸、話すはしっぽ付きの吹き出し。中に道具の絵と「？」か「✓」を図形で描く
- 文字・数字は一切置かない（<text> を使わない。「？」「✓」も path で描く）
- 盤は角の丸い箱に表示の丸 2 つ

## 動きの中身（作業場の「報告・連絡・相談」のうちの 1 つ）
${scene}
- 人は歩いて移動してよい。吹き出しは出る時だけ見える（opacity で出し入れする）

## 返すもの
- svg: SVG の全文
- cuts: 紙芝居のコマにする時刻（0〜5 秒）を 3 か所。動きの途中ではなく、意味がいちばん伝わる止まった瞬間を選ぶ（吹き出しが出きったところなど）
  meaning はそのコマで伝えたいこと（日本語 1 文）`;

const SCENES = [
  { key: "report", text: "報告: 新人が作業を終え、上の人のところへ行き、終わったことを伝える（話す吹き出しに道具と ✓）。上の人がうなずく" },
  { key: "contact", text: "連絡: 新人が、盤を止めたことを、ほかの作業の人に知らせる（話す吹き出しに盤と止めた印）。作業の人が分かったと手を挙げる" },
  { key: "consult", text: "相談: 新人が盤の前で迷い（点線の吹き出しに盤と ？）、上の人のところへ行って聞き、上の人が答える（話す吹き出しに盤と ✓）" },
] as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["svg", "cuts"],
  properties: {
    svg: { type: "string" },
    cuts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["t", "meaning"],
        properties: { t: { type: "number" }, meaning: { type: "string" } },
      },
    },
  },
} as const;

interface Result {
  svg: string;
  cuts: { t: number; meaning: string }[];
}

const deps = { client: makeClient(), log: new FileCallLog() };

async function scene(sc: (typeof SCENES)[number]) {
  const t0 = Date.now();
  const msg = await guardedCall(deps, {
    purpose: "measure",
    label: `自由な動き（${sc.key}）`,
    params: {
      model: "claude-opus-5-5",
      max_tokens: 20000,
      system: SYSTEM(sc.text),
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: "5 秒のアニメーションを描いてください。" }],
    } as Anthropic.MessageCreateParamsNonStreaming,
  });
  const sec = (Date.now() - t0) / 1000;
  if (msg.stop_reason !== "end_turn") throw new Error(`${sc.key}: 最後まで返らなかった: ${msg.stop_reason}`);
  const res = JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as Result;
  return { key: sc.key, res, sec, usd: costUsd(msg.model, msg.usage), tokens: msg.usage.output_tokens };
}

const scenes = await Promise.all(SCENES.map(scene));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
for (const s of scenes) {
  writeFileSync(join(out, `${s.key}.svg`), s.res.svg, "utf-8");
  writeFileSync(join(out, `${s.key}.cuts.json`), JSON.stringify(s.res.cuts, null, 1), "utf-8");
  // 再生用のページ（ブラウザで開くと 5 秒の動きが繰り返す）
  writeFileSync(join(out, `${s.key}.html`), `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#222;display:grid;place-items:center;height:100vh">${s.res.svg}</body>`, "utf-8");
  // 時刻 t で全部のアニメーションを止めて撮る
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0">${s.res.svg}</body>`);
  for (const [i, c] of s.res.cuts.entries()) {
    await page.evaluate((ms) => {
      for (const a of document.getAnimations()) {
        a.pause();
        a.currentTime = ms;
      }
    }, c.t * 1000);
    await page.locator("svg").first().screenshot({ path: join(out, `${s.key}_${i + 1}.png`) });
  }
  const style = checkStyle(s.res.svg);
  console.log(`${s.key}: 費用 ${s.usd.toFixed(4)} USD ・ ${s.sec.toFixed(0)} 秒 ・ 出力 ${s.tokens} トークン ・ SVG ${s.res.svg.length} 文字 ・ 絵柄の違反 ${style.length}`);
  for (const e of style.slice(0, 3)) console.log(`  違反: ${e}`);
  for (const c of s.res.cuts) console.log(`  ${c.t} 秒: ${c.meaning}`);
}
await browser.close();
console.log(`合計 ${scenes.reduce((a, s) => a + s.usd, 0).toFixed(4)} USD ・ ${out}`);
