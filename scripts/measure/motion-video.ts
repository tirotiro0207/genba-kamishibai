// Fable 5.1 にモーショングラフィックを作らせ、動画にしてから、紙芝居のコマを切り出す試し（11/2 作者の案）。
// 1 場面 5 秒を 3 場面（報告・連絡・相談）。どの場面も「時刻 t の絵を描く関数」（window.renderAt）を持つ HTML として書かせる。
// その関数を 30 fps で呼んで 1 枚ずつ撮り、ffmpeg で 1 本の動画（15 秒）にし、返させた時刻のコマを動画から切り出す。
// 出力はリポジトリの private/picto/motion-video（git に入れない）。
//
//   npx tsx scripts/measure/motion-video.ts
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { chromium } from "@playwright/test";
import { makeClient } from "../../src/node/client";
import { FileCallLog } from "../../src/node/file-log";
import { privatePath } from "../../src/node/private-dir";
import { costUsd, guardedCall } from "../../src/shared/claude";

const out = privatePath("picto", "motion-video");
mkdirSync(out, { recursive: true });
const W = 1000;
const H = 750;
const FPS = 30;
const SEC = 5;
const MODEL = process.env.MOTION_MODEL || "claude-fable-5-1";

const SYSTEM = (scene: string) => `あなたはモーショングラフィックの作家です。工事現場の新入社員に見せる、文字の無いピクトグラムのアニメーション映像を作ります。
1 つの HTML を書いてください。中に <svg id="stage" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"> を 1 つ置き、
<script> で window.renderAt = (t) => { ... } を定義する。t は秒（0〜${SEC}）。renderAt は t だけで絵が決まる純粋な関数にし（乱数・時計・requestAnimationFrame を使わない）、
呼ぶたびに SVG の要素の属性（transform・opacity・d など）を書き換えて、その時刻の 1 枚にする。最後に renderAt(0) を呼ぶ。
撮影側が 1/${FPS} 秒ずつ renderAt を呼んで動画にするので、CSS のアニメーションや transition は使わない。外のファイル・フォント・ライブラリは読まない。
コードは短く書く（人を描く関数を 1 つ作って使い回し、キーフレームの表と補間の関数で動かす）。HTML 全体で 18,000 字以内。

## 映像の質（いちばん大事）
- モーショングラフィックとして見て気持ちいい動きにする: イージング（ease-in-out・overshoot）、予備動作、歩くときの上下の弾み、吹き出しがポンと出る拡大、うなずき、手を挙げる動き
- 人は自然に見えるように: 丸い頭に目と口、作業のベストを着た胴、2 本の足、丸い手。手足は関節で区切れて見えないよう、縁取りの内側を同じ色でつなぐ。正面・斜め・横のどれを向いてもよく、角度や立ち方は自由
- 場面の最初の 0.4 秒と最後の 0.4 秒は、人が止まった落ち着いた絵にする（3 場面をつないで 1 本にするため）

## 絵柄
- 色は黒と灰色（R=G=B）だけ。白は、背景・吹き出しの中・新人のヘルメットだけ。赤は使わない
- 役はかぶり物で見分ける: 新人＝白いヘルメット、上の人＝黒い帽子（つばは前の横へ）、ほかの作業の人＝灰色のヘルメット
- 場面: 全体を太い枠で囲み、左に薄い灰色の壁（盤や道具がある場所）、下に床の線。人は枠の高さの 6 割くらいの大きさ
- 迷う・考えるは点線の吹き出しと小さい丸、話すはしっぽ付きの吹き出し。中に道具の絵と「？」か「✓」を図形で描く
- 文字・数字は一切置かない（<text> を使わない）
- 盤は角の丸い箱に表示の丸 2 つ（動いているときは右の丸が黒、止めると白）

## 中身（作業場の「報告・連絡・相談」のうちの 1 つ）
${scene}

## 返すもの
- html: HTML の全文
- cuts: 紙芝居のコマにする時刻（0〜${SEC} 秒）を 3 か所。動きの途中ではなく、意味がいちばん伝わる止まった瞬間（吹き出しが出きったところなど）
  meaning はそのコマで伝えたいこと（日本語 1 文）`;

const SCENES = [
  { key: "report", text: "報告: 新人が盤の作業を終え（盤の表示が変わる）、上の人のところへ歩いて行き、終わったことを伝える（話す吹き出しに道具と ✓）。上の人がうなずく" },
  { key: "contact", text: "連絡: 新人が盤を止め（右の丸が白になる）、ほかの作業の人のところへ歩いて行き、止めたことを知らせる（話す吹き出しに、右の丸が白の盤）。作業の人が分かったと手を挙げる" },
  { key: "consult", text: "相談（出てくる人は新人と上の人の 2 人だけ）: 新人が盤の前で迷い（点線の吹き出しに盤と ？）、ひとりで決めずに上の人のところへ歩いて行って聞き（話す吹き出しに盤と ？）、上の人が盤を指して答える（話す吹き出しに盤と ✓）" },
] as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["html", "cuts"],
  properties: {
    html: { type: "string" },
    cuts: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["t", "meaning"], properties: { t: { type: "number" }, meaning: { type: "string" } } },
    },
  },
} as const;

