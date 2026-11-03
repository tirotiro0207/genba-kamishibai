// 098: 仮の 3 分版をつなぐ。台本の秒割り（src/shared/video/draft-cut.ts）どおりに、今ある素材を 1280×720・30 コマで並べ、
// 字幕（台本の語り）と「※取り直し（仮の版）」を焼き込む。声と音楽は入れない。
// 出るもの: private/material/098-仮/draft.mp4 と cuts.json（区切りごとの素材と、動画の速さ・止めた秒）
//
//   npx tsx scripts/video-draft.ts
//
// 字幕の文字は英数字だけの一時フォルダに書いて drawtext に渡す（日本語の場所を filter に書かないため）
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privatePath } from "../src/node/private-dir";
import { DRAFT, fit, share, type Source } from "../src/shared/video/draft-cut";

const W = 1280;
const H = 720;
const FPS = 30;
const BG = "0xF4F1EA";
const FONT = "C\\:/Windows/Fonts/BIZ-UDGothicR.ttc";
const ENC = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(FPS), "-an"];

const ff = (args: string[]) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });
const probe = (f: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf-8" }).trim());
const fitBox = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${BG},setsar=1`;
const esc = (p: string) => p.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1\\:");

/** 字幕を 1 行 n 文字までで折る（読点・句点のあとで折れればそこで） */
export function wrap(s: string, n = 34): string {
  const out: string[] = [];
  let rest = s;
  while (rest.length > n) {
    const cut = Math.max(rest.lastIndexOf("、", n), rest.lastIndexOf("。", n));
    const at = cut > n / 2 ? cut + 1 : n;
    out.push(rest.slice(0, at));
    rest = rest.slice(at);
  }
  if (rest) out.push(rest);
  return out.join("\n");
}

function part(src: Source, seconds: number, out: string, tmp: string, root: string) {
  if ("still" in src) {
    ff(["-loop", "1", "-t", seconds.toFixed(3), "-i", join(root, src.still), "-vf", `${fitBox},fps=${FPS}`, ...ENC, out]);
    return { kind: "still", src: src.still, seconds };
  }
  if ("card" in src) {
    const t = join(tmp, `card-${Date.now()}.txt`);
    writeFileSync(t, src.card);
    ff(["-f", "lavfi", "-t", seconds.toFixed(3), "-i", `color=c=0x2B2F36:s=${W}x${H}:r=${FPS}`, "-vf", `drawtext=fontfile='${FONT}':textfile='${esc(t)}':fontcolor=white:fontsize=40:line_spacing=18:x=(w-tw)/2:y=(h-th)/2`, ...ENC, out]);
    return { kind: "card", src: src.card.split("\n")[0], seconds };
  }
  const file = join(root, src.clip);
  const from = src.from ?? 0;
  const to = src.to ?? probe(file);
  const { speed, hold } = fit(to - from, seconds);
  ff(["-ss", String(from), "-t", String(to - from), "-i", file, "-vf", `${fitBox},setpts=PTS/${speed.toFixed(4)},fps=${FPS},tpad=stop_mode=clone:stop_duration=${hold.toFixed(3)}`, "-t", seconds.toFixed(3), ...ENC, out]);
  return { kind: "clip", src: src.clip, from, to: Number(to.toFixed(2)), seconds, speed: Number(speed.toFixed(2)), hold: Number(hold.toFixed(2)) };
}

function main() {
  const root = privatePath();
  const outDir = privatePath("material", "098-仮");
  mkdirSync(outDir, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), "gk098-"));
  const segs: string[] = [];
  const cuts: unknown[] = [];
  DRAFT.forEach((s, i) => {
    const len = s.end - s.start;
    const lengths = s.sources.map((x) => ("clip" in x && existsSync(join(root, x.clip)) ? (x.to ?? probe(join(root, x.clip))) - (x.from ?? 0) : null));
    const secs = share(len, lengths);
    const parts = s.sources.map((src, j) => {
      const out = join(tmp, `p${i}-${j}.mp4`);
      return { out, info: part(src, secs[j], out, tmp, root) };
    });
    const list = join(tmp, `l${i}.txt`);
    writeFileSync(list, parts.map((p) => `file '${p.out.replaceAll("\\", "/")}'`).join("\n"));
    const raw = join(tmp, `r${i}.mp4`);
    ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", raw]);
    // 字幕（下）・出どころ（その上）・取り直しの印（右上）
    const draw: string[] = [];
    const text = (name: string, body: string) => {
      const f = join(tmp, `${name}${i}.txt`);
      writeFileSync(f, body);
      return esc(f);
    };
    if (s.caption) draw.push(`drawtext=fontfile='${FONT}':textfile='${text("c", wrap(s.caption))}':fontsize=32:line_spacing=10:fontcolor=white:box=1:boxcolor=black@0.62:boxborderw=14:x=(w-tw)/2:y=h-th-36`);
    if (s.note) draw.push(`drawtext=fontfile='${FONT}':textfile='${text("n", wrap(s.note, 52))}':fontsize=20:line_spacing=6:fontcolor=white:box=1:boxcolor=0x1F3A5F@0.85:boxborderw=8:x=(w-tw)/2:y=24`);
    draw.push(`drawtext=fontfile='${FONT}':textfile='${text("m", "※取り直し（仮の版）")}':fontsize=18:fontcolor=0xC4372C:box=1:boxcolor=white@0.8:boxborderw=6:x=w-tw-16:y=16`);
    const seg = join(tmp, `s${String(i).padStart(2, "0")}.mp4`);
    ff(["-i", raw, "-vf", draw.join(","), "-t", String(len), ...ENC, seg]);
    segs.push(seg);
    cuts.push({ start: s.start, end: s.end, part: s.part, caption: s.caption, note: s.note, parts: parts.map((p) => p.info) });
  });
  const list = join(tmp, "all.txt");
  writeFileSync(list, segs.map((f) => `file '${f.replaceAll("\\", "/")}'`).join("\n"));
  const out = join(outDir, "draft.mp4");
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
  writeFileSync(join(outDir, "cuts.json"), `${JSON.stringify(cuts, null, 1)}\n`);
  console.log(`${out}（${probe(out).toFixed(1)} 秒・${DRAFT.length} 区切り）。一時ファイル: ${tmp}`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
