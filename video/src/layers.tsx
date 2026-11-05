// 通しの動画を 5 つのレイヤーに分けて書き出すための仕組み（11/5 夜 作者の指示: 直すときは、そのレイヤーのその秒だけ書き出して差し替える）。
// L1 地（白地・紫の地・床・机・放り出しの光） / L2 紙芝居の箱（木の枠・扉・光の輪・ステージライト） / L3 枠の中の紙（0:00〜0:13 の白地の段もここ）
// L4 床のキャラ（人・門・吹き出し・粒） / L5 字幕（字幕・仮の札・版の札）。0 は全部を 1 度に描く（静止画の確かめ用）
import React, { createContext, useContext } from "react";

export const LayerCtx = createContext<number>(0);
export const useLayer = () => useContext(LayerCtx);
/** n のレイヤーを書き出すとき（と、全部を描くとき）だけ中身を描く */
export const L: React.FC<{ n: number; children?: React.ReactNode }> = ({ n, children }) => {
  const l = useLayer();
  return l === 0 || l === n ? <>{children}</> : null;
};
export const LAYERS = [
  { n: 1, id: "L1-ground", title: "地" },
  { n: 2, id: "L2-box", title: "紙芝居の箱" },
  { n: 3, id: "L3-paper", title: "枠の中の紙" },
  { n: 4, id: "L4-cast", title: "床のキャラ" },
  { n: 5, id: "L5-sub", title: "字幕" },
] as const;
