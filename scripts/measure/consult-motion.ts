// 相談の場面を Opus 5.5 に描き直させる試し（11/2 作者の指摘を受けて）。
// 前の自由な動き（free-motion.ts）の相談の SVG を下絵として渡し、人の絵柄はそのまま、次の 3 点だけを直させる:
//   かぶり物のつばを顔の向きに付ける / 手や腕を顔に重ねない・人と人を重ねない / 施工管理（上の人）に管理表を持たせる。
// 中身は「どっちを止めればいい？」と聞いて「こっちだよ」と教わる相談。
// 5 秒の CSS の動きを 1/30 秒ずつ止めて撮り、ffmpeg で動画にし、返させた時刻のコマを動画から切り出す。
// 出力はリポジトリの private/picto/consult-motion（git に入れない）。
//
// 2 回目の直し（CONSULT_ROUND=3）は、1 回目の結果を下絵にして、残った 3 点（近すぎる・ヘルメットの傾き・何も指さない手）も直させる。
//
//   npx tsx scripts/measure/consult-motion.ts
//   CONSULT_ROUND=3 npx tsx scripts/measure/consult-motion.ts
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { chromium } from "@playwright/test";
import { makeClient } from "../../src/node/client";
import { FileCallLog } from "../../src/node/file-log";
import { privatePath } from "../../src/node/private-dir";
import { costUsd, guardedCall } from "../../src/shared/claude";
import { checkStyle } from "../../src/shared/picto/style";

const ROUND = Number(process.env.CONSULT_ROUND || "2");
const base = privatePath("picto", ROUND === 2 ? "free-motion" : "consult-motion");
const out = privatePath("picto", ROUND === 2 ? "consult-motion" : `consult-motion-r${ROUND}`);
mkdirSync(out, { recursive: true });
const W = 1000;
const H = 750;
const FPS = 30;
const SEC = 5;

const SYSTEM = `あなたは、工事現場の新入社員に見せるピクトグラムのアニメーションを描く作家です。
1 枚の SVG（width ${W}・height ${H}・viewBox "0 0 ${W} ${H}"）を書いてください。動きは SVG の中の <style> の CSS の @keyframes だけで付ける（JavaScript と SMIL は使わない）。
全体の長さは ${SEC} 秒ちょうど。どのアニメーションも animation-duration: ${SEC}s、animation-iteration-count: infinite、animation-delay は使わず、${SEC} 秒の中の % で時刻を決める。
transform を動かす要素には transform-box: fill-box と transform-origin を必ず書く。SVG は簡潔に書く（同じ形は <defs> と <use> で使い回す）。

## 下絵
ユーザーが前の版の SVG を渡す。人の形（丸い頭・目と口・ベストの胴・手足の太さと色）、壁・床・枠、吹き出しの形は、この下絵のまま使う。変えるのは下の「直すこと」と「中身」だけ。

## 直すこと
1. かぶり物の向き: ヘルメットにも帽子にも、つば（ひさし）を顔の向いている側にだけ出す。新人が振り向いたら、つばも一緒に向きを変える（かぶり物を、向きを反転させる g の中に入れる）。ヘルメットは左右対称の半円にしない
2. 重ねない: 腕・手・持ち物を、自分や相手の顔の前に通さない。2 人の体と体は、いちばん近づいたときも胴 1 つ分（60px）以上あける。吹き出しは人の頭と体にかぶせない
3. 施工管理（上の人・黒い帽子）は、片手に管理表（クリップの付いた板に、横線と四角のチェック欄が数行）をずっと持つ。答えるときは、管理表を見てから、もう片方の手を軽く上げる（相手の顔の方へ伸ばさない）
${ROUND >= 3 ? `4. 近すぎない: 聞くときも答えるときも、2 人の胴と胴の間を 120px 以上あける。管理表も相手の体に触れない
5. うなずきは頭を少し下げるだけにする。かぶり物は頭にぴったり乗せたまま、頭と一緒に動かし、傾けて浮かせない
6. 答えるとき、施工管理の空いた手は、管理表の 1 行を指で指す。何も無い空中へ手を上げない
` : ""}
## 絵柄
- 色は黒と灰色（R=G=B）だけ。白は、背景・吹き出しの中・新人のヘルメット・管理表の紙だけ。赤は使わない
- 文字・数字は一切置かない（<text> を使わない。「？」「✓」も path で描く）
- 出てくる人は 2 人だけ: 新人の電工（白いヘルメット）と、施工管理（黒い帽子・管理表）。ほかの作業の人は出さない

## 中身（作業場の「相談」）
- 新人が盤の前に立つ。盤には同じ形のスイッチ（ブレーカー）が左右に 2 つ並ぶ。新人は「どっちを止めればいい？」と迷う（点線の吹き出しに、2 つのスイッチと「？」）
- 新人は自分で決めずに、施工管理のところへ歩いて行き、聞く（しっぽ付きの吹き出しに、2 つのスイッチと「？」）
- 施工管理が管理表を見て答える（しっぽ付きの吹き出しに、2 つのスイッチのうち右だけを黒い太い丸で囲み「✓」）。新人がうなずく
- 最初の 0.4 秒と最後の 0.4 秒は、人が止まった落ち着いた絵にする

## 返すもの
- svg: SVG の全文
- cuts: 紙芝居のコマにする時刻（0〜${SEC} 秒）を 3 か所。動きの途中ではなく、意味がいちばん伝わる止まった瞬間（吹き出しが出きったところ）
  meaning はそのコマで伝えたいこと（日本語 1 文）`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["svg", "cuts"],
  properties: {
    svg: { type: "string" },
    cuts: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["t", "meaning"], properties: { t: { type: "number" }, meaning: { type: "string" } } },
    },
  },
} as const;

