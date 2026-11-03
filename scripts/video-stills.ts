// 動画の承の素材 2 枚を描いて private/material/ に置く（029）。API は使わない
//   npx tsx scripts/video-stills.ts
// 出るもの: 029-写真A/poster.png（壁に貼った貼り紙。文字はぼかし、「イメージ」と添える）・029-作業服/burnt-jacket.png と .svg
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { svgToPng } from "../src/node/png";
import { privatePath } from "../src/node/private-dir";
import { burntJacketSvg, posterSvg } from "../src/shared/video/stills";

const dir = privatePath("material");
const poster = join(dir, "029-写真A");
const jacket = join(dir, "029-作業服");
mkdirSync(poster, { recursive: true });
mkdirSync(jacket, { recursive: true });

// 貼り紙は字を描くので、手元の日本語の字体を読む（ぼかすので字体の違いは見えない）
const p = new Resvg(posterSvg(), { fitTo: { mode: "width", value: 1920 }, background: "#ffffff", font: { loadSystemFonts: true, defaultFontFamily: "Yu Gothic" } });
writeFileSync(join(poster, "poster.png"), p.render().asPng());
writeFileSync(join(poster, "poster.svg"), posterSvg());

const j = burntJacketSvg();
writeFileSync(join(jacket, "burnt-jacket.svg"), j);
writeFileSync(join(jacket, "burnt-jacket.png"), svgToPng(j));
console.log(`貼り紙: ${join(poster, "poster.png")}\n作業服: ${join(jacket, "burnt-jacket.png")}`);
