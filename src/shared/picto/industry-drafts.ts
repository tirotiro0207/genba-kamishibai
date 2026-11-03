// 業種ごとの役の姿の下絵（最初の 6 業種）。作者が用意した参考の画像（業種ごとに役が並んだもの）から、
// 形と明暗で見分けられる印だけを拾って部品に置き換えた。色は灰色の明るさに置き換える。
// 最初の 6 業種のあとに、残りの 34 業種を同じ形で足した（下の push）。
// 印の決まりは仮の案で、会社ごとの決まり（製品仕様 §14 の④）があればそちらを先に使う。
import type { CharacterRole, HeadwearKind } from "./character";
import type { Garment, Outfit } from "./outfit";

export interface RoleDraft {
  /** 業種の役の段の名前 */
  name: string;
  /** カードの役（かぶり物の明るさに使う） */
  role: CharacterRole;
  headwear: HeadwearKind | "none";
  outfit: Outfit;
}
export interface IndustryDraft {
  id: string;
  name: string;
  roles: RoleDraft[];
}

export const INDUSTRY_DRAFTS: IndustryDraft[] = [
  {
    id: "01", name: "電気工事",
    roles: [
      { name: "職長", role: "worker", headwear: "helmet", outfit: { stripes: 2, armband: true, toolBelt: true, wear: [{ kind: "jacket", tone: "#444" }], sleeve: "#444", pants: "#444" } },
      { name: "若手", role: "new", headwear: "helmet", outfit: { wear: [{ kind: "jacket", tone: "#ddd" }], sleeve: "#ddd", pants: "#bbb" } },
    ],
  },
  {
    id: "02", name: "建設",
    roles: [
      { name: "職長", role: "worker", headwear: "helmet", outfit: { stripes: 1, armband: true, wear: [{ kind: "jacket", tone: "#999" }, { kind: "hivis" }, { kind: "harness" }], sleeve: "#999", pants: "#999" } },
      { name: "新人", role: "new", headwear: "helmet", outfit: { leaf: true, wear: [{ kind: "jacket", tone: "#ddd" }], sleeve: "#ddd", pants: "#bbb" } },
    ],
  },
  {
    id: "06", name: "厨房",
    roles: [
      { name: "料理長", role: "lead", headwear: "chef", outfit: { neck: "scarf", wear: [{ kind: "chefJacket" }, { kind: "apronLong" }], sleeve: "#fff", pants: "#777" } },
      { name: "見習い", role: "new", headwear: "chefLow", outfit: { wear: [{ kind: "chefJacket", tone: "#999" }, { kind: "apronShort", tone: "#777" }], sleeve: "#999", pants: "#777" } },
    ],
  },
  {
    id: "07", name: "配膳・ホール",
    roles: [
      { name: "店長", role: "lead", headwear: "none", outfit: { neck: "tie", tag: "clip", wear: [{ kind: "waiterVest" }, { kind: "apronLong", tone: "#222" }], sleeve: "#fff", pants: "#222" } },
      { name: "係", role: "new", headwear: "none", outfit: { tag: "clip", wear: [{ kind: "polo", tone: "#555" }, { kind: "apronShort", tone: "#555" }], sleeve: "#555", pants: "#222" } },
    ],
  },
  {
    id: "08", name: "食品の工場",
    roles: [
      { name: "班長", role: "worker", headwear: "hygiene", outfit: { stripes: 2, armband: true, mask: true, wear: [{ kind: "coat" }], sleeve: "#fff", pants: "#fff", boots: "#fff" } },
      { name: "作業員", role: "new", headwear: "hygiene", outfit: { mask: true, wear: [{ kind: "coat" }], sleeve: "#fff", pants: "#fff", boots: "#fff" } },
    ],
  },
  {
    id: "11", name: "介護",
    roles: [
      { name: "リーダー", role: "lead", headwear: "none", outfit: { tag: "lanyard", wear: [{ kind: "polo", tone: "#333" }], sleeve: "#333", pants: "#333" } },
      { name: "介護職", role: "new", headwear: "none", outfit: { tag: "lanyard", wear: [{ kind: "polo", tone: "#ccc" }], sleeve: "#ccc", pants: "#333" } },
      { name: "看護師", role: "worker", headwear: "none", outfit: { tag: "lanyard", wear: [{ kind: "polo" }], sleeve: "#fff", pants: "#fff" } },
    ],
  },
];

