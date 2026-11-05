// 冒頭の 19 秒（11/5 夜 v4: 開幕のライトと扉に 2 秒足した。v4 より前は 17 秒）（台本 v2 の 0:00〜0:17。11/5 夜の直しで 1 手順 3 コマにして 17 秒に戻した）の場面の割り振り。1 場面 1 つの Composition にして、最後に 1 本につなぐ。
// 場面の名前と秒は docs/video.md の「台本 v2」に合わせる。秒は目安で、ここを直せば全部の場面がずれる
export const FPS = 30;
export const W = 1280;
export const H = 720;

// 11/5 の直し（作者の指示）: 紙を 1 枚ずつ印刷して、手本の手順どおりに全部折る。
// 11/5 夜の直し: 紙と紙の人を画面いっぱいの大きさにし、1 手順 3 コマ（0.1 秒）にして冒頭を 17 秒に戻す
// 長さはコマで書く（折り紙は 1 手順 3 コマで割り切るため）
export const SCENES = [
  { id: "s1-clocks", title: "時計の比べ", frames: 85 },
  { id: "s2-legs", title: "印刷と脚の紙", frames: 58 },
  { id: "s3-body", title: "印刷と体の紙", frames: 72 },
  { id: "s4-join", title: "組む・仕上げ", frames: 30 },
  { id: "s5-name", title: "名のり", frames: 55 },
  { id: "s6-pull", title: "枠を引っぱる", frames: 90 },
  { id: "s7-curtain", title: "開演（ライトが下りて焦点が合う）", frames: 105 },
  { id: "s8-title", title: "扉が外へ開く・題", frames: 75 },
] as const;
export type SceneId = (typeof SCENES)[number]["id"];

export const startOf = (id: SceneId) => {
  let f = 0;
  for (const s of SCENES) {
    if (s.id === id) return f;
    f += s.frames;
  }
  throw new Error(id);
};
export const lengthOf = (id: SceneId) => SCENES.find((s) => s.id === id)!.frames;
export const TOTAL = SCENES.reduce((a, s) => a + s.frames, 0);

/** 折り紙の 1 手順のコマ数（0.1 秒。11/5 夜の指示） */
export const STEP_FRAMES = 3;
/** 印刷の口から紙が出るコマ数と、折る所へ動くコマ数 */
export const PRINT_FRAMES = 10;
export const TO_FOLD_FRAMES = 8;

// 画面の置き場（場面をまたいで同じ所に出すもの）
/** 紙の人が立つ床の高さ */
export const GROUND = 680;
/** 折り紙を折る所（紙の中心）。紙は 200 の正方形を PAPER_K 倍で折る（高さ 500 ＝画面の約 7 割） */
export const FOLD_AT = { x: 640, y: 380 };
export const PAPER_K = 2.5;
/** 折り終えた脚の部品を置いておく所と倍率（紙の単位からの倍率） */
export const ASIDE = { x: 1100, y: 400, k: 1.3 };
/** 組んだ紙の人の倍率（床から頭まで 400 の形を、背の高さ 576 ＝画面の 8 割にする） */
export const FIGURE_K = 1.44;
export const PERSON_H = 400 * FIGURE_K;
/** 時計の置き場と半径 */
export const CLOCKS = { r: 105, y: 380, text: 330, card: 950, labelY: 120 };
/** 紫の地（開演から） */
export const PURPLE = "#4a3f86";
export const INK = "#2b2550";
