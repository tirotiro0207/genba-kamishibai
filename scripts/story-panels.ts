// 動画の起の紙芝居 5 枚を描いて private/material/096b-起/ に置く（096b）。API は使わない
//   npx tsx scripts/story-panels.ts
// 出るもの: 01.png〜05.png と .svg（768 の正方形）、ffmpeg があれば 1 枚 4 秒・20 秒の story.mp4（字幕は入れない）
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { svgToPng } from "../src/node/png";
import { privatePath } from "../src/node/private-dir";
import { storyFrameSvg } from "../src/shared/picto/story";
import { PANEL_SECONDS, STORY_PANELS } from "../src/shared/video/story-panels";

const dir = privatePath("material", "096b-起");
mkdirSync(dir, { recursive: true });
STORY_PANELS.forEach((p, i) => {
  const name = String(i + 1).padStart(2, "0");
  const svg = storyFrameSvg(p.frame, p.parts);
  writeFileSync(join(dir, `${name}.svg`), svg);
  writeFileSync(join(dir, `${name}.png`), svgToPng(svg));
  console.log(`${name}: ${p.caption}`);
});
try {
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-framerate", `1/${PANEL_SECONDS}`, "-i", join(dir, "%02d.png"), "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", join(dir, "story.mp4")]);
  console.log(`動画: ${join(dir, "story.mp4")}（${STORY_PANELS.length * PANEL_SECONDS} 秒）`);
} catch {
  console.log("ffmpeg が無いので動画は作らない");
}
