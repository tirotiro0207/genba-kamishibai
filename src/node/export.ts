// PNG・SVG の書き出し（077）の Node の側。帯の文字を描くので、確かめる AI に渡す PNG（006b）と違い、日本語の字形を読む。
// 字形は EXPORT_FONT か、Windows の游ゴシック・メイリオのファイルを使う（端末の字形を全部読むと 1 枚ごとに遅い）。どれも無ければ端末の字形を探す。
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { ExportItem } from "../shared/export";
import { stripPng } from "./png";

const FONT_FILES = [process.env.EXPORT_FONT, "C:/Windows/Fonts/YuGothB.ttc", "C:/Windows/Fonts/meiryob.ttc"].filter((f): f is string => !!f && existsSync(f)).slice(0, 1);
const FONT = FONT_FILES.length ? { loadSystemFonts: false, fontFiles: FONT_FILES } : { loadSystemFonts: true };

export function printPng(svg: string): Uint8Array {
  return stripPng(new Resvg(svg, { background: "#ffffff", font: FONT }).render().asPng());
}

/** 1 つずつ SVG と PNG を書く。書いたファイルの名前を返す */
export function writeExports(items: ExportItem[], dir: string): string[] {
  mkdirSync(dir, { recursive: true });
  return items.flatMap(({ name, svg }) => {
    writeFileSync(join(dir, `${name}.svg`), svg, "utf-8");
    writeFileSync(join(dir, `${name}.png`), printPng(svg));
    return [`${name}.svg`, `${name}.png`];
  });
}
