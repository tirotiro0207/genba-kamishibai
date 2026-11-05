// 冒頭の 17 秒（台本 v2 の 0:00〜0:17）の場面の割り振り。1 場面 1 つの Composition にして、最後に 1 本につなぐ。
// 場面の名前と秒は docs/video.md の「台本 v2」に合わせる。秒は目安で、ここを直せば全部の場面がずれる
export const FPS = 30;
export const W = 1280;
export const H = 720;

export const SCENES = [
  { id: "s1-clocks", title: "時計の比べ", from: 0, sec: 3 },
  { id: "s2-print", title: "印刷", from: 3, sec: 2 },
  { id: "s3-origami", title: "折り紙 ①", from: 5, sec: 3 },
  { id: "s4-name", title: "名のり", from: 8, sec: 2 },
  { id: "s5-pull", title: "枠を引っぱる", from: 10, sec: 3 },
  { id: "s6-curtain", title: "開演", from: 13, sec: 2 },
  { id: "s7-title", title: "題", from: 15, sec: 2 },
] as const;
export type SceneId = (typeof SCENES)[number]["id"];

export const startOf = (id: SceneId) => SCENES.find((s) => s.id === id)!.from * FPS;
export const lengthOf = (id: SceneId) => SCENES.find((s) => s.id === id)!.sec * FPS;
export const TOTAL = SCENES.reduce((a, s) => a + s.sec, 0) * FPS;

// 画面の置き場（場面をまたいで同じ所に出すもの）
/** 紙の人が立つ床の高さ */
export const GROUND = 584;
/** 折り紙を折る所（紙の中心） */
export const FOLD_AT = { x: 640, y: 400 };
/** 紙の大きさの倍率（折り紙の形は 200×400 の紙で描き、この倍率で縮める） */
export const PAPER_K = 0.8;
/** 時計の置き場と半径 */
export const CLOCKS = { r: 105, y: 380, text: 330, card: 950, labelY: 120 };
/** 紫の地（開演から） */
export const PURPLE = "#4a3f86";
export const INK = "#2b2550";
