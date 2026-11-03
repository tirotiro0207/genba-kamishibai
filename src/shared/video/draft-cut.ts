// 098: 仮の 3 分版のつなぎ方。098b の台本（docs/video.md）の秒割りどおりに、今ある素材だけを並べる。
// 素材は private/ の中（git の外）の場所で書く。声と音楽は入れない（作者が録る）。絵が映るので全部 ※取り直し
export type Source =
  /** 静止画を秒のあいだ出す */
  | { still: string }
  /** 動画。足りなければ遅くし（半分の速さまで）、それでも足りなければ最後のコマで止める。長ければ速める */
  | { clip: string; from?: number; to?: number; scene?: FlowScene }
  /** 文字だけの仮の画面（まだ撮っていない所） */
  | { card: string };

export interface Segment {
  start: number;
  end: number;
  part: "起" | "承" | "転" | "結";
  sources: Source[];
  /** 字幕（台本の語り）。無ければ空 */
  caption: string;
  /** 字幕の 2 行目（数の出どころなど）。無ければ空 */
  note: string;
}

const rec = (run: string, name: string) => `rec/${run}/${name}/video.webm`;
const STORY = "material/096b-起";
/** 065a の通しの録画（練習用テナントで取り出しから記録アプリまで） */
const FLOW_NAME = "flow-practice-練習用テナントで、取り出しから記録アプリまでを-1-本で通す";
export type FlowScene = "取り出し" | "カード" | "直し" | "経路" | "署名と閲覧";
/** 通しの録画の中の場面の切れ目（秒）。録画の置き場ごと。撮り直したら、1 秒ごとのコマを見て直す */
export const FLOW_CUTS: Record<string, Record<FlowScene, [number, number]>> = {
  "runs-fix": { 取り出し: [0, 4], カード: [4, 8], 直し: [8, 11], 経路: [17, 20], 署名と閲覧: [20, 23] },
  "runs-video": { 取り出し: [0, 4], カード: [4, 7.5], 直し: [8, 11.5], 経路: [17.5, 19.5], 署名と閲覧: [20, 21.9] },
};
const flow = (scene: FlowScene): Source => ({ clip: rec("runs-fix", FLOW_NAME), from: FLOW_CUTS["runs-fix"][scene][0], to: FLOW_CUTS["runs-fix"][scene][1], scene });

