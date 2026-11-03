// 業種ごとの役の姿の下絵（最初の 6 業種）。作者が用意した参考の画像（業種ごとに役が並んだもの）から、
// 形と明暗で見分けられる印だけを拾って部品に置き換えた。色は灰色の明るさに置き換える。
// 印の決まりは仮の案で、会社ごとの決まり（製品仕様 §14 の④）があればそちらを先に使う。
import type { CharacterRole, HeadwearKind } from "./character";
import type { Outfit } from "./outfit";

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