/** 下絵を書きやすくする小さな道具: 上に着る服 1 枚と、同じ明るさの袖 */
const top = (kind: Garment, tone?: string, more: Outfit = {}): Outfit => ({ ...more, wear: [{ kind, tone }, ...(more.wear ?? [])], sleeve: more.sleeve ?? tone ?? "#fff" });
const r = (name: string, role: CharacterRole, headwear: HeadwearKind | "none", outfit: Outfit): RoleDraft => ({ name, role, headwear, outfit });

/** 残りの 34 業種（11/3）。参考の画像のプロンプトに書いた役と服装を、形と明暗に置き換えた */
INDUSTRY_DRAFTS.push(
  { id: "03", name: "造船・舶用工業", roles: [
    r("班長", "worker", "helmet", top("coverall", "#444", { stripes: 2, armband: true, pants: "#444" })),
    r("作業員", "new", "helmet", top("coverall", "#888", { pants: "#888" })),
  ] },
  { id: "04", name: "工場の製造", roles: [
    r("班長", "lead", "cap", top("jacket", "#333", { armband: true, tag: "clip", pants: "#777" })),
    r("作業員", "new", "cap", top("jacket", "#eee", { pants: "#eee" })),
  ] },
  { id: "05", name: "自動車の整備", roles: [
    r("工場長", "lead", "cap", top("coverall", "#333", { stripes: 1, tag: "clip", pants: "#333" })),
    r("主任", "worker", "cap", top("coverall", "#666", { armband: true, tag: "clip", pants: "#666" })),
    r("新人", "new", "none", top("coverall", "#ccc", { tag: "clip", pants: "#ccc" })),
  ] },
  { id: "09", name: "小売・コンビニ・スーパー", roles: [
    r("店長", "lead", "none", { wear: [{ kind: "waiterVest", tone: "#444" }], neck: "tie", tag: "clip", sleeve: "#fff", pants: "#222" }),
    r("チーフ", "worker", "none", { wear: [{ kind: "waiterVest", tone: "#777" }], tag: "clip", sleeve: "#fff", pants: "#222" }),
    r("新人", "new", "none", top("polo", "#fff", { wear: [{ kind: "apronBib", tone: "#666" }], tag: "clip", pants: "#222" })),
  ] },
  { id: "10", name: "宿泊", roles: [
    r("支配人", "lead", "none", top("suit", "#222", { neck: "tie", pants: "#222" })),
    r("フロント", "worker", "none", top("suit", "#444", { neck: "scarf", tag: "clip", pants: "#444" })),
    r("客室係", "new", "nurse", top("tunic", "#ddd", { wear: [{ kind: "apronLong" }], tag: "clip", pants: "#ddd" })),
  ] },
  { id: "12", name: "病院", roles: [
    r("師長", "lead", "nurse", top("tunic", "#fff", { tag: "lanyard", pants: "#fff" })),
    r("看護師", "worker", "none", top("tunic", "#fff", { tag: "lanyard", pants: "#fff" })),
    r("看護助手", "new", "none", top("tunic", "#bbb", { tag: "lanyard", pants: "#fff" })),
  ] },
  { id: "13", name: "ビルの清掃", roles: [
    r("リーダー", "lead", "cap", top("jacket", "#bbb", { armband: true, tag: "clip", gloves: "#999", pants: "#333" })),
    r("スタッフ", "new", "cap", top("jacket", "#ddd", { gloves: "#999", pants: "#333" })),
  ] },
  { id: "14", name: "警備", roles: [
    r("隊長", "lead", "peaked", top("uniform", "#333", { stripes: 1, rank: 3, gloves: "#fff", pants: "#333" })),
    r("隊員", "worker", "peaked", top("uniform", "#333", { rank: 1, pants: "#333" })),
    r("交通誘導", "new", "helmet", top("jacket", "#ddd", { wear: [{ kind: "hivis", tone: "#888" }], pants: "#ddd", boots: "#333" })),
  ] },
  { id: "15", name: "物流倉庫", roles: [
    r("班長", "worker", "helmet", top("jacket", "#bbb", { wear: [{ kind: "hivis", tone: "#777" }], armband: true, pants: "#bbb" })),
    r("フォークリフト", "new", "helmet", top("jacket", "#bbb", { wear: [{ kind: "hivis", tone: "#444" }], pants: "#bbb" })),
    r("ピッキング", "worker", "cap", top("jacket", "#ddd", { wear: [{ kind: "hivis", tone: "#ccc" }], pants: "#ddd" })),
  ] },
  { id: "16", name: "農業", roles: [
    r("経営者", "lead", "straw", top("checked", "#bbb", { neck: "towel", pants: "#777", boots: "#555" })),
    r("従業員", "worker", "cap", top("jacket", "#555", { pants: "#999", boots: "#555" })),
    r("指導する人", "new", "towel", top("jacket", "#999", { armband: true, pants: "#999", boots: "#555" })),
  ] },
  { id: "17", name: "漁業・水産加工", roles: [
    r("班長", "worker", "hygiene", top("coat", "#fff", { stripes: 2, armband: true, wear: [{ kind: "apronLong" }], pants: "#fff", boots: "#fff" })),
    r("作業員", "new", "hygiene", top("coat", "#fff", { wear: [{ kind: "apronLong" }], pants: "#fff", boots: "#fff" })),
  ] },
  { id: "18", name: "林業・製材", roles: [
    r("班長", "new", "helmet", top("jacket", "#555", { ears: "muffs", visor: "mesh", armband: true, pants: "#555" })),
    r("作業員", "worker", "helmet", top("jacket", "#888", { ears: "muffs", pants: "#555" })),
  ] },
  { id: "19", name: "自動車運送", roles: [
    r("運行管理者", "lead", "none", { wear: [{ kind: "waiterVest", tone: "#333" }], neck: "tie", armband: true, tag: "clip", sleeve: "#fff", pants: "#333" }),
    r("運転者", "worker", "peaked", top("uniform", "#333", { gloves: "#fff", tag: "clip", pants: "#333" })),
  ] },
  { id: "20", name: "鉄道", roles: [
    r("駅長", "lead", "peaked", top("uniform", "#333", { stripes: 3, cuffs: 3, gloves: "#fff", pants: "#333" })),
    r("助役", "worker", "peaked", top("uniform", "#333", { stripes: 2, cuffs: 2, gloves: "#fff", pants: "#333" })),
    r("駅員", "new", "peaked", top("uniform", "#333", { stripes: 1, cuffs: 1, gloves: "#fff", pants: "#333" })),
  ] },
  { id: "21", name: "航空", roles: [
    r("リーダー", "new", "helmet", top("jacket", "#bbb", { wear: [{ kind: "hivis", tone: "#666" }], ears: "headset", pants: "#bbb" })),
    r("係員", "worker", "helmet", top("jacket", "#bbb", { wear: [{ kind: "hivis", tone: "#ccc" }], ears: "headset", pants: "#bbb" })),
  ] },
  { id: "22", name: "リネンサプライ", roles: [
    r("班長", "worker", "hygiene", top("tunic", "#fff", { stripes: 1, armband: true, mask: true, pants: "#fff" })),
    r("作業員", "new", "hygiene", top("tunic", "#fff", { mask: true, pants: "#fff" })),
  ] },
  { id: "23", name: "資源循環", roles: [
    r("班長", "new", "helmet", top("coverall", "#777", { armband: true, gloves: "#999", pants: "#777" })),
    r("作業員", "worker", "cap", top("coverall", "#555", { mask: true, gloves: "#999", pants: "#555" })),
  ] },
  { id: "24", name: "金属の加工・溶接", roles: [
    r("班長", "lead", "welderUp", top("jacket", "#555", { armband: true, gloves: "#444", pants: "#555" })),
    r("作業員", "worker", "welder", top("jacket", "#888", { wear: [{ kind: "apronLong", tone: "#444" }], gloves: "#444", pants: "#888" })),
  ] },
  { id: "25", name: "鋳造", roles: [
    r("班長", "new", "helmet", top("jacket", "#ccc", { visor: "clear", armband: true, gloves: "#888", pants: "#ccc" })),
    r("作業員", "worker", "helmet", top("jacket", "#444", { visor: "clear", gloves: "#888", pants: "#444" })),
  ] },
  { id: "26", name: "塗装", roles: [
    r("班長", "new", "hood", top("coverall", "#fff", { mask: true, armband: true, pants: "#fff" })),
    r("作業員", "new", "hood", top("coverall", "#fff", { mask: true, pants: "#fff" })),
  ] },
  { id: "27", name: "電子部品の組み立て", roles: [
    r("班長", "new", "hood", top("coverall", "#fff", { mask: true, armband: true, pants: "#fff", boots: "#fff" })),
    r("作業員", "new", "hood", top("coverall", "#fff", { mask: true, pants: "#fff", boots: "#fff" })),
  ] },
  { id: "28", name: "縫製・繊維", roles: [
    r("班長", "lead", "none", top("polo", "#eee", { wear: [{ kind: "apronLong", tone: "#333" }], armband: true })),
    r("作業員", "new", "none", top("polo", "#eee", { wear: [{ kind: "apronLong", tone: "#bbb" }] })),
  ] },
  { id: "29", name: "印刷・製本", roles: [
    r("班長", "worker", "cap", top("jacket", "#333", { wear: [{ kind: "apronLong", tone: "#555" }], armband: true })),
    r("作業員", "new", "none", top("jacket", "#888", { wear: [{ kind: "apronLong", tone: "#555" }] })),
  ] },
  { id: "30", name: "プラスチック成形・包装", roles: [
    r("班長", "lead", "cap", top("jacket", "#555", { armband: true, pants: "#555" })),
    r("作業員", "new", "cap", top("jacket", "#eee", { pants: "#eee" })),
  ] },
  { id: "31", name: "解体", roles: [
    r("職長", "new", "helmet", top("jacket", "#888", { stripes: 1, mask: true, armband: true, wear: [{ kind: "hivis", tone: "#555" }], pants: "#888" })),
    r("作業員", "worker", "helmet", top("jacket", "#aaa", { mask: true, pants: "#aaa" })),
  ] },
  { id: "32", name: "配管・設備・空調", roles: [
    r("職長", "new", "helmet", top("jacket", "#333", { stripes: 1, armband: true, toolBelt: true, pants: "#333" })),
    r("若手", "worker", "helmet", top("jacket", "#ccc", { pants: "#ccc" })),
  ] },
  { id: "33", name: "内装", roles: [
    r("職長", "new", "cap", top("jacket", "#fff", { stripes: 1, armband: true, wear: [{ kind: "apronShort", tone: "#888" }], pants: "#fff" })),
    r("若手", "worker", "cap", top("jacket", "#fff", { pants: "#fff" })),
  ] },
  { id: "34", name: "パン・製菓", roles: [
    r("職長", "lead", "chef", top("chefJacket", "#fff", { neck: "scarf", wear: [{ kind: "apronLong" }] })),
    r("見習い", "new", "towel", top("chefJacket", "#fff", { wear: [{ kind: "apronShort", tone: "#ccc" }] })),
  ] },
  { id: "35", name: "精肉・鮮魚", roles: [
    r("主任", "worker", "hygiene", top("coat", "#fff", { stripes: 1, armband: true, mask: true, wear: [{ kind: "apronLong", tone: "#777" }], pants: "#fff", boots: "#fff" })),
    r("作業員", "new", "hygiene", top("coat", "#fff", { mask: true, wear: [{ kind: "apronLong", tone: "#777" }], pants: "#fff", boots: "#fff" })),
  ] },
  { id: "36", name: "畜産", roles: [
    r("農場長", "lead", "cap", top("coverall", "#555", { armband: true, pants: "#555", boots: "#444" })),
    r("従業員", "worker", "cap", top("coverall", "#eee", { gloves: "#999", pants: "#eee", boots: "#fff" })),
  ] },
  { id: "37", name: "漁船・養殖", roles: [
    r("船長", "lead", "captain", top("jacket", "#777", { wear: [{ kind: "lifeJacket", tone: "#555" }], pants: "#777", boots: "#333" })),
    r("乗組員", "worker", "knit", top("jacket", "#bbb", { wear: [{ kind: "lifeJacket", tone: "#999" }], pants: "#bbb", boots: "#333" })),
  ] },
  { id: "38", name: "引越し・宅配", roles: [
    r("リーダー", "lead", "cap", top("jacket", "#333", { armband: true, tag: "clip", gloves: "#fff", pants: "#333" })),
    r("作業員", "lead", "cap", top("polo", "#333", { gloves: "#fff", pants: "#333" })),
  ] },
  { id: "39", name: "クリーニング店", roles: [
    r("店長", "lead", "none", { wear: [{ kind: "apronLong", tone: "#333" }], neck: "tie", tag: "clip", sleeve: "#fff", pants: "#333" }),
    r("係", "new", "none", top("tunic", "#ccc", { tag: "clip", pants: "#333" })),
  ] },
  { id: "40", name: "理容・美容", roles: [
    r("店長", "lead", "none", top("tunic", "#222", { wear: [{ kind: "apronLong", tone: "#222" }], toolBelt: true, tag: "clip", pants: "#222" })),
    r("アシスタント", "new", "none", top("tunic", "#fff", { wear: [{ kind: "apronLong", tone: "#bbb" }], tag: "clip", pants: "#333" })),
  ] },
);
INDUSTRY_DRAFTS.sort((a, b) => a.id.localeCompare(b.id));