export const DRAFT: Segment[] = [
  { start: 0, end: 4, part: "起", sources: [{ still: `${STORY}/01.png` }], caption: "むかしむかし、あるところに、日本人のお父さんとベトナム人のお母さんがいました。", note: "" },
  { start: 4, end: 8, part: "起", sources: [{ still: `${STORY}/02.png` }], caption: "二人の長男のイチローは、英語、それからベトナム語を覚えました。", note: "" },
  { start: 8, end: 12, part: "起", sources: [{ still: `${STORY}/03.png` }], caption: "日本の学校では、日本語が分かりませんでした。", note: "" },
  { start: 12, end: 16, part: "起", sources: [{ still: `${STORY}/04.png` }], caption: "それでも、ポケモン リーフグリーンは最後までクリアできました。", note: "" },
  { start: 16, end: 20, part: "起", sources: [{ still: `${STORY}/05.png` }], caption: "よい画面は、言葉の壁を越える。そこから『現場-紙芝居』を作りました。", note: "" },
  {
    start: 20,
    end: 30,
    part: "承",
    sources: [{ still: "material/029-写真A/poster.png" }],
    caption: "電気の現場の安全の決まりは、文字の資料と貼り紙で回っています。",
    note: "日本で働く外国人 約 257 万人、うちベトナム 約 61 万人（厚生労働省「外国人雇用状況」の届出状況まとめ、令和 7 年 10 月末。数を丸めた）",
  },
  { start: 30, end: 40, part: "承", sources: [{ still: "material/029-作業服/burnt-jacket.png" }], caption: "文字が読めなければ、決まりは届きません。届かなかった決まりは、けがになります。", note: "" },
  {
    start: 40,
    end: 55,
    part: "転",
    sources: [{ clip: rec("runs-122", "make-話した言葉を入れ、送る前に文字を確かめ、取り出した決まりを「どこから」を見て-OK-する") }, flow("取り出し")],
    caption: "決まりの文を入れると、Claude が「守ること」と「なぜ」を、元の行の印つきで取り出します。",
    note: "",
  },
  {
    start: 55,
    end: 75,
    part: "転",
    sources: [
      flow("カード"),
      { clip: rec("runs-122", "card-コマを-1-つずつ送り、絵の面は-0-字、タップで文が出る。AI-下書きの帯が出る") },
      flow("経路"),
      // 経路の録画は、最後にスマホの幅に切り替えて確かめる（2 秒から）。そこは使わない
      { clip: rec("runs-122", "route-絵の部品をタップすると元の文の該当箇所が光り、なぜそう描いたかが出る。全部品を順にタップできる"), to: 1.95 },
    ],
    caption: "絵は Claude が数で書き、アプリが描きます。絵の部品から、元の文へ戻れます。",
    note: "",
  },
  {
    start: 75,
    end: 90,
    part: "転",
    sources: [
      { clip: rec("runs-122", "danger-帯は-3-色だけで、赤は危険と同じ赤。-8f0d8-絵の外に「危険」が出て-OK-を押せず、上の数字が出る") },
      { clip: rec("runs-122", "queue-確認待ちの列は赤が先頭で、仕分けの一覧を入れ替えると保存される") },
    ],
    caption: "別の Claude が、絵だけを見て読みます。伝わらなければ赤です。",
    note: "",
  },
  {
    start: 90,
    end: 110,
    part: "転",
    sources: [
      flow("直し"),
      { clip: rec("runs-122", "fix-マウスで枠を描き、文字を確かめてから送ると、④-人の直しに残る") },
      { clip: rec("runs-122", "sign-パソコンは電子印鑑。監修者の役で入り、印を押して署名すると「未承認の下書き」が消える") },
      flow("署名と閲覧"),
      { clip: rec("runs-122", "read-署名済みのカードだけを-1-枚ずつ送って見る") },
    ],
    caption: "監修者が直したいところを枠で囲み、直ったら署名します。署名したカードだけが、新入社員に届きます。",
    note: "",
  },
  {
    start: 110,
    end: 125,
    part: "転",
    sources: [{ clip: rec("runs-122", "fold-ページが積み重なってカウンターが上がり、1-枚・0-字にたたまれる") }],
    caption: "何ページもの資料が、1 枚・0 字のカードにたたまれます。どの部品も、元の文に戻れます。",
    note: "",
  },
  {
    start: 125,
    end: 145,
    part: "転",
    sources: [{ clip: rec("runs-122", "clocks-時計-2-つ-作りものの数で、カードの針が先に止まり、文の針があとで止まる") }],
    caption: "同じ決まりを、カードと文で見せました。分かるまでの時間は（数は確認の日のあと）。",
    note: "仮: 時計の数は作りもの。本物は回答の記録アプリ（新入社員の匿名の結果）から",
  },
  { start: 145, end: 160, part: "結", sources: [{ card: "（仮）職人さんと、壁に大きく貼ったカードの写真 1 枚\n作者が用意する" }], caption: "", note: "" },
  { start: 160, end: 172, part: "結", sources: [{ card: "（仮）監修者の一言\n公開の同意をもらってから、録音か文字で入れる" }], caption: "", note: "" },
  { start: 172, end: 180, part: "結", sources: [{ still: `${STORY}/05.png` }], caption: "言葉の壁を越えて、決まりを絵で届ける。現場-紙芝居。", note: "" },
];

/**
 * 録画の置き場を差し替えた版（098 の 2 版目: 動画用に撮り直した runs-video）。
 * 録画は全部その置き場の同じ名前のものにし、通しの録画の切れ目もその置き場のものにする
 */
export function withRun(draft: Segment[], run: string): Segment[] {
  const cuts = FLOW_CUTS[run];
  return draft.map((s) => ({
    ...s,
    sources: s.sources.map((x) => {
      if (!("clip" in x)) return x;
      const clip = x.clip.replace(/^rec\/[^/]+\//, `rec/${run}/`);
      if (!x.scene) return { ...x, clip };
      if (!cuts) throw new Error(`${run} の通しの録画の切れ目が無い（FLOW_CUTS に足す）`);
      return { ...x, clip, from: cuts[x.scene][0], to: cuts[x.scene][1] };
    }),
  }));
}

/** 動画を秒に合わせるときの速さ（1 より大きいと速める）と、最後のコマで止める秒 */
export function fit(clipSeconds: number, slotSeconds: number): { speed: number; hold: number } {
  const speed = Math.max(0.5, clipSeconds / slotSeconds);
  return { speed, hold: Math.max(0, slotSeconds - clipSeconds / speed) };
}

/** 1 つの区切りの中で、素材ごとに秒を割り振る。動画は長さに比べて、静止画と文字の画面は等分 */
export function share(seconds: number, lengths: (number | null)[]): number[] {
  const known = lengths.every((l) => l !== null && l > 0);
  const total = known ? (lengths as number[]).reduce((a, b) => a + b, 0) : lengths.length;
  return lengths.map((l) => (seconds * (known ? (l as number) : 1)) / total);
}