interface Result {
  svg: string;
  cuts: { t: number; meaning: string }[];
}

/** 返った答えはすぐファイルに残し、流し直すときは呼ばずに使う */
async function draw() {
  const cache = join(out, "consult.json");
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf-8")) as { res: Result; sec: number; usd: number; tokens: number };
  const deps = { client: makeClient(), log: new FileCallLog() };
  const t0 = Date.now();
  const msg = await guardedCall(deps, {
    purpose: "measure",
    label: "相談の描き直し",
    params: {
      model: "claude-opus-5-5",
      max_tokens: 20000,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: `前の版の SVG（下絵）です。直すことと中身に合わせて、5 秒のアニメーションを描き直してください。\n\n${readFileSync(join(base, "consult.svg"), "utf-8")}` }],
    } as Anthropic.MessageCreateParamsNonStreaming,
  });
  const sec = (Date.now() - t0) / 1000;
  if (msg.stop_reason !== "end_turn") throw new Error(`最後まで返らなかった: ${msg.stop_reason}`);
  const res = JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as Result;
  const done = { res, sec, usd: costUsd(msg.model, msg.usage), tokens: msg.usage.output_tokens };
  writeFileSync(cache, JSON.stringify(done), "utf-8");
  return done;
}

const d = await draw();
writeFileSync(join(out, "consult.svg"), d.res.svg, "utf-8");
writeFileSync(join(out, "consult.html"), `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#222;display:grid;place-items:center;height:100vh">${d.res.svg}</body>`, "utf-8");

// 1/FPS 秒ずつ全部のアニメーションを止めて撮る
const frames = join(out, "frames");
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0">${d.res.svg}</body>`);
for (let i = 0; i < SEC * FPS; i++) {
  await page.evaluate((ms) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = ms;
    }
  }, (i * 1000) / FPS);
  await page.locator("svg").first().screenshot({ path: join(frames, `f${String(i).padStart(5, "0")}.png`) });
}
await browser.close();

const video = join(out, "consult.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "f%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", video]);
const cuts = d.res.cuts.map((c, i) => {
  const at = Math.min(SEC - 1 / FPS, Math.max(0, c.t));
  const file = join(out, `consult_${i + 1}.png`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", at.toFixed(3), "-i", video, "-frames:v", "1", file]);
  return { file, t: at, meaning: c.meaning };
});
writeFileSync(join(out, "cuts.json"), JSON.stringify(cuts, null, 1), "utf-8");
rmSync(frames, { recursive: true, force: true });

// 前の版（上の段）と今回（下の段）を並べた 1 枚
const row = (files: string[]) => files.flatMap((f) => ["-i", f]);
const before = [1, 2, 3].map((i) => join(base, `consult_${i}.png`));
const after = cuts.map((c) => c.file);
const n = before.length + after.length;
const scaled = Array.from({ length: n }, (_, i) => `[${i}:v]scale=480:-1[s${i}]`).join(";");
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", ...row(before), ...row(after),
  "-filter_complex", `${scaled};[s0][s1][s2]hstack=3[a];[s3][s4][s5]hstack=3[b];[a][b]vstack=2`,
  "-frames:v", "1", join(out, "sheet.png"),
]);

const style = checkStyle(d.res.svg);
console.log(`費用 ${d.usd.toFixed(4)} USD ・ ${d.sec.toFixed(0)} 秒 ・ 出力 ${d.tokens} トークン ・ SVG ${d.res.svg.length} 文字 ・ 絵柄の違反 ${style.length}`);
for (const e of style.slice(0, 3)) console.log(`  違反: ${e}`);
for (const c of cuts) console.log(`  ${c.t.toFixed(2)} 秒: ${c.meaning}`);
console.log(`動画 ${video}`);
