// 動画の起の紙芝居 5 枚（096b）。1 枚 4 秒で 20 秒。人形はカードと同じ人形で、作者は白いヘルメットの新人の役。
// 字は絵に入れず、動画の字幕で出す（docs/video.md の「起の 5 枚」）
import { POSES } from "../picto/poses";
import type { Frame } from "../picto/scene";
import type { StoryPart } from "../picto/story";

export const PANEL_SECONDS = 4;

export interface StoryPanel {
  /** 字幕（動画で出す。絵には入れない） */
  caption: string;
  frame: Frame;
  parts: StoryPart[];
}

export const STORY_PANELS: StoryPanel[] = [
  {
    caption: "日本人のお父さんと、ベトナム人のお母さん",
    frame: {
      figures: [
        { role: "worker", x: 0.3, height: 0.56, facing: "right", angles: POSES.stand },
        { role: "worker", x: 0.7, height: 0.5, facing: "left", angles: POSES.stand },
      ],
    },
    parts: [
      { kind: "heart", x: 0.5, y: 0.5, size: 0.11 },
      { kind: "think", x: 0.22, y: 0.16, size: 0.3, inner: ["map_japan"], to: [0.29, 0.33] },
      { kind: "think", x: 0.78, y: 0.16, size: 0.3, inner: ["map_vietnam"], to: [0.71, 0.39] },
    ],
  },
  {
    caption: "イチローが生まれ、英語、それからベトナム語を身につける",
    frame: { figures: [{ role: "new", x: 0.32, height: 0.34, facing: "right", angles: POSES.hands }] },
    parts: [
      { kind: "book", x: 0.47, y: 0.68, size: 0.17 },
      { kind: "think", x: 0.6, y: 0.24, size: 0.56, inner: ["globe", "map_vietnam"], to: [0.33, 0.52] },
    ],
  },
  {
    caption: "日本の学校で、日本語が分からない",
    frame: {
      figures: [{ role: "new", x: 0.42, height: 0.34, facing: "right", angles: POSES.stand }],
      props: [{ kind: "think_question", at: { figure: 0, joint: "head", dx: -0.55, dy: -0.75 }, size: 0.2 }],
    },
    parts: [
      { kind: "blackboard", x: 0.68, y: 0.36, size: 0.42 },
      { kind: "desk", x: 0.44, y: 0.74, size: 0.3 },
    ],
  },
  {
    caption: "それでも、ゲームは最後までクリアできた",
    frame: { figures: [{ role: "new", x: 0.4, height: 0.36, facing: "right", angles: POSES.hands }] },
    parts: [
      { kind: "game_handheld", x: 0.56, y: 0.66, size: 0.17 },
      { kind: "think", x: 0.66, y: 0.3, size: 0.3, inner: ["heart"], to: [0.42, 0.52] },
      { kind: "star", x: 0.18, y: 0.26, size: 0.12 },
      { kind: "star", x: 0.86, y: 0.5, size: 0.09 },
      { kind: "star", x: 0.3, y: 0.1, size: 0.07 },
    ],
  },
  {
    caption: "よい画面は、言葉の壁を越える",
    frame: {
      figures: [
        { role: "lead", x: 0.17, height: 0.5, facing: "right", angles: POSES.hands },
        { role: "new", x: 0.83, height: 0.46, facing: "left", angles: POSES.stand },
      ],
      props: [{ kind: "think_check", at: { figure: 1, joint: "head", dx: -0.1, dy: -0.6 }, size: 0.2 }],
    },
    parts: [
      { kind: "brick_wall", x: 0.5, y: 0.88, size: 0.5 },
      { kind: "screen_card", x: 0.31, y: 0.6, size: 0.14 },
      { kind: "arc_arrow", x: 0.5, y: 0.22, size: 0.42 },
      { kind: "screen_card", x: 0.68, y: 0.68, size: 0.14 },
    ],
  },
];