interface Result {
  html: string;
  cuts: { t: number; meaning: string }[];
}

const deps = { client: makeClient(), log: new FileCallLog() };

/** 場面ごとに返った答えはすぐファイルに残し、流し直すときは呼ばずに使う（途中で落ちても費用を無駄にしない） */
async function scene(sc: (typeof SCENES)[number]) {
  const cache = join(out, `${sc.key}.json`);
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf-8")) as { key: string; res: Result; sec: number; usd: number; tokens: number };
  const t0 = Date.now();
  const msg = await guardedCall(deps, {
    purpose: "measure",
    label: `モーショングラフィック（${sc.key}）`,
    params: {
      model: MODEL,
      max_tokens: 18000,
      system: SYSTEM(sc.text),
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: `${SEC} 秒の映像を作ってください。` }],
    } as Anthropic.MessageCreateParamsNonStreaming,
  });
  const sec = (Date.now() - t0) / 1000;
  if (msg.stop_reason !== "end_turn") throw new Error(`${sc.key}: 最後まで返らなかった: ${msg.stop_reason}`);
  const res = JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as Result;
  const done = { key: sc.key, res, sec, usd: costUsd(msg.model, msg.usage), tokens: msg.usage.output_tokens };
  writeFileSync(cache, JSON.stringify(done), "utf-8");
  return done;
}

const settled = await Promise.allSettled(SCENES.map(scene));
const failed = settled.flatMap((r) => (r.status === "rejected" ? [String(r.reason).slice(0, 200)] : []));
if (failed.length) {
  console.log(`返らなかった場面 ${failed.length}: ${failed.join(" / ")}（返った場面はファイルに残した。流し直すとその場面だけ呼ぶ）`);
  process.exit(1);
}
const scenes = settled.map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof scene>>>).value);
const frames = join(out, "frames");
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

// 1/FPS 秒ずつ renderAt を呼んで撮る。3 場面を通し番号でつなぐ
const browser = await chromium.launch();
let k = 0;
const errors: string[] = [];
for (const s of scenes) {
  // 場面ごとに新しいページにする（同じページに書くと、前の場面の変数とぶつかる）
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("pageerror", (e) => errors.push(`${s.key}: ${String(e).slice(0, 200)}`));
  writeFileSync(join(out, `${s.key}.html`), s.res.html, "utf-8");
  writeFileSync(join(out, `${s.key}.cuts.json`), JSON.stringify(s.res.cuts, null, 1), "utf-8");
  await page.setContent(s.res.html);
  for (let i = 0; i < SEC * FPS; i++) {
    await page.evaluate((t) => (window as unknown as { renderAt: (t: number) => void }).renderAt(t), i / FPS);
    await page.locator("#stage").screenshot({ path: join(frames, `f${String(k++).padStart(5, "0")}.png`) });
  }
  await page.close();
}
await browser.close();

const video = join(out, "hourensou.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "f%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", video]);

// 動画から、返させた時刻のコマを切り出す
const cuts: { file: string; scene: string; t: number; meaning: string }[] = [];
scenes.forEach((s, si) => {
  s.res.cuts.forEach((c, ci) => {
    const at = si * SEC + Math.min(SEC - 1 / FPS, Math.max(0, c.t));
    const file = join(out, `${s.key}_${ci + 1}.png`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", at.toFixed(3), "-i", video, "-frames:v", "1", file]);
    cuts.push({ file, scene: s.key, t: at, meaning: c.meaning });
  });
});
writeFileSync(join(out, "cuts.json"), JSON.stringify(cuts, null, 1), "utf-8");
rmSync(frames, { recursive: true, force: true });

for (const s of scenes) console.log(`${s.key}: 費用 ${s.usd.toFixed(4)} USD ・ ${s.sec.toFixed(0)} 秒 ・ 出力 ${s.tokens} トークン ・ HTML ${s.res.html.length} 文字`);
for (const c of cuts) console.log(`  ${c.t.toFixed(2)} 秒 ${c.scene}: ${c.meaning}`);
if (errors.length) console.log(`ページのエラー ${errors.length} 件: ${errors[0]}`);
console.log(`合計 ${scenes.reduce((a, s) => a + s.usd, 0).toFixed(4)} USD ・ 動画 ${video}`);
